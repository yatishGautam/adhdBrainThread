/**
 * Generated day plans, one per local date.
 *
 * Keyed by the day it plans, so regenerating a day replaces its plan rather than stacking a
 * second opinion next to the first. A plan is disposable by design — it is a suggestion that
 * was true when it was made, and the honest thing to do with a stale one is throw it away.
 */
import type { DayPlan, PlanBlock, WeekPlan } from '@shared/domain.js';
import { insertBlock, resequenceBlocks } from '@shared/planLayout.js';
import { weekKeyOf } from '@shared/week.js';
import { COLLECTION, type Collection, type Store } from '../Store.js';

/** The day's frame for a plan created by hand, taken from settings by the caller. */
export interface PlanShell {
  wakeTime: string;
  startTime: string;
  endTime: string;
}

/** Wall-clock order. A hand edit must not leave 14:00 rendered above 09:00. */
function sortBlocks(blocks: PlanBlock[]): PlanBlock[] {
  const minutes = (time: string): number => {
    const [hour = 0, minute = 0] = time.split(':').map(Number);
    return hour * 60 + minute;
  };
  return [...blocks].sort((a, b) => minutes(a.start) - minutes(b.start));
}

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

  /**
   * Every plan between two local dates, in date order.
   *
   * By date rather than by week key, because the calendar's ranges do not respect week
   * boundaries — a month grid starts on whatever Monday the 1st falls after, and a week read
   * across a year boundary spans two week-key partitions.
   */
  async range(from: string, to: string): Promise<DayPlan[]> {
    const all = await this.plans.all();
    return all
      .filter((plan) => !plan.deletedAt && plan.localDate >= from && plan.localDate <= to)
      .sort((a, b) => a.localDate.localeCompare(b.localDate));
  }

  /**
   * The runs for a set of week keys.
   *
   * By key rather than by the dates a run covers, because `fromDate`/`toDate` are the window
   * that run *planned* — pressed on a Thursday they read Thursday to Sunday. Matching a
   * Monday-to-Wednesday range against those would find no run for a week that plainly has one.
   */
  async weeksFor(weekKeys: string[]): Promise<WeekPlan[]> {
    const wanted = new Set(weekKeys);
    const all = await this.weeks.all();
    return all
      .filter((plan) => !plan.deletedAt && wanted.has(plan.weekKey))
      .sort((a, b) => a.weekKey.localeCompare(b.weekKey));
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
   * Rewrite one block by hand, or add a new one.
   *
   * Every hand edit stamps `pinned: true` — the contract `promoted` earns by starting work,
   * earned here by touch. The server carries pinned blocks across a regeneration untouched, so
   * an edited block is owned rather than replaced. Written through the tracked collection so
   * the edit is queued for push; blocks are re-sorted so the list still reads as a day.
   */
  async editBlock(localDate: string, block: PlanBlock, shell?: PlanShell): Promise<DayPlan> {
    const plan = (await this.get(localDate)) ?? this.emptyPlan(localDate, shell);
    const edited: PlanBlock = { ...block, pinned: true };
    const rest = plan.blocks.filter((candidate) => candidate.id !== block.id);
    const next: DayPlan = {
      ...plan,
      blocks: sortBlocks([...rest, edited]),
      updatedAt: new Date().toISOString(),
    };
    return this.save(next);
  }

  /**
   * Put the day's blocks in a new order.
   *
   * The reordering itself lives in `@shared/planLayout` so the phone and the laptop agree on
   * where a dragged block lands. Here it is only persistence — written through the tracked
   * collection like any hand edit, and re-sorted afterwards because the times changed under it.
   */
  async reorderBlocks(localDate: string, blockIds: string[]): Promise<DayPlan> {
    const plan = await this.get(localDate);
    if (!plan) throw new Error('There is no plan for that day.');
    const next: DayPlan = {
      ...plan,
      blocks: sortBlocks(resequenceBlocks(plan.blocks, blockIds)),
      updatedAt: new Date().toISOString(),
    };
    return this.save(next);
  }

  /**
   * Open a new slot at a position in the day, pushing what follows if it has to.
   *
   * A day that was never planned still gets one: opening a slot on an empty Thursday is a
   * perfectly good way to start planning it, and refusing would send you to the generator for
   * a single errand.
   */
  async insertBlock(
    localDate: string,
    index: number,
    block: PlanBlock,
    shell?: PlanShell,
  ): Promise<DayPlan> {
    const plan = (await this.get(localDate)) ?? this.emptyPlan(localDate, shell);
    const next: DayPlan = {
      ...plan,
      blocks: sortBlocks(insertBlock(plan.blocks, index, block)),
      updatedAt: new Date().toISOString(),
    };
    return this.save(next);
  }

  /** Remove one block. The day keeps its plan — an emptied plan is still a decision. */
  async deleteBlock(localDate: string, blockId: string): Promise<DayPlan | null> {
    const plan = await this.get(localDate);
    if (!plan) return null;
    const next: DayPlan = {
      ...plan,
      blocks: plan.blocks.filter((block) => block.id !== blockId),
      updatedAt: new Date().toISOString(),
    };
    return this.save(next);
  }

  /**
   * Move a block to another day. It lands pinned — moving is the strongest possible edit — and
   * the target day gets a plan shell if it never had one, because "Thursday, but really Friday"
   * must not depend on Friday having been planned.
   */
  async moveBlock(
    fromDate: string,
    toDate: string,
    blockId: string,
    shell?: PlanShell,
  ): Promise<{ from: DayPlan | null; to: DayPlan }> {
    const source = await this.get(fromDate);
    const block = source?.blocks.find((candidate) => candidate.id === blockId);
    if (!source || !block) throw new Error('That block is no longer in the plan.');

    const from = await this.deleteBlock(fromDate, blockId);
    const to = await this.editBlock(toDate, block, shell);
    return { from, to };
  }

  private emptyPlan(localDate: string, shell?: PlanShell): DayPlan {
    const now = new Date().toISOString();
    return {
      localDate,
      weekKey: weekKeyOf(localDate),
      generatedAt: now,
      wakeTime: shell?.wakeTime ?? '07:00',
      startTime: shell?.startTime ?? '09:00',
      endTime: shell?.endTime ?? '18:00',
      blocks: [],
      headline: '',
      updatedAt: now,
    };
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
