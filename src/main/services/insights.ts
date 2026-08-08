/**
 * Insight cards (§6.4). All of these are pattern observations, never verdicts.
 *
 * Copy rules enforced here, not just in review:
 *  - no percentage declines, ever;
 *  - no comparison to a target the user did not set;
 *  - down periods get neutral copy, never sad copy;
 *  - distraction counts are framed as discovery, never as a tally of failures.
 */
import type { DayRollup, Insight } from '@shared/analytics.js';
import type { Thread } from '@shared/domain.js';
import { diffLocalDays } from '@shared/time.js';
import { formatDuration } from '@shared/format.js';

export interface InsightInput {
  /** Rollups for the scope being viewed, oldest first. Days that did not happen are absent. */
  window: DayRollup[];
  /** The last 30 days of rollups, for personal-best comparisons. */
  recent: DayRollup[];
  threads: Thread[];
  today: string;
}

function hourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

/**
 * Coming back after a quiet stretch is the behaviour most worth reinforcing, so it outranks
 * everything else — including a personal best on the same day.
 */
function recovery(input: InsightInput): Insight | null {
  const { window } = input;
  if (window.length < 4) return null;
  const latest = window[window.length - 1];
  if (!latest || latest.dms <= 0) return null;

  let quiet = 0;
  for (let i = window.length - 2; i >= 0; i -= 1) {
    if ((window[i]?.dms ?? 0) > 0) break;
    quiet += 1;
  }
  if (quiet < 3) return null;
  return {
    kind: 'recovery',
    headline: 'Back up after a quiet stretch.',
    detail: "That's the hard part.",
  };
}

function personalBest(input: InsightInput): Insight | null {
  const latest = input.window[input.window.length - 1];
  if (!latest || latest.dms === 0) return null;

  const others = input.recent.filter((day) => day.localDate !== latest.localDate);
  const bestScore = others.reduce((max, day) => Math.max(max, day.dms), 0);
  if (latest.dms > bestScore && bestScore > 0) {
    return { kind: 'personal_best', headline: 'Your strongest day in a month.' };
  }

  const bestSession = others.reduce((max, day) => Math.max(max, day.longestSessionMs), 0);
  if (latest.longestSessionMs > bestSession && bestSession > 0) {
    return {
      kind: 'personal_best',
      headline: 'Longest single session in a month.',
      detail: formatDuration(latest.longestSessionMs),
    };
  }
  return null;
}

function peakHours(input: InsightInput): Insight | null {
  const totals = Array.from({ length: 24 }, () => 0);
  for (const day of input.window) {
    day.hourStarts.forEach((count, hour) => {
      totals[hour] = (totals[hour] ?? 0) + count;
    });
  }
  if (totals.reduce((sum, value) => sum + value, 0) < 5) return null;

  let bestHour = 0;
  let bestCount = -1;
  for (let hour = 0; hour < 23; hour += 1) {
    const pair = (totals[hour] ?? 0) + (totals[hour + 1] ?? 0);
    if (pair > bestCount) {
      bestCount = pair;
      bestHour = hour;
    }
  }
  if (bestCount <= 0) return null;
  return {
    kind: 'peak_hours',
    headline: `You start most often between ${hourLabel(bestHour)} and ${hourLabel(bestHour + 2)}.`,
  };
}

function distractionPattern(input: InsightInput): Insight | null {
  const totals = Array.from({ length: 24 }, () => 0);
  for (const day of input.window) {
    day.hourDistractions.forEach((count, hour) => {
      totals[hour] = (totals[hour] ?? 0) + count;
    });
  }
  const total = totals.reduce((sum, value) => sum + value, 0);
  if (total < 5) return null;

  const peak = totals.reduce(
    (best, count, hour) => (count > best.count ? { hour, count } : best),
    { hour: 0, count: 0 },
  );
  if (peak.count < 3) return null;
  return {
    kind: 'distraction_pattern',
    headline: `Distractions cluster around ${hourLabel(peak.hour)}.`,
    detail: 'Worth a break there?',
  };
}

function waitingWatch(input: InsightInput): Insight | null {
  const stale = input.threads
    .filter((thread) => thread.status === 'waiting')
    .map((thread) => ({ thread, days: diffLocalDays(thread.updatedAt.slice(0, 10), input.today) }))
    .filter((entry) => entry.days >= 5)
    .sort((a, b) => b.days - a.days)[0];
  if (!stale) return null;
  return {
    kind: 'waiting_watch',
    headline: `'${stale.thread.title}' has been waiting ${stale.days} days.`,
    ...(stale.thread.waitingOn ? { detail: `On: ${stale.thread.waitingOn}` } : {}),
  };
}

function fallback(input: InsightInput): Insight {
  const focusMs = input.window.reduce((sum, day) => sum + day.focusMs, 0);
  return {
    kind: 'fallback',
    headline: focusMs > 0 ? `${formatDuration(focusMs)} of focus in this stretch.` : 'Nothing logged yet here.',
  };
}

/** Priority order is the spec's, and the order matters more than any individual card. */
export function pickInsight(input: InsightInput): Insight {
  return (
    recovery(input) ??
    personalBest(input) ??
    peakHours(input) ??
    distractionPattern(input) ??
    waitingWatch(input) ??
    fallback(input)
  );
}
