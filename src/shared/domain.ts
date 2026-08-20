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
  /**
   * A deleted record is kept as a tombstone rather than removed, because a record that simply
   * stops existing looks identical to one the server has never seen — and comes back from the
   * dead the next time another device syncs. Every read path filters these out.
   */
  deletedAt?: string | null;
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
  /**
   * When the *user* last changed this day. The whole conflict rule rests on it, so it is
   * stamped at write time by the repository and never re-derived on read. Optional only so day
   * files written before sync existed still validate; every write since fills it in.
   */
  updatedAt?: string;
  /** See `Thread.deletedAt`. */
  deletedAt?: string | null;
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
  /** See `Day.updatedAt` — same rule, same reason it is optional. */
  updatedAt?: string;
  /** See `Thread.deletedAt`. */
  deletedAt?: string | null;
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
  /** Where the floating calendar was parked, same as `hudBounds`. */
  calendarBounds?: { x: number; y: number; width: number; height: number };
  /**
   * Which shape the floating calendar reopens in. Persisted rather than reset to a default,
   * because the whole reason to leave a calendar open beside your work is that it is showing
   * the thing you keep glancing at — and a widget that forgets is one you stop opening.
   */
  calendarWidgetScope?: 'day' | 'week' | 'month';
  timezone: string;
  /** Suppresses the recovery prompt for a session the user already answered. */
  lastOpenSessionId?: string;

  /**
   * The shape of a normal day, as `HH:MM` local wall clock. These are the planner's defaults,
   * overridable per generation — the morning you wake at 11 should not require editing a
   * setting, and should not silently plan a day that started two hours ago either.
   */
  wakeTime: string;
  dayStartTime: string;
  dayEndTime: string;
  /** Anything the planner should always know: fixed meetings, medication, energy patterns. */
  plannerContext: string;
  /** Model id. Configurable because the bill is the user's, not a decision baked into a build. */
  plannerModel: string;
  /** Thinking depth. `medium` plans a day well for a fraction of `high`'s output tokens. */
  plannerEffort: 'low' | 'medium' | 'high';
  /**
   * A nudge at each plan block's start: HUD pops, notification says what and until when.
   * Device-local — how loud one machine is says nothing about the others — so it never rides
   * the profile.
   */
  nudgesEnabled: boolean;
}

/**
 * A weekly goal: one line you tick, plus as much or as little context as you feel like giving.
 *
 * The split is the whole point. `title` is the checkbox — it has to survive being read in a
 * glance, so it stays one line. `context` is unbounded freeform text nobody is required to
 * write, and it exists for the planner: a goal that says only "sort out billing" gives the
 * model nothing to schedule, whereas the same goal with three lines about which invoices and
 * who is waiting produces a day worth following. Context is never shown in the collapsed row —
 * writing more must never make the list harder to scan.
 */
export interface Goal {
  id: string;
  /** The checkbox line. Kept short by the UI, not by validation. */
  title: string;
  done: boolean;
  /** Markdown, freeform, usually empty. Steps, links, constraints — whatever helps. */
  context: string;
  /** ISO week key (`2026-W34`). See `@shared/week.ts` for why it is not just the year. */
  weekKey: string;
  /** Sparse manual ordering, same scheme as steps and todos. */
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  completedLocalDate?: string;
  /** Set when the goal was rolled into a later week, so the trail back is not lost. */
  carriedFromWeek?: string;
  /** See `Thread.deletedAt`. Goals are local-only today, but the rule is the rule. */
  deletedAt?: string | null;
}

/** What a block of the suggested day is for. Drives its colour and whether it can start a timer. */
export type PlanBlockKind =
  | 'focus'
  | 'break'
  | 'admin'
  | 'meal'
  | 'buffer'
  | 'wind_down';

/**
 * One block of the suggested day.
 *
 * The id fields are what stop this being decoration: a block carrying a `threadId` gets a Start
 * button wired to the real session engine, so following the plan and using the timer are the
 * same action rather than two. The model is told to fill them in only when it is placing an
 * item that already exists — an invented id would render a button that starts nothing, so every
 * one of them is checked against the real records before the plan is stored.
 */
export interface PlanBlock {
  id: string;
  /** Local wall-clock `HH:MM`, 24-hour. Not a timestamp: a plan is a shape, not a schedule. */
  start: string;
  end: string;
  kind: PlanBlockKind;
  title: string;
  /** One short line on why this, now. The part that makes a plan arguable instead of obeyed. */
  why?: string;
  threadId?: string;
  todoId?: string;
  goalId?: string;
  /**
   * Set when the user turned this block into a thread and started working on it.
   *
   * This is what makes regenerating mid-week safe. Every other block is a suggestion and is
   * replaced wholesale on the next run — which is the point of a disposable plan — but a
   * promoted block points at a real thread with real time logged against it. The server carries
   * these across a regeneration untouched, and drops any new block that would sit on top of one.
   * Without the flag, planning again on Friday would quietly orphan Wednesday's thread.
   */
  promoted?: boolean;
  /**
   * Set when the user edited, moved or created this block by hand.
   *
   * The same contract as `promoted` — the server plans around it instead of replacing it —
   * but earned by touch rather than by starting work. The model proposes; an edited block is
   * owned, and a regeneration that erased your hand edits would teach you never to touch the
   * plan again.
   */
  pinned?: boolean;
}

