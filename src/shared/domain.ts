/**
 * The domain model. Shared verbatim by main, preload and renderer.
 *
 * Conventions that the whole app depends on:
 *  - Every id is a ULID, so lexical sort === creation order. Shard key ranges rely on this.
 *  - Every timestamp is a UTC ISO-8601 string.
 *  - Every record that analytics buckets also stores `localDate` (YYYY-MM-DD), computed at
 *    write time from the user's timezone. Never re-derive a local day from UTC at read time:
 *    that is how sessions land on the wrong side of a DST boundary.
 */

/**
 * The five statuses the board offers (§2). `idle` is legacy-only: records written before the
 * Blocked/Dormant split still carry it, so it stays readable and sorts as active, but it is not
 * offered in the status picker.
 */
export type ThreadStatus =
  | 'idle'
  | 'in_progress'
  | 'blocked'
  | 'waiting'
  | 'done'
  | 'dormant';

export interface Step {
  id: string;
  text: string;
  done: boolean;
  /** Sparse ordering (1000, 2000, 3000). See docs/storage.md and reorderStep(). */
  order: number;
  completedAt?: string;
  /** Written at completion time so DMS can bucket steps by local day without re-deriving. */
  completedLocalDate?: string;
}

export interface Thread {
  id: string;
  title: string;
  /** Markdown, freeform. */
  notes: string;
  status: ThreadStatus;
  steps: Step[];
  /** Required when status === 'waiting'. A blocked thread with no recorded blocker gets lost. */
  waitingOn?: string;
  /** A Notion link or a plain URL. Rendered as a chip; always opened externally (§6). */
  link?: string;
  /** Sparse manual ordering on the board, same scheme as steps. Absent = fall back to sort. */
  order?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  completedLocalDate?: string;
  /** Denormalised; rebuildable from sessions. */
  totalFocusMs: number;
  sessionCount: number;
  distractionCount: number;
  archived: boolean;
}

/** Atomic, lives on a day, no checklist. */
export interface Todo {
  id: string;
  text: string;
  done: boolean;
  localDate: string;
  createdAt: string;
  completedAt?: string;
  /** Set when promoted. The todo is never deleted — the history stays honest. */
  promotedToThreadId?: string;
  order: number;
}

/**
 * Global and carried forward (§5), exactly like todos. Stored on the day it was raised so
 * "since Aug 4" comes for free; the daily page reads every unresolved one, whatever day it
 * belongs to.
 */
export interface Blocker {
  id: string;
  text: string;
  resolved: boolean;
  localDate: string;
  createdAt: string;
  resolvedAt?: string;
}

/** One timestamped line in a day's Log. Added by hand, or written by a completion. */
export interface LogEntry {
  id: string;
  text: string;
  at: string;
  localDate: string;
  source: 'manual' | 'todo' | 'focus' | 'thread';
}

/** Inbox capture, unsorted. Surfaced as "Park" — a scratch inbox, never a commitment. */
export interface Thought {
  id: string;
  text: string;
  createdAt: string;
  localDate: string;
  processed: boolean;
  /** Added later, from the Park view — what you thought about it when you came back. */
  note?: string;
}

export interface Day {
  /** Primary key. */
  localDate: string;
  createdAt: string;
  /** Threads chosen for today. */
  intentThreadIds: string[];
  todos: Todo[];
  thoughts: Thought[];
  /** Auto-filled on completion. */
  loggedThreadIds: string[];
  /** Meeting notes. Markdown-friendly, auto-saving. */
  note?: string;
  /** The one big "what am I doing right now" field at the top of the daily page. */
  now?: string;
  /** Optional so day files written before §5 still validate — no migration needed. */
  blockers?: Blocker[];
  log?: LogEntry[];
}

export type DistractionKind = 'internal' | 'external' | 'unspecified';

export interface Distraction {
  id: string;
  at: string;
  /** One tap = 'unspecified'. Tagging is a long-press, never required. */
  kind: DistractionKind;
  note?: string;
  grantedMs: number;
}

export type SessionOutcome =
  | 'completed'
  | 'ended_early'
  | 'switched'
  | 'abandoned'
  | 'recovered';

export interface Pause {
  at: string;
  resumedAt?: string;
}

export interface Session {
  id: string;
  threadId: string;
  startedAt: string;
  endedAt?: string;
  localDate: string;
  plannedMs: number;
  /** Excludes paused time. Measured with a monotonic clock, not wall clock. */
  activeMs: number;
  /** Time added back by distraction logging. */
  grantedMs: number;
  outcome: SessionOutcome;
  switchedToThreadId?: string;
  distractions: Distraction[];
  pauses: Pause[];
}

/**
 * A sit. Deliberately not a `Session`: momentum is computed from focus sessions, so letting
 * meditation land there would inflate the focus number and make it stop meaning anything — the
 * same reason a break is not a Session.
 *
 * Recorded on the phone today; this type exists here so the desktop can hold and display them
 * once the sync engine lands.
 */
export interface MindfulSession {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  localDate: string;
  plannedMs: number;
  /** What was actually sat. A sit ended early still counts for what it was. */
  actualMs: number;
  /** Whether the bell got to ring on its own. */
  completed: boolean;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface Settings {
  version: 1;
  defaultSessionMs: number;
  distractionGraceMs: number;
  soundEnabled: boolean;
  celebrationsEnabled: boolean;
  /** Anti-repeat memory for celebration selection. */
  recentCelebrationIds: string[];
  railCollapsed: boolean;
  hudBounds?: { x: number; y: number };
  timezone: string;
  /** Suppresses the recovery prompt for a session the user already answered. */
  lastOpenSessionId?: string;
}
