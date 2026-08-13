/**
 * Assembling one scope's view model (§5.4). Every scope shows the same four blocks so the page
 * is learnable: momentum ring + band, trend line, three stat tiles, one insight card.
 */
import type {
  DayRollup,
  DistractionStats,
  MomentumScope,
  ScopeDetail,
  ScopeSummary,
  TrendPoint,
} from '@shared/analytics.js';
import type { Thread } from '@shared/domain.js';
import { formatLocalDate, formatMonth } from '@shared/format.js';
import {
  addLocalDays,
  endOfLocalMonth,
  localDateRange,
  startOfLocalMonth,
  startOfLocalWeek,
} from '@shared/time.js';
import { activeDays, bandFor, dayMomentumSeries, median, monthScore, weekScore } from './momentum.js';
import { pickInsight } from './insights.js';
import { emptyRollup } from './rollups.js';

export interface ScopeInput {
  scope: MomentumScope;
  anchor: string;
  rollups: Record<string, DayRollup>;
  threads: Thread[];
  today: string;
}

export function scopeBounds(scope: MomentumScope, anchor: string): { from: string; to: string } {
  if (scope === 'day') return { from: anchor, to: anchor };
  if (scope === 'week') {
    const from = startOfLocalWeek(anchor);
    return { from, to: addLocalDays(from, 6) };
  }
  return { from: startOfLocalMonth(anchor), to: endOfLocalMonth(anchor) };
}

export function shiftAnchor(scope: MomentumScope, anchor: string, direction: -1 | 1): string {
  if (scope === 'day') return addLocalDays(anchor, direction);
  if (scope === 'week') return addLocalDays(startOfLocalWeek(anchor), direction * 7);
  const start = startOfLocalMonth(anchor);
  return direction === 1
    ? addLocalDays(endOfLocalMonth(start), 1)
    : startOfLocalMonth(addLocalDays(start, -1));
}

function scopeLabel(scope: MomentumScope, from: string, to: string): string {
  if (scope === 'day') return formatLocalDate(from);
  if (scope === 'week') return `${formatLocalDate(from)} – ${formatLocalDate(to)}`;
  return formatMonth(from);
}

/**
 * The rolling momentum chain has to run from the first day on record, not from the start of the
 * scope — that is what makes a bad day a dent instead of a reset.
 */
function momentumThrough(rollups: Record<string, DayRollup>, upTo: string): number {
  const dates = Object.keys(rollups).sort();
  const first = dates[0];
  if (!first || first > upTo) return 0;
  const scores = localDateRange(first, upTo).map((date) => rollups[date]?.dms ?? 0);
  const series = dayMomentumSeries(scores);
  return series[series.length - 1] ?? 0;
}

function weekMomentum(rollups: Record<string, DayRollup>, weekStart: string): number {
  const days = localDateRange(weekStart, addLocalDays(weekStart, 6));
  return weekScore(days.map((date) => rollups[date]?.dms ?? 0));
}

function monthMomentum(rollups: Record<string, DayRollup>, monthStart: string): number {
  const end = endOfLocalMonth(monthStart);
  const weeks: number[] = [];
  for (let cursor = startOfLocalWeek(monthStart); cursor <= end; cursor = addLocalDays(cursor, 7)) {
    weeks.push(weekMomentum(rollups, cursor));
  }
  return monthScore(weeks);
}

/** `null` values render as gaps. A blank day must look like absence, never like failure. */
function buildTrend(input: ScopeInput, from: string, to: string): TrendPoint[] {
  if (input.scope === 'month') {
    const points: TrendPoint[] = [];
    for (let cursor = startOfLocalWeek(from); cursor <= to; cursor = addLocalDays(cursor, 7)) {
      const week = localDateRange(cursor, addLocalDays(cursor, 6));
      const present = week.filter((date) => input.rollups[date]);
      points.push({
        key: cursor,
        label: formatLocalDate(cursor),
        value: present.length === 0 ? null : weekMomentum(input.rollups, cursor),
      });
    }
    return points;
  }

  // A single day still gets a line: the surrounding fortnight, so today has context.
  const [start, end] =
    input.scope === 'day' ? [addLocalDays(from, -13), to] : [from, to];
  return localDateRange(start, end).map((date) => ({
    key: date,
    label: formatLocalDate(date),
    value: input.rollups[date]?.dms ?? null,
  }));
}

