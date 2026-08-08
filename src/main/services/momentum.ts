/**
 * The momentum system (§6). Replaces streaks entirely — nothing here can be "broken".
 *
 * Two rules are load-bearing and must survive any refactor:
 *  - distractions contribute ZERO, never negative. The instant logging a distraction lowers a
 *    number, the button stops being pressed and the data becomes worthless;
 *  - a day with no activity contributes 0 to the rolling average but is never *rendered* as a
 *    zero. Absence and failure must not look the same.
 */
import {
  ACTIVE_DAYS_WINDOW,
  DMS_WEIGHTS,
  MOMENTUM_ALPHA,
  WEEK_SCORE_LIFT,
} from '@shared/constants.js';
import type { Band, BandId, DayRollup } from '@shared/analytics.js';

export function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

export interface DmsInput {
  sessionsStarted: number;
  focusMs: number;
  stepsCompleted: number;
  threadsCompleted: number;
}

/**
 * Note the weighting: three sessions started with nothing finished scores 35. That is
 * deliberate — starting is the behaviour being reinforced, not finishing.
 */
export function dailyMomentumScore(input: DmsInput): number {
  const { sessionStarted, focusMinute, stepCompleted, threadCompleted } = DMS_WEIGHTS;
  const total =
    Math.min(input.sessionsStarted * sessionStarted.points, sessionStarted.cap) +
    Math.min((input.focusMs / 60_000) * focusMinute.points, focusMinute.cap) +
    Math.min(input.stepsCompleted * stepCompleted.points, stepCompleted.cap) +
    Math.min(input.threadsCompleted * threadCompleted.points, threadCompleted.cap);
  return Math.round(clamp(total, 0, 100));
}

/** M(t) = alpha * score(t) + (1 - alpha) * M(t-1). A bad day dents rather than resets. */
export function rollingMomentum(scores: number[], alpha: number): number[] {
  const out: number[] = [];
  let previous = 0;
  for (const score of scores) {
    previous = alpha * score + (1 - alpha) * previous;
    out.push(Math.round(previous));
  }
  return out;
}

export function dayMomentumSeries(dailyScores: number[]): number[] {
  return rollingMomentum(dailyScores, MOMENTUM_ALPHA.day);
}

/** The 1.4 lift keeps a normal five-day week from reading as a failing grade because of weekends. */
export function weekScore(dailyScoresInWeek: number[]): number {
  if (dailyScoresInWeek.length === 0) return 0;
  const mean = dailyScoresInWeek.reduce((sum, value) => sum + value, 0) / dailyScoresInWeek.length;
  return Math.round(clamp(mean * WEEK_SCORE_LIFT, 0, 100));
}

export function monthScore(weeklyScoresInMonth: number[]): number {
  if (weeklyScoresInMonth.length === 0) return 0;
  const mean =
    weeklyScoresInMonth.reduce((sum, value) => sum + value, 0) / weeklyScoresInMonth.length;
  return Math.round(clamp(mean, 0, 100));
}

const BANDS: ReadonlyArray<{ max: number; id: BandId; label: string }> = [
  // "Resting", not "Inactive" or "Low" — this is the difference between a dashboard you open on
  // a bad week and one you avoid.
  { max: 14, id: 'resting', label: 'Resting' },
  { max: 34, id: 'warming', label: 'Warming up' },
  { max: 59, id: 'rolling', label: 'Rolling' },
  { max: 79, id: 'flow', label: 'In flow' },
  { max: 100, id: 'lit', label: 'Lit' },
];

export function bandFor(momentum: number): Band {
  const value = clamp(Math.round(momentum), 0, 100);
  const match = BANDS.find((band) => value <= band.max) ?? BANDS[BANDS.length - 1];
  return { id: match!.id, label: match!.label };
}

/** A count, never a chain. It cannot be broken, only slowly changed. */
export function activeDays(
  rollups: Record<string, DayRollup>,
  dates: string[],
): { active: number; window: number } {
  const window = dates.slice(-ACTIVE_DAYS_WINDOW);
  const active = window.filter((date) => {
    const rollup = rollups[date];
    return Boolean(rollup && rollup.sessionsStarted > 0);
  }).length;
  return { active, window: window.length };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
