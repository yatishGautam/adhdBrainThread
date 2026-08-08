/**
 * Turning raw events into one day's counts. Pure, so `rebuildRollups()` and the incremental
 * path run the exact same code and cannot drift (§4.6 #8).
 */
import type { DayRollup } from '@shared/analytics.js';
import type { Session, Thread } from '@shared/domain.js';
import { localHourOf } from '@shared/time.js';
import { dailyMomentumScore } from './momentum.js';

function zeros(): number[] {
  return Array.from({ length: 24 }, () => 0);
}

function bump(buckets: number[], hour: number): void {
  buckets[hour] = (buckets[hour] ?? 0) + 1;
}

export function emptyRollup(localDate: string): DayRollup {
  return {
    localDate,
    sessionsStarted: 0,
    focusMs: 0,
    stepsCompleted: 0,
    threadsCompleted: 0,
    distractions: 0,
    dms: 0,
    hourStarts: zeros(),
    hourDistractions: zeros(),
    msToFirstDistraction: [],
    internalDistractions: 0,
    externalDistractions: 0,
    longestSessionMs: 0,
  };
}

export function computeDayRollup(
  localDate: string,
  sessions: Session[],
  threads: Thread[],
  timezone: string,
): DayRollup {
  const rollup = emptyRollup(localDate);

  for (const session of sessions) {
    if (session.localDate !== localDate) continue;
    rollup.sessionsStarted += 1;
    rollup.focusMs += session.activeMs;
    rollup.longestSessionMs = Math.max(rollup.longestSessionMs, session.activeMs);
    bump(rollup.hourStarts, localHourOf(session.startedAt, timezone));

    const ordered = [...session.distractions].sort((a, b) => a.at.localeCompare(b.at));
    const first = ordered[0];
    if (first) {
      rollup.msToFirstDistraction.push(
        Math.max(0, Date.parse(first.at) - Date.parse(session.startedAt)),
      );
    }
    for (const distraction of ordered) {
      rollup.distractions += 1;
      bump(rollup.hourDistractions, localHourOf(distraction.at, timezone));
      if (distraction.kind === 'internal') rollup.internalDistractions += 1;
      if (distraction.kind === 'external') rollup.externalDistractions += 1;
    }
  }

  for (const thread of threads) {
    if (thread.completedLocalDate === localDate) rollup.threadsCompleted += 1;
    for (const step of thread.steps) {
      if (step.done && step.completedLocalDate === localDate) rollup.stepsCompleted += 1;
    }
  }

  rollup.dms = dailyMomentumScore(rollup);
  return rollup;
}

/** Every local date touched by these events — the set of days that need recomputing. */
export function datesTouched(sessions: Session[], threads: Thread[]): string[] {
  const dates = new Set<string>();
  for (const session of sessions) dates.add(session.localDate);
  for (const thread of threads) {
    if (thread.completedLocalDate) dates.add(thread.completedLocalDate);
    for (const step of thread.steps) {
      if (step.completedLocalDate) dates.add(step.completedLocalDate);
    }
  }
  return [...dates].sort();
}
