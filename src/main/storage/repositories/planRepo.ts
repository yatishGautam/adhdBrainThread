/**
 * Generated day plans, one per local date.
 *
 * Keyed by the day it plans, so regenerating a day replaces its plan rather than stacking a
 * second opinion next to the first. A plan is disposable by design — it is a suggestion that
 * was true when it was made, and the honest thing to do with a stale one is throw it away.
 */
import type { DayPlan, WeekPlan } from '@shared/domain.js';
import { COLLECTION, type Collection, type Store } from '../Store.js';

/** What the planner has cost so far, for the running total shown next to the button. */
export interface PlanSpend {
  /** Calendar month, `YYYY-MM`. */
  month: string;
  /** Generation runs this month, not days planned — one press of the button is one run. */
  plans: number;
  costUsd: number;
  /** Every plan ever generated, for the all-time figure. */
  totalPlans: number;
  totalCostUsd: number;
}

export class PlanRepo {
  constructor(private readonly store: Store) {}

  private get plans(): Collection<DayPlan> {
    return this.store.collection<DayPlan>(COLLECTION.plans);
  }

  private get weeks(): Collection<WeekPlan> {
    return this.store.collection<WeekPlan>(COLLECTION.weekPlans);
  }

  /**
   * Untracked views of the same collections, for writing records that came *from* the server.
   * Queueing those for push would send them straight back and burn a round trip settling a
   * conflict with ourselves — the sync engine takes the same route when it merges a pull.
   */
  private get plansUntracked(): Collection<DayPlan> {
    return this.store.collection<DayPlan>(COLLECTION.plans, { track: false });
  }

  private get weeksUntracked(): Collection<WeekPlan> {
    return this.store.collection<WeekPlan>(COLLECTION.weekPlans, { track: false });
  }

  async getWeek(weekKey: string): Promise<WeekPlan | null> {
    const plan = await this.weeks.get(weekKey);
    return plan && !plan.deletedAt ? plan : null;
  }

  /** Every day of a week that still has a plan, in date order. */
  async listWeekDays(weekKey: string): Promise<DayPlan[]> {
    const all = await this.plans.all();
    return all
      .filter((plan) => plan.weekKey === weekKey && !plan.deletedAt)
      .sort((a, b) => a.localDate.localeCompare(b.localDate));
  }

  /**
   * Store one generation run: the week record and every day it produced.
   *
   * Days of the same week that this run did *not* produce are tombstoned. The server does the
   * same thing, and for the same reason: if Thursday had a plan and the new run decided Thursday
   * is a rest day, leaving the old Thursday on screen shows a block list nothing generated.
   */
  async saveWeek(week: WeekPlan, days: DayPlan[]): Promise<void> {
    const produced = new Set(days.map((plan) => plan.localDate));
    const stale = (await this.listWeekDays(week.weekKey)).filter(
      (plan) => !produced.has(plan.localDate) && plan.localDate >= week.fromDate,
    );

    for (const plan of stale) {
      await this.plansUntracked.put({ ...plan, deletedAt: week.generatedAt });
    }
    for (const plan of days) {
      await this.plansUntracked.put(plan);
    }
    await this.weeksUntracked.put(week);
  }

  /** A thrown-away plan reads as no plan. The tombstone stays on disk for the next push. */
  async get(localDate: string): Promise<DayPlan | null> {
    const plan = await this.plans.get(localDate);
    return plan && !plan.deletedAt ? plan : null;
  }

  async save(plan: DayPlan): Promise<DayPlan> {
    await this.plans.put(plan);
    return plan;
  }

  /**
   * Point a block at a thread. Kept here rather than done by the caller so the plan is only ever
   * rewritten whole through one path — a block edited in place elsewhere would not be persisted.
   *
   * `promoted` is stamped alongside the id, and is the more important of the two. It is what
   * tells the next generation that this hour is spoken for: the server carries promoted blocks
   * across a regeneration untouched, so planning again on Friday cannot orphan the thread you
   * started on Wednesday. `updatedAt` moves too, because this write has to reach the server for
   * that to happen at all.
   */
  async linkBlock(localDate: string, blockId: string, threadId: string): Promise<DayPlan> {
    const plan = await this.get(localDate);
    if (!plan) throw new Error('no plan for that day');
    const next: DayPlan = {
      ...plan,
      blocks: plan.blocks.map((block) =>
        block.id === blockId ? { ...block, threadId, promoted: true } : block,
      ),
      updatedAt: new Date().toISOString(),
    };
    return this.save(next);
  }

  /**
   * Throw a day's plan away.
   *
   * A tombstone rather than a delete, and written through the *tracked* collection so it is
   * queued for push. This is the one thing a client authors about a plan, and it has to reach
   * the other device — a local-only delete is a plan that reappears on the next pull.
   */
  async remove(localDate: string): Promise<void> {
    const plan = await this.plans.get(localDate);
    if (!plan) return;
    await this.plans.put({
      ...plan,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Spend, summed from the runs themselves rather than from a separate ledger file. One less
   * thing to keep in step with reality, and deleting a plan correctly forgets what it cost.
   *
   * Summed over `weekPlans`, not `plans`: one press of the button is one API call that produces
   * up to seven days, so counting per day would report several times the real bill. Old local
   * day plans still carry their own `usage` and are added in — dropping them would make the
   * all-time figure quietly shrink the first time this version ran.
   */
  async spend(month: string): Promise<PlanSpend> {
    const weeks = (await this.weeks.all()).filter((plan) => !plan.deletedAt);
    // Pre-server plans only: anything with a `weekKey` was paid for by its run. Tombstoned ones
    // drop out with everything else — throwing a plan away forgets what it cost, which is the
    // whole reason spend is summed from the records rather than kept in a ledger.
    const legacy = (await this.plans.all()).filter(
      (plan) => !plan.weekKey && plan.usage && !plan.deletedAt,
    );

    const inMonth = <T extends { costUsd: number; month: string }>(entry: T): boolean =>
      entry.month === month;
    const runs = [
      ...weeks.map((plan) => ({ month: plan.generatedAt.slice(0, 7), costUsd: plan.usage.costUsd })),
      ...legacy.map((plan) => ({
        month: plan.localDate.slice(0, 7),
        costUsd: plan.usage?.costUsd ?? 0,
      })),
    ];
    const thisMonth = runs.filter(inMonth);
    const sum = (entries: { costUsd: number }[]): number =>
      entries.reduce((total, entry) => total + entry.costUsd, 0);

    return {
      month,
      plans: thisMonth.length,
      costUsd: sum(thisMonth),
      totalPlans: runs.length,
      totalCostUsd: sum(runs),
    };
  }
}
