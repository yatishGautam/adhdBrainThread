/**
 * Deriving "now" from a plan and a run.
 *
 * Nothing here is stored. Which block is current, what comes next, how far through the day you
 * are — all of it falls out of (plan, run, clock), so the phone and the laptop can never
 * disagree about it while holding the same records. This is the third pure module ported
 * rule-for-rule across the repos, after week keys and the calendar projection, and it carries
 * its tests across the same way.
 *
 * The shift rule, stated once: a block whose ORIGINAL start is at or after `shiftFrom` slides
 * by `shiftMs`; everything earlier stays put. The anchor is what keeps the derivation stable —
 * sliding "whatever is ahead at read time" would render the same records differently as the
 * clock advances, and sliding everything would rewrite the finished morning.
 */
import type { DayPlan, DayRun, PlanBlock } from './domain.js';

export interface EffectiveBlock {
  block: PlanBlock;
  /** Minutes from midnight, after the shift. */
  start: number;
  end: number;
  skipped: boolean;
}

export interface DayProgress {
  /** The block whose effective window contains the clock. Null between blocks or after hours. */
  current: EffectiveBlock | null;
  /** The next unskipped block still ahead, whether or not something is current. */
  next: EffectiveBlock | null;
  /** 1-based position of `current` among unskipped blocks, for "block 3 of 9". 0 when none. */
  position: number;
  /** Unskipped blocks in the day. */
  total: number;
  /** Unskipped, unstarted blocks whose effective window has fully passed. */
  slipped: EffectiveBlock[];
}

/** Plan blocks with the run's shift and skips applied, in effective time order. */
export function effectiveBlocks(plan: DayPlan, run: DayRun | null): EffectiveBlock[] {
  const shiftMinutes = run ? Math.round(run.shiftMs / 60_000) : 0;
  const anchor = run?.shiftFrom ? toMinutes(run.shiftFrom) : null;
  const skipped = new Set(run?.skippedBlockIds ?? []);

  return plan.blocks
    .map((block) => {
      const slides = anchor !== null && toMinutes(block.start) >= anchor;
      const offset = slides ? shiftMinutes : 0;
      return {
        block,
        start: toMinutes(block.start) + offset,
        end: toMinutes(block.end) + offset,
        skipped: skipped.has(block.id),
      };
    })
    .sort((a, b) => a.start - b.start);
}

/**
 * Where the day stands at a given wall-clock minute.
 *
 * `slipped` is the honest list: blocks that came and went without being skipped on purpose.
 * The UI turns it into one quiet reconciliation offer — shift, replan, or let them go — never
 * into ambient guilt.
 */
export function dayProgress(plan: DayPlan, run: DayRun | null, nowMinutes: number): DayProgress {
  const blocks = effectiveBlocks(plan, run);
  const live = blocks.filter((entry) => !entry.skipped);

  const current = live.find((entry) => entry.start <= nowMinutes && nowMinutes < entry.end) ?? null;
  const next = live.find((entry) => entry.start > nowMinutes) ?? null;
  const slipped = live.filter((entry) => entry.end <= nowMinutes && entry !== current);

  return {
    current,
    next,
    position: current ? live.indexOf(current) + 1 : 0,
    total: live.length,
    slipped,
  };
}

/**
 * Fold one more "running late" press into a run.
 *
 * The anchor moves to the current moment's frontier: the first live block that has not yet
 * ended. Everything from there slides by the accumulated shift; the blocks already behind the
 * clock are past mending and stay where they were. Pressing it twice accumulates — fifteen
 * late and then fifteen more is thirty.
 */
export function applyShift(
  plan: DayPlan,
  run: DayRun,
  deltaMs: number,
  nowMinutes: number,
): DayRun {
  const frontier = effectiveBlocks(plan, run)
    .filter((entry) => !entry.skipped)
    .find((entry) => entry.end > nowMinutes);

  return {
    ...run,
    shiftMs: run.shiftMs + deltaMs,
    // The anchor is the block's ORIGINAL start — the derivation always shifts from originals,
    // so anchoring at its shifted position would double-apply on the next read.
    ...(frontier ? { shiftFrom: frontier.block.start } : {}),
    updatedAt: new Date().toISOString(),
  };
}

export function toMinutes(time: string): number {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return hour * 60 + minute;
}

/** `570` → `"09:30"`, clamped to the day. */
export function toClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}
