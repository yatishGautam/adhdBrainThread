/**
 * These tests travel with the port: the Swift copy asserts the same cases with the same
 * numbers, so the phone and the laptop cannot quietly diverge on what "now" means.
 */
import { describe, expect, it } from 'vitest';
import type { DayPlan, DayRun, PlanBlock } from './domain.js';
import { applyShift, dayProgress, effectiveBlocks, toMinutes } from './dayRun.js';

function block(id: string, start: string, end: string, patch: Partial<PlanBlock> = {}): PlanBlock {
  return { id, start, end, kind: 'focus', title: id, ...patch };
}

function plan(blocks: PlanBlock[]): DayPlan {
  return {
    localDate: '2026-08-20',
    generatedAt: '2026-08-20T05:00:00.000Z',
    wakeTime: '07:00',
    startTime: '09:00',
    endTime: '18:00',
    blocks,
    headline: '',
  };
}

function run(patch: Partial<DayRun> = {}): DayRun {
  return {
    localDate: '2026-08-20',
    startedAt: '2026-08-20T07:05:00.000Z',
    shiftMs: 0,
    skippedBlockIds: [],
    updatedAt: '2026-08-20T07:05:00.000Z',
    ...patch,
  };
}

const DAY = plan([
  block('a', '09:00', '09:50'),
  block('b', '10:00', '10:50'),
  block('c', '11:00', '11:50'),
]);

describe('effectiveBlocks', () => {
  it('leaves everything alone when nothing shifted', () => {
    const out = effectiveBlocks(DAY, run());
    expect(out.map((entry) => entry.start)).toEqual([540, 600, 660]);
  });

  it('slides only blocks at or after the anchor, and keeps the morning put', () => {
    const shifted = run({ shiftMs: 30 * 60_000, shiftFrom: '10:00' });
    const out = effectiveBlocks(DAY, shifted);
    expect(out.map((entry) => [entry.block.id, entry.start])).toEqual([
      ['a', 540],
      ['b', 630],
      ['c', 690],
    ]);
  });

  it('marks skips without deleting them — a skipped block is a decision, not a hole', () => {
    const out = effectiveBlocks(DAY, run({ skippedBlockIds: ['b'] }));
    expect(out.find((entry) => entry.block.id === 'b')?.skipped).toBe(true);
    expect(out).toHaveLength(3);
  });
});

describe('dayProgress', () => {
  it('finds the current block, the next one, and the honest position', () => {
    const progress = dayProgress(DAY, run(), toMinutes('10:10'));
    expect(progress.current?.block.id).toBe('b');
    expect(progress.next?.block.id).toBe('c');
    expect(progress.position).toBe(2);
    expect(progress.total).toBe(3);
  });

  it('reports the gap between blocks as no current, next still ahead', () => {
    const progress = dayProgress(DAY, run(), toMinutes('09:55'));
    expect(progress.current).toBeNull();
    expect(progress.next?.block.id).toBe('b');
  });

  it('counts what slipped, and never counts what was skipped on purpose', () => {
    const progress = dayProgress(DAY, run({ skippedBlockIds: ['a'] }), toMinutes('11:10'));
    expect(progress.slipped.map((entry) => entry.block.id)).toEqual(['b']);
    expect(progress.current?.block.id).toBe('c');
  });

  it('respects the shift when deciding what is current', () => {
    const shifted = run({ shiftMs: 30 * 60_000, shiftFrom: '10:00' });
    // 10:10 wall clock: block b originally ran 10:00-10:50 but slid to 10:30.
    expect(dayProgress(DAY, shifted, toMinutes('10:10')).current).toBeNull();
    expect(dayProgress(DAY, shifted, toMinutes('10:40')).current?.block.id).toBe('b');
  });
});

describe('applyShift', () => {
  it('anchors at the first block still ahead, in original time', () => {
    const out = applyShift(DAY, run(), 15 * 60_000, toMinutes('10:10'));
    expect(out.shiftFrom).toBe('10:00');
    expect(out.shiftMs).toBe(15 * 60_000);
  });

  it('accumulates, and holds the anchor at the first bend rather than chasing the clock', () => {
    const once = applyShift(DAY, run(), 15 * 60_000, toMinutes('09:20'));
    const twice = applyShift(DAY, once, 15 * 60_000, toMinutes('11:20'));
    expect(twice.shiftMs).toBe(30 * 60_000);
    // The frontier at 11:20 is c, but letting the anchor advance there would strand a and b at
    // their unshifted times while c jumped the full thirty — the morning printing on top of the
    // afternoon. One record holds one anchor: it stays where the day first bent.
    expect(twice.shiftFrom).toBe('09:00');
    expect(effectiveBlocks(DAY, twice).map((entry) => entry.start)).toEqual([570, 630, 690]);
  });

  it('skips do not anchor the shift', () => {
    const out = applyShift(
      DAY,
      run({ skippedBlockIds: ['b'] }),
      10 * 60_000,
      toMinutes('09:55'),
    );
    expect(out.shiftFrom).toBe('11:00');
  });

  it('moves the whole stack when the scope says so — the finished morning included', () => {
    const out = applyShift(DAY, run(), 20 * 60_000, toMinutes('11:20'), 'day');
    expect(out.shiftFrom).toBe('00:00');
    expect(effectiveBlocks(DAY, out).map((entry) => entry.start)).toEqual([560, 620, 680]);
  });

  it('moves the stack backwards too — arriving early is as real as running late', () => {
    const out = applyShift(DAY, run(), -10 * 60_000, toMinutes('08:40'), 'day');
    expect(out.shiftMs).toBe(-10 * 60_000);
    expect(effectiveBlocks(DAY, out).map((entry) => entry.start)).toEqual([530, 590, 650]);
  });

  it('keeps the whole-day anchor once claimed, so a later nudge cannot strand the morning', () => {
    const whole = applyShift(DAY, run(), 20 * 60_000, toMinutes('09:10'), 'day');
    const then = applyShift(DAY, whole, 15 * 60_000, toMinutes('10:30'));
    expect(then.shiftFrom).toBe('00:00');
    expect(effectiveBlocks(DAY, then).map((entry) => entry.start)).toEqual([575, 635, 695]);
  });

  it('drops the anchor when the day comes back to plan', () => {
    const late = applyShift(DAY, run(), 20 * 60_000, toMinutes('09:10'), 'day');
    const back = applyShift(DAY, late, -late.shiftMs, toMinutes('09:10'), 'day');
    expect(back.shiftMs).toBe(0);
    expect(back.shiftFrom).toBeUndefined();
    expect(effectiveBlocks(DAY, back).map((entry) => entry.start)).toEqual([540, 600, 660]);
  });
});
