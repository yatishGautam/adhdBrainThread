/** Storage thresholds (§4.3). */
export const SHARD_MAX_BYTES = 512 * 1024;
export const SHARD_MAX_RECORDS = 1500;
/** A sealed shard may overflow to this multiple via backdated inserts before it splits in place. */
export const SEALED_OVERFLOW_FACTOR = 2;
export const SHARD_CACHE_LIMIT = 6;
export const FLUSH_DEBOUNCE_MS = 500;
/** compact() merges adjacent shards under this fill ratio. */
export const COMPACT_FILL_RATIO = 0.4;

/** Work-in-progress limits (§5.2). */
export const WIP_IN_PROGRESS_CAP = 3;
/** Threads on the active list — done and dormant do not count (§2). */
export const ACTIVE_THREAD_CAP = 5;
/** Soft — a calm inline note, never a block. */
export const BOARD_SOFT_CAP = 7;
export const INTENT_SOFT_CAP = 5;

/** Sessions (§5.3). */
export const DEFAULT_SESSION_MS = 25 * 60 * 1000;
export const DEFAULT_DISTRACTION_GRACE_MS = 120 * 1000;
export const DISTRACTION_GRACE_MIN_MS = 0;
export const DISTRACTION_GRACE_MAX_MS = 300 * 1000;
/** Session state is checkpointed to the journal at this interval, so a crash loses at most this. */
export const SESSION_CHECKPOINT_MS = 5000;
export const HUD_TICK_MS = 1000;
/** The 25/5 cycle (§4). The break never auto-starts — the user presses Resume. */
export const BREAK_MS = 5 * 60 * 1000;

/** Steps use sparse integer ordering; renumber only when a gap closes below this. */
export const ORDER_STEP = 1000;
export const ORDER_MIN_GAP = 1;

/** Momentum (§6.1). */
export const DMS_WEIGHTS = {
  sessionStarted: { points: 12, cap: 35 },
  focusMinute: { points: 0.5, cap: 30 },
  stepCompleted: { points: 3, cap: 15 },
  threadCompleted: { points: 10, cap: 20 },
} as const;

/** Rolling momentum smoothing (§6.2). A bad day dents; it never resets. */
export const MOMENTUM_ALPHA = { day: 0.15, week: 0.3, month: 0.4 } as const;
/** Keeps a normal 5-day week from reading as a failing grade because of weekends. */
export const WEEK_SCORE_LIFT = 1.4;

export const ACTIVE_DAYS_WINDOW = 14;

/** Celebrations (§7). */
export const CELEBRATION_HARD_TIMEOUT_MS = 6000;
export const RARE_ROLL_CHANCE = 0.05;
export const CELEBRATION_ANTI_REPEAT = 2;
export const MILESTONE_STEP_COUNT = 10;

/** Done section pulls this many days before "load more" reaches into the archive. */
export const DONE_RECENT_DAYS = 30;
/** Threads completed longer ago than this are moved out of active.json on boot. */
export const AUTO_ARCHIVE_AFTER_DAYS = 30;

/**
 * The day planner.
 *
 * Every number here exists to keep the bill small and visible. The context sent to the model is
 * capped rather than trimmed by eye: a goal with an essay pasted into it, or a board that has
 * grown to forty todos, must not quietly turn a one-cent request into a fifty-cent one.
 */
export const PLANNER_DEFAULT_MODEL = 'claude-opus-5';
export const PLANNER_MAX_TOKENS = 4000;
/** Per-item caps on the context bundle. Generous for real use, fatal only to runaway input. */
export const PLANNER_GOAL_CONTEXT_CHARS = 1200;
export const PLANNER_MAX_GOALS = 12;
export const PLANNER_MAX_TODOS = 25;
export const PLANNER_MAX_THREADS = 10;
export const PLANNER_MAX_BLOCKERS = 10;
/** How many days of finished work go in for continuity. Two is enough to say "you left off at". */
export const PLANNER_LOOKBACK_DAYS = 2;
export const PLANNER_MAX_RECENT_LOG = 15;

/** USD per million tokens, by model. Used for the running total the planner panel shows. */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/** What the model picker offers. Cost is stated because it is the reason to choose. */
export const PLANNER_MODELS = [
  { id: 'claude-opus-5', label: 'Opus 5', note: 'Best judgement · ~$0.05 a plan' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', note: 'Balanced · ~$0.03 a plan' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', note: 'Cheapest · ~$0.01 a plan' },
] as const;