function buildDistractionStats(window: DayRollup[]): DistractionStats {
  const hourHistogram = Array.from({ length: 24 }, () => 0);
  let internal = 0;
  let external = 0;
  let total = 0;
  let focusMs = 0;
  const firsts: number[] = [];

  for (const day of window) {
    day.hourDistractions.forEach((count, hour) => {
      hourHistogram[hour] = (hourHistogram[hour] ?? 0) + count;
    });
    internal += day.internalDistractions;
    external += day.externalDistractions;
    total += day.distractions;
    focusMs += day.focusMs;
    firsts.push(...day.msToFirstDistraction);
  }

  const focusedHours = focusMs / 3_600_000;
  const medianMsToFirst = median(firsts);
  return {
    // A rate, not a total — totals punish long sessions.
    perFocusedHour: focusedHours > 0 ? Number((total / focusedHours).toFixed(1)) : 0,
    hourHistogram,
    internal,
    external,
    untagged: Math.max(0, total - internal - external),
    medianMsToFirst,
    // Suggest, never enforce: rounded up to the next 5 minutes.
    suggestedSessionMs:
      medianMsToFirst === null ? null : Math.ceil(medianMsToFirst / 300_000) * 300_000,
  };
}

/**
 * Plain counts, derived from the rollups that already exist. Nothing here feeds the momentum
 * chain — it is the "what did my week actually look like" half of the page.
 */
function buildDetail(present: DayRollup[], rollups: Record<string, DayRollup>): ScopeDetail {
  const hourStarts = Array.from({ length: 24 }, () => 0);
  let sessions = 0;
  let focusMs = 0;
  let longestSessionMs = 0;
  let stepsCompleted = 0;

  for (const day of present) {
    sessions += day.sessionsStarted;
    focusMs += day.focusMs;
    stepsCompleted += day.stepsCompleted;
    longestSessionMs = Math.max(longestSessionMs, day.longestSessionMs);
    day.hourStarts.forEach((count, hour) => {
      hourStarts[hour] = (hourStarts[hour] ?? 0) + count;
    });
  }

  const busiest = hourStarts.reduce(
    (best, count, hour) => (count > (hourStarts[best] ?? 0) ? hour : best),
    0,
  );

  const every = Object.values(rollups);
  return {
    stepsCompleted,
    avgSessionMs: sessions > 0 ? Math.round(focusMs / sessions) : 0,
    longestSessionMs,
    peakStartHour: (hourStarts[busiest] ?? 0) > 0 ? busiest : null,
    hourStarts,
    daysWorked: present.filter((day) => day.sessionsStarted > 0).length,
    allTime: {
      sessionsStarted: every.reduce((sum, day) => sum + day.sessionsStarted, 0),
      focusMs: every.reduce((sum, day) => sum + day.focusMs, 0),
      threadsCompleted: every.reduce((sum, day) => sum + day.threadsCompleted, 0),
      stepsCompleted: every.reduce((sum, day) => sum + day.stepsCompleted, 0),
      daysWorked: every.filter((day) => day.sessionsStarted > 0).length,
      bestDayFocusMs: every.reduce((best, day) => Math.max(best, day.focusMs), 0),
    },
  };
}

export function buildScopeSummary(input: ScopeInput): ScopeSummary {
  const { from, to } = scopeBounds(input.scope, input.anchor);
  const dates = localDateRange(from, to);
  const window = dates.map((date) => input.rollups[date] ?? emptyRollup(date));
  const present = dates
    .map((date) => input.rollups[date])
    .filter((day): day is DayRollup => day !== undefined);

  const momentum =
    input.scope === 'day'
      ? momentumThrough(input.rollups, to)
      : input.scope === 'week'
        ? weekMomentum(input.rollups, from)
        : monthMomentum(input.rollups, from);

  const recentDates = localDateRange(addLocalDays(to, -29), to);
  const recent = recentDates
    .map((date) => input.rollups[date])
    .filter((day): day is DayRollup => day !== undefined);

  return {
    scope: input.scope,
    anchor: input.anchor,
    label: scopeLabel(input.scope, from, to),
    momentum,
    band: bandFor(momentum),
    sessionsStarted: present.reduce((sum, day) => sum + day.sessionsStarted, 0),
    focusMs: present.reduce((sum, day) => sum + day.focusMs, 0),
    threadsCompleted: present.reduce((sum, day) => sum + day.threadsCompleted, 0),
    detail: buildDetail(present, input.rollups),
    trend: buildTrend(input, from, to),
    insight: pickInsight({ window, recent, threads: input.threads, today: input.today }),
    distractions: buildDistractionStats(present),
    activeDays: activeDays(input.rollups, localDateRange(addLocalDays(to, -13), to)),
    atLatest: to >= input.today,
  };
}