/** Token spend for one generation, kept so the running bill is visible rather than a surprise. */
export interface PlanUsage {
  inputTokens: number;
  outputTokens: number;
  /** Computed at write time from the price of the model that actually ran. */
  costUsd: number;
}

/**
 * A suggested day, generated on request and never automatically.
 *
 * Stored in its own collection keyed by local date rather than on the `Day` record, because
 * `dayIn()` in the sync wire drops fields it does not know about — a plan living on a Day would
 * be silently erased the next time the phone pushed that day back.
 */
export interface DayPlan {
  localDate: string;
  /**
   * The week this day was planned as part of. Ties it back to its `WeekPlan`.
   *
   * Optional because plan files written by the old local planner predate week plans and have no
   * week to point at. Every plan written since carries one.
   */
  weekKey?: string;
  generatedAt: string;
  /** What the day was planned around. Echoed back so a stale plan can say why it looks wrong. */
  wakeTime: string;
  startTime: string;
  endTime: string;
  blocks: PlanBlock[];
  /** One or two sentences: the shape of the day and the one thing that actually matters on it. */
  headline: string;
  /**
   * What was deliberately left out.
   *
   * Only ever set on plans written by the old local planner. What a run drops is now a fact
   * about the week rather than about one of its days, so it lives on `WeekPlan.deferred` — but
   * plans already on disk still carry it and are still worth reading.
   */
  deferred?: string[];
  /**
   * Optional for the same reason: the model that answered and what it cost are facts about the
   * run, and a run now produces several days from one call. Stamping the same token count on
   * each day would make the running total read several times the real bill. `WeekPlan.usage`
   * holds it once. Old local plans keep theirs.
   */
  model?: string;
  usage?: PlanUsage;
  updatedAt?: string;
  deletedAt?: string | null;
}

/**
 * One press of the button: the shape of the days that were left in the week, what was dropped,
 * and what the call cost.
 *
 * Generated on the server rather than here — see `PlannerService` for why the key moved — and
 * arrives on every device through sync, which is the whole point. Planning on the phone and
 * reading the plan on the laptop is one action, not two.
 */
/**
 * The coach's written read of one period — a day (`2026-08-20`) or a week (`2026-W34`).
 *
 * Server-authored, like a plan: the app computes every fact (first touch, focus against plan,
 * parked distractions, how the day run bent) and the model contributes the one thing only a
 * model can — the connection between them, written for the person. Regenerating replaces the
 * row; an insight is an opinion about data, and stale opinions are not worth versioning.
 */
export interface CoachInsight {
  /** Primary key. A local date for a day, an ISO week key for a week — the cadence is the key. */
  periodKey: string;
  generatedAt: string;
  /** The period in one sentence. */
  headline: string;
  /** Two short paragraphs, second person. */
  body: string;
  /** One small experiment, phrased as an invitation. */
  suggestion: string;
  model: string;
  usage: PlanUsage;
  updatedAt?: string;
  deletedAt?: string | null;
}

/**
 * The record behind "Start my day": the day run.
 *
 * A run is to the day what a session is to a block — an explicit start, a live pointer, a
 * clean end. Only what cannot be derived is stored: which block is "now" falls out of the plan,
 * the shift and the clock, so two devices holding the same records can never disagree about it.
 *
 * The shift rule that makes the derivation stable: a block whose original `start` is at or
 * after `shiftFrom` slides by `shiftMs`; everything earlier is the finished morning and stays
 * put. Running late is one tap, and the morning does not get rewritten to pretend otherwise.
 */
export interface DayRun {
  /** Primary key. One run per day at most — starting again resumes, never duplicates. */
  localDate: string;
  startedAt: string;
  /** Set by the wind-down. Null while the day is still being run. */
  endedAt?: string | null;
  /** Signed — starting early is as real as running late. */
  shiftMs: number;
  /** Original wall-clock `HH:MM` the shift applies from. Absent when nothing shifted. */
  shiftFrom?: string;
  /** Blocks deliberately let go. Ids into the day plan's blocks, not records of their own. */
  skippedBlockIds: string[];
  updatedAt: string;
  deletedAt?: string | null;
}

export interface WeekPlan {
  /** Primary key. ISO week key, `2026-W34`. */
  weekKey: string;
  generatedAt: string;
  /**
   * The window actually planned: the day the button was pressed, through Sunday. Stored rather
   * than re-derived, so a plan read on Friday can still say which days it was written for.
   */
  fromDate: string;
  toDate: string;
  /** Two or three sentences about the week: what the remaining days are for. */
  headline: string;
  /**
   * What was consciously left out. A planner that silently drops six todos teaches you not to
   * trust it; one that says "not this week: X, Y" is making an argument you can disagree with.
   */
  deferred: string[];
  model: string;
  usage: PlanUsage;
  updatedAt?: string;
  deletedAt?: string | null;
}
