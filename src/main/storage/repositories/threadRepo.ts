import { AUTO_ARCHIVE_AFTER_DAYS } from '@shared/constants.js';
import type { Step, Thread, ThreadStatus } from '@shared/domain.js';
import type { DonePage, DoneQuery } from '@shared/ipc/channels.js';
import { ulid } from '@shared/ids.js';
import { addLocalDays } from '@shared/time.js';
import { COLLECTION } from '../collections.js';
import type { Clock } from '../clock.js';
import type { CollectionHandle, ShardedStore } from '../ShardedStore.js';
import { nextOrder, orderAfter, reorder, sortByOrder } from '../stepOrder.js';

export class ThreadRepo {
  constructor(
    private readonly store: ShardedStore,
    private readonly clock: Clock,
  ) {}

  private get active(): CollectionHandle<Thread> {
    return this.store.collection<Thread>(COLLECTION.activeThreads);
  }

  private get archive(): CollectionHandle<Thread> {
    return this.store.collection<Thread>(COLLECTION.archivedThreads);
  }

  async list(): Promise<Thread[]> {
    const threads = await this.active.all();
    return threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Thread | null> {
    return (await this.active.get(id)) ?? (await this.archive.get(id));
  }

  async create(title: string, notes = ''): Promise<Thread> {
    const now = this.clock.now();
    const thread: Thread = {
      id: ulid(),
      title: title.trim(),
      notes,
      status: 'idle',
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

  /** Routes to active.json or the archive shards depending on `archived`. */
  async save(thread: Thread): Promise<Thread> {
    const next: Thread = { ...thread, updatedAt: this.clock.now() };
    if (next.archived) {
      await this.archive.put(next);
      await this.active.delete(next.id);
    } else {
      await this.active.put(next);
    }
    return next;
  }

  async remove(id: string): Promise<void> {
    await this.active.delete(id);
    await this.archive.delete(id);
  }

  async setStatus(id: string, status: ThreadStatus, waitingOn?: string): Promise<Thread> {
    const thread = await this.require(id);
    const next: Thread = { ...thread, status };
    if (status === 'waiting') next.waitingOn = waitingOn?.trim() || thread.waitingOn || '';
    else delete next.waitingOn;

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

  // ------------------------------------------------------------- done + archive

  /**
   * Walks archive shards newest-first rather than loading the whole archive, so "load more"
   * costs one shard read.
   */
  async donePage({ before, limit }: DoneQuery): Promise<DonePage> {
    const collected = (await this.list()).filter((thread) => thread.status === 'done');
    const shardIds = this.archive.shards().map((shard) => shard.id);
    let cursor = 0;
    while (collected.length <= limit && cursor < shardIds.length) {
      const shardId = shardIds[cursor];
      cursor += 1;
      if (!shardId) break;
      const records = await this.archive.recordsIn(shardId);
      collected.push(...records.filter((thread) => thread.status === 'done'));
    }

    const sorted = collected
      .filter((thread) => !before || (thread.completedLocalDate ?? '') < before)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

    return {
      threads: sorted.slice(0, limit),
      hasMore: sorted.length > limit || cursor < shardIds.length,
    };
  }

  /** Keeps active.json small: threads completed long ago move into archive shards on boot. */
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
