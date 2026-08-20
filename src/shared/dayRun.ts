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
 * clock advances.
 *
 * Two scopes press against that anchor. `rest` is running late: the hours still ahead move and
 * the finished morning stays where it was actually lived. `day` is the whole stack — you got
 * ready twenty minutes slow, or you caught the time back up, and the entire day is simply a
 * different shape of the same day. `day` anchors at midnight, so nothing is left behind.
 *
 * Whichever scope you press, the anchor only ever moves EARLIER. One record holds one anchor
 * and one total, so letting the anchor advance while the total accumulated would strand the
 * blocks behind it at their unshifted times while everything ahead jumped by the sum — the
 * morning folding back on top of the afternoon, the same clock times printed twice.
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

/** How much of the day a nudge picks up. */
export type ShiftScope = 'rest' | 'day';

/** The whole-stack anchor: earlier than any block, so every block slides. */
const DAY_START = '00:00';

/**
 * Fold one more nudge into a run.
 *
 * `rest` anchors at the current moment's frontier — the first live block that has not yet
 * ended — so the hours ahead move and the ones already behind the clock stay where they were
 * actually lived. `day` anchors at midnight and moves the entire stack, in either direction:
 * running twenty late from the moment you woke, or handing that twenty back when the drive
 * turned out shorter than the plan feared.
 *
 * Pressing accumulates — fifteen late and then fifteen more is thirty — and a total that lands
 * back on zero drops the anchor with it, because a day back on plan is not anchored to
 * anything. The anchor itself only ever moves earlier; see the note at the top of the file for
 * why one record cannot let it advance.
 */
export function applyShift(
  plan: DayPlan,
  run: DayRun,
  deltaMs: number,
  nowMinutes: number,
  scope: ShiftScope = 'rest',
): DayRun {
  const frontier = effectiveBlocks(plan, run)
    .filter((entry) => !entry.skipped)
    .find((entry) => entry.end > nowMinutes);

  // The anchor is the block's ORIGINAL start — the derivation always shifts from originals,
  // so anchoring at its shifted position would double-apply on the next read.
  const proposed = scope === 'day' ? DAY_START : frontier?.block.start;
  const anchor = earlier(run.shiftFrom, proposed);
  const shiftMs = run.shiftMs + deltaMs;

  const { shiftFrom: _replaced, ...rest } = run;
  return {
    ...rest,
    shiftMs,
    ...(shiftMs !== 0 && anchor ? { shiftFrom: anchor } : {}),
    updatedAt: new Date().toISOString(),
  };
}

/** The earlier of two anchors, tolerating either being absent. */
function earlier(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return toMinutes(a) <= toMinutes(b) ? a : b;
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
