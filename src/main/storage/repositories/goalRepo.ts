/**
 * Weekly goals.
 *
 * Deliberately close to `Todo` in shape and unlike `Thread` in spirit: a goal has no status, no
 * session history and no completion ceremony. It is a line you tick. The one thing it has that
 * a todo does not is `context` — freeform text nobody has to write, which exists so the planner
 * has something to reason from beyond five words.
 *
 * Nothing here carries goals forward automatically. An unfinished goal quietly reappearing every
 * Monday is how a list becomes a debt ledger, and this app's whole premise is that nothing
 * accumulates as debt — so rolling one over is a button the user presses, per goal.
 */
import type { Goal } from '@shared/domain.js';
import { ulid } from '@shared/ids.js';
import { weekKeyOf } from '@shared/week.js';
import type { Clock } from '../clock.js';
import { COLLECTION, type Collection, type Store } from '../Store.js';
import { nextOrder, reorder, sortByOrder } from '../stepOrder.js';

export class GoalRepo {
  constructor(
    private readonly store: Store,
    private readonly clock: Clock,
  ) {}

  private get goals(): Collection<Goal> {
    return this.store.collection<Goal>(COLLECTION.goals);
  }

  /** See `ThreadRepo.live` — a tombstone is a real record, so every read starts by filtering. */
  private async live(): Promise<Goal[]> {
    return (await this.goals.all()).filter((goal) => !goal.deletedAt);
  }

  /** The week key for today, in the user's timezone. */
  currentWeek(): string {
    return weekKeyOf(this.clock.today());
  }

  async list(weekKey?: string): Promise<Goal[]> {
    const key = weekKey ?? this.currentWeek();
    return sortByOrder((await this.live()).filter((goal) => goal.weekKey === key));
  }

  /** Every week that has a goal on it, newest first — for the week picker. */
  async weeks(): Promise<string[]> {
    const keys = new Set((await this.live()).map((goal) => goal.weekKey));
    return [...keys].sort().reverse();
  }

  async get(id: string): Promise<Goal | null> {
    const goal = await this.goals.get(id);
    return goal && !goal.deletedAt ? goal : null;
  }

  async add(title: string, weekKey?: string): Promise<Goal> {
    const key = weekKey ?? this.currentWeek();
    const now = this.clock.now();
    const goal: Goal = {
      id: ulid(),
      title: title.trim(),
      done: false,
      context: '',
      weekKey: key,
      order: nextOrder(await this.list(key)),
      createdAt: now,
      updatedAt: now,
    };
    await this.write(goal);
    return goal;
  }

  async update(id: string, patch: Partial<Pick<Goal, 'title' | 'context'>>): Promise<Goal> {
    const goal = await this.require(id);
    const next: Goal = {
      ...goal,
      ...(patch.title === undefined ? {} : { title: patch.title.trim() }),
      ...(patch.context === undefined ? {} : { context: patch.context }),
      updatedAt: this.clock.now(),
    };
    await this.write(next);
    return next;
  }

  /**
   * Ticking a goal stamps the local date as well as the timestamp, for the same reason every
   * other record does: a completion bucketed by re-deriving a local day from UTC lands on the
   * wrong side of a DST boundary about twice a year.
   */
  async toggle(id: string): Promise<Goal> {
    const goal = await this.require(id);
    const done = !goal.done;
    const now = this.clock.now();

    // Destructured out rather than set to undefined: un-ticking has to leave the keys *absent*,
    // and `exactOptionalPropertyTypes` aside, an explicit undefined serialises to a null the
    // schema rejects on the next read.
    const { completedAt: _was, completedLocalDate: _onDay, ...rest } = goal;

    const next: Goal = done
      ? {
          ...rest,
          done,
          updatedAt: now,
          completedAt: now,
          completedLocalDate: this.clock.today(),
        }
      : { ...rest, done, updatedAt: now };

    await this.write(next);
    return next;
  }

  async remove(id: string): Promise<void> {
    const goal = await this.get(id);
    if (!goal) return;
    // Tombstone rather than delete, so this still works when the backend learns about goals.
    await this.write({ ...goal, deletedAt: this.clock.now(), updatedAt: this.clock.now() });
  }

  async reorder(id: string, toIndex: number): Promise<Goal[]> {
    const goal = await this.require(id);
    const { items } = reorder(await this.list(goal.weekKey), id, toIndex);
    for (const item of items) {
      const current = await this.get(item.id);
      if (current && current.order !== item.order) {
        await this.write({ ...current, order: item.order, updatedAt: this.clock.now() });
      }
    }
    return this.list(goal.weekKey);
  }

  /**
   * Move an unfinished goal into another week. A copy would leave the original sitting in a
   * past week looking abandoned, so the goal itself moves and remembers where it came from.
   */
  async carryOver(id: string, toWeek: string): Promise<Goal> {
    const goal = await this.require(id);
    if (goal.weekKey === toWeek) return goal;
    const next: Goal = {
      ...goal,
      weekKey: toWeek,
      carriedFromWeek: goal.carriedFromWeek ?? goal.weekKey,
      order: nextOrder(await this.list(toWeek)),
      updatedAt: this.clock.now(),
    };
    await this.write(next);
    return next;
  }

  private async require(id: string): Promise<Goal> {
    const goal = await this.get(id);
    if (!goal) throw new Error('goal not found');
    return goal;
  }

  private async write(goal: Goal): Promise<void> {
    await this.goals.put(goal);
  }
}
