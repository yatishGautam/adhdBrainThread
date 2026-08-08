/** Analytics view models. Computed in main, rendered in the renderer, never derived twice. */

export type MomentumScope = 'day' | 'week' | 'month';

export type BandId = 'resting' | 'warming' | 'rolling' | 'flow' | 'lit';

export interface Band {
  id: BandId;
  label: string;
}

/** One local day of raw counts. The cache; sessions and threads are truth. */
export interface DayRollup {
  localDate: string;
  sessionsStarted: number;
  focusMs: number;
  stepsCompleted: number;
  threadsCompleted: number;
  distractions: number;
  dms: number;
  /** Session starts bucketed by local hour, 24 entries. */
  hourStarts: number[];
  /** Distractions bucketed by local hour, 24 entries. */
  hourDistractions: number[];
  /** ms from session start to that session's first distraction, one entry per session that had one. */
  msToFirstDistraction: number[];
  internalDistractions: number;
  externalDistractions: number;
  longestSessionMs: number;
}

export interface Rollups {
  version: 2;
  updatedAt: string;
  days: Record<string, DayRollup>;
}

/** One point on a trend line. `null` value means the period did not happen — render a gap, not a zero. */
export interface TrendPoint {
  key: string;
  label: string;
  value: number | null;
}

export type InsightKind =
  | 'recovery'
  | 'personal_best'
  | 'peak_hours'
  | 'distraction_pattern'
  | 'waiting_watch'
  | 'fallback';

export interface Insight {
  kind: InsightKind;
  headline: string;
  detail?: string;
}

export interface DistractionStats {
  perFocusedHour: number;
  hourHistogram: number[];
  internal: number;
  external: number;
  untagged: number;
  medianMsToFirst: number | null;
  /** Suggested session length derived from median-to-first-distraction. Suggest, never enforce. */
  suggestedSessionMs: number | null;
}

export interface ScopeSummary {
  scope: MomentumScope;
  /** Anchor date (YYYY-MM-DD) inside the period being viewed. */
  anchor: string;
  label: string;
  momentum: number;
  band: Band;
  sessionsStarted: number;
  focusMs: number;
  threadsCompleted: number;
  trend: TrendPoint[];
  insight: Insight;
  distractions: DistractionStats;
  activeDays: { active: number; window: number };
  /** True when the next period forward is in the future. */
  atLatest: boolean;
}
