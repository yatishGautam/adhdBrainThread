import { AUTO_ARCHIVE_AFTER_DAYS, ORDER_STEP } from '@shared/constants.js';
import type { Step, Thread, ThreadStatus } from '@shared/domain.js';
import type { DonePage, DoneQuery } from '@shared/ipc/channels.js';
import { ulid } from '@shared/ids.js';
import { addLocalDays } from '@shared/time.js';
import type { Clock } from '../clock.js';
import { COLLECTION, type Collection, type Store } from '../Store.js';
import { nextOrder, orderAfter, reorder, sortByOrder } from '../stepOrder.js';

export class ThreadRepo {
  constructor(
    private readonly store: Store,
    private readonly clock: Clock,
  ) {}

  private get threads(): Collection<Thread> {
    return this.store.collection<Thread>(COLLECTION.threads);
  }

  async list(): Promise<Thread[]> {
    const threads = await this.live();
    return threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Everything that has not been deleted. A tombstone is a real record on disk — it has to be,
   * or another device never learns about the delete — so every read path starts here rather
   * than at the collection.
   */
  private async live(): Promise<Thread[]> {
    return (await this.threads.all()).filter((thread) => !thread.deletedAt);
  }

  /** On the board (§2): not done, not dormant. This is the list the cap of 5 applies to. */
  async activeList(): Promise<Thread[]> {
    const threads = await this.list();
    return threads.filter((thread) => thread.status !== 'done' && thread.status !== 'dormant');
  }

  async dormantList(): Promise<Thread[]> {
    const threads = await this.list();
    return threads.filter((thread) => thread.status === 'dormant');
  }

  async get(id: string): Promise<Thread | null> {
    const thread = await this.threads.get(id);
    return thread && !thread.deletedAt ? thread : null;
  }

  async create(title: string, notes = ''): Promise<Thread> {
    const now = this.clock.now();
    const board = await this.activeList();
    const thread: Thread = {
      id: ulid(),
      title: title.trim(),
      notes,
      // A thread you just made is a thread you are on. Focus Tracker has no separate "idle".
      status: 'in_progress',
      order: nextOrder(withOrders(board)),
      steps: [],
      createdAt: now,
      updatedAt: now,
      totalFocusMs: 0,
      sessionCount: 0,
      distractionCount: 0,
      archived: false,
    };
    await this.save(thread);
    return thread;
  }

  async save(thread: Thread): Promise<Thread> {
    const next: Thread = { ...thread, updatedAt: this.clock.now() };
    await this.threads.put(next);
    return next;
  }

  /**
   * Leaves a tombstone rather than removing the record. A thread that simply stops existing
   * looks identical to one the server has never seen, so it comes back the next time the phone
   * syncs — deletes have to be something a client can *receive*.
   */
  async remove(id: string): Promise<void> {
    const thread = await this.threads.get(id);
    if (!thread) return;
    const now = this.clock.now();
    await this.threads.put({ ...thread, updatedAt: now, deletedAt: now });
  }

  async setStatus(id: string, status: ThreadStatus, waitingOn?: string): Promise<Thread> {
    const thread = await this.require(id);
    const next: Thread = { ...thread, status };
    // Blocked and Waiting both record what they are stuck on — an unrecorded blocker gets lost.
    if (status === 'waiting' || status === 'blocked') {
      next.waitingOn = waitingOn?.trim() || thread.waitingOn || '';
    } else {
      delete next.waitingOn;
    }

    // Coming back onto the board from Done or Dormant means joining the end of the active list.
    if (
      status !== 'done' &&
      status !== 'dormant' &&
      (thread.status === 'done' || thread.status === 'dormant')
    ) {
      next.order = nextOrder(withOrders(await this.activeList()));
    }

    if (status === 'done') {
      next.completedAt = this.clock.now();
      next.completedLocalDate = this.clock.today();
    } else {
      // Reopening is allowed and simply clears the completion stamp.
      delete next.completedAt;
      delete next.completedLocalDate;
    }
    return this.save(next);
  }

  // ------------------------------------------------------------------ steps

  async addStep(threadId: string, text: string, afterStepId?: string): Promise<Thread> {
    const thread = await this.require(threadId);
    const step: Step = {
      id: ulid(),
      text: text.trim(),
      done: false,
      order: afterStepId ? orderAfter(thread.steps, afterStepId) : nextOrder(thread.steps),
    };
    return this.save({ ...thread, steps: sortByOrder([...thread.steps, step]) });
  }

  async toggleStep(threadId: string, stepId: string): Promise<Thread> {
    const thread = await this.require(threadId);
    const steps = thread.steps.map((step) => {
      if (step.id !== stepId) return step;
      if (step.done) {
        const { completedAt: _a, completedLocalDate: _b, ...rest } = step;
        return { ...rest, done: false };
      }
      return {
        ...step,
        done: true,
        completedAt: this.clock.now(),
        completedLocalDate: this.clock.today(),
      };
    });
    return this.save({ ...thread, steps });
  }

  async updateStep(threadId: string, stepId: string, text: string): Promise<Thread> {
    const thread = await this.require(threadId);
    const steps = thread.steps.map((step) => (step.id === stepId ? { ...step, text } : step));
    return this.save({ ...thread, steps });
  }

  async removeStep(threadId: string, stepId: string): Promise<Thread> {
    const thread = await this.require(threadId);
    return this.save({ ...thread, steps: thread.steps.filter((step) => step.id !== stepId) });
  }

  async reorderStep(threadId: string, stepId: string, toIndex: number): Promise<Thread> {
    const thread = await this.require(threadId);
    const { items } = reorder(thread.steps, stepId, toIndex);
    return this.save({ ...thread, steps: items });
  }

  // --------------------------------------------------------------- board order

  /**
   * Drag-and-drop (§2). Moving between Active and Dormant is the same gesture as reordering,
   * so `status` and position are set in one write rather than two.
   */
  async reorderOnBoard(id: string, toIndex: number, status?: ThreadStatus): Promise<Thread[]> {
    const thread = await this.require(id);
    const target = status ?? thread.status;
    const intoDormant = target === 'dormant';

    // Everything already in the list the thread is landing in.
    const siblings = boardOrder(
      (await this.list()).filter(
        (other) =>
          other.id !== id &&
          other.status !== 'done' &&
          (other.status === 'dormant') === intoDormant,
      ),
    );

    const moved: Thread = { ...thread, status: target };
    const { items } = reorder(withOrders([...siblings, moved]), id, toIndex);
    const orders = new Map(items.map((item) => [item.id, item.order]));

    const written: Thread[] = [];
    for (const candidate of [...siblings, moved]) {
      const order = orders.get(candidate.id);
      if (order === undefined) continue;
      const current = await this.get(candidate.id);
      // Only rewrite records that actually changed — a drag should not touch the whole board.
      if (current && current.order === order && current.status === candidate.status) continue;
      written.push(await this.save({ ...candidate, order }));
    }
    return written;
  }

  // ----------------------------------------------------------------- done

  /**
   * The done pile, newest first. This used to walk archive shards to avoid loading the whole
   * archive; there is one threads file now and it is already in memory, so it is a filter and
   * a slice.
   */
  async donePage({ before, limit }: DoneQuery): Promise<DonePage> {
    const done = (await this.live())
      .filter((thread) => thread.status === 'done')
      .filter((thread) => !before || (thread.completedLocalDate ?? '') < before)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

    return { threads: done.slice(0, limit), hasMore: done.length > limit };
  }

  /**
   * Marks long-finished threads archived on boot. This used to move them into separate shard
   * files to keep active.json small; there is one file now, so the flag is only a marker for
   * anything that wants to tell old completions from recent ones.
   */
  async archiveStale(): Promise<number> {
    const cutoff = addLocalDays(this.clock.today(), -AUTO_ARCHIVE_AFTER_DAYS);
    const stale = (await this.list()).filter(
      (thread) =>
        thread.status === 'done' && !thread.archived && (thread.completedLocalDate ?? '') < cutoff,
    );
    for (const thread of stale) await this.save({ ...thread, archived: true });
    return stale.length;
  }

  private async require(id: string): Promise<Thread> {
    const thread = await this.get(id);
    if (!thread) throw new Error(`thread not found: ${id}`);
    return thread;
  }
}

/**
 * Manual board order, with a stable fallback for threads written before `order` existed:
 * most-recently-touched first, which is what the board sorted by anyway.
 */
export function boardOrder(threads: Thread[]): Thread[] {
  return [...threads].sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
    if (a.order !== undefined) return -1;
    if (b.order !== undefined) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** Fills in an order for legacy records so `reorder()` has a total ordering to work with. */
function withOrders(threads: Thread[]): { id: string; order: number }[] {
  return boardOrder(threads).map((thread, index) => ({
    id: thread.id,
    order: thread.order ?? (index + 1) * ORDER_STEP,
  }));
}
