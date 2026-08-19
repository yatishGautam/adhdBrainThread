/**
 * Generated day plans, one per local date.
 *
 * Keyed by the day it plans, so regenerating a day replaces its plan rather than stacking a
 * second opinion next to the first. A plan is disposable by design — it is a suggestion that
 * was true when it was made, and the honest thing to do with a stale one is throw it away.
 */
import type { DayPlan } from '@shared/domain.js';
import { COLLECTION, type Collection, type Store } from '../Store.js';

/** What the planner has cost so far, for the running total shown next to the button. */
export interface PlanSpend {
  /** Calendar month, `YYYY-MM`. */
  month: string;
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

  async get(localDate: string): Promise<DayPlan | null> {
    return this.plans.get(localDate);
  }

  async save(plan: DayPlan): Promise<DayPlan> {
    await this.plans.put(plan);
    return plan;
  }

  /**
   * Point a block at a thread. Kept here rather than done by the caller so the plan is only ever
   * rewritten whole through one path — a block edited in place elsewhere would not be persisted.
   */
  async linkBlock(localDate: string, blockId: string, threadId: string): Promise<DayPlan> {
    const plan = await this.get(localDate);
    if (!plan) throw new Error('no plan for that day');
    const next: DayPlan = {
      ...plan,
      blocks: plan.blocks.map((block) =>
        block.id === blockId ? { ...block, threadId } : block,
      ),
    };
    return this.save(next);
  }

  async remove(localDate: string): Promise<void> {
    await this.plans.delete(localDate);
  }

  /**
   * Spend, summed from the plans themselves rather than from a separate ledger file. One less
   * thing to keep in step with reality, and deleting a plan correctly forgets what it cost.
   */
  async spend(month: string): Promise<PlanSpend> {
    const all = await this.plans.all();
    const thisMonth = all.filter((plan) => plan.localDate.startsWith(month));
    const sum = (plans: DayPlan[]): number =>
      plans.reduce((total, plan) => total + (plan.usage?.costUsd ?? 0), 0);

    return {
      month,
      plans: thisMonth.length,
      costUsd: sum(thisMonth),
      totalPlans: all.length,
      totalCostUsd: sum(all),
    };
  }
}
