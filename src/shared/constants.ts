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
