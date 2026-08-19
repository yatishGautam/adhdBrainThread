/**
 * The calendar projection: plans, sessions and sits folded into one list of timed entries.
 *
 * **Ported from the backend's `src/calendar.ts`, deliberately rule for rule** — the same way
 * `week.ts` was. The server composes this too, and if the two disagree then the same Tuesday
 * reads differently depending on whether you happened to have a connection, which is worse than
 * either answer alone. The tests came across with it.
 *
 * Why a copy exists at all: ARCHITECTURE.md §1. The app must draw its calendar with the network
 * off, out of the records already on disk. `GET /calendar` is the authority when it answers —
 * see `CalendarService`, which prefers it and falls back to this — but nothing on screen may
 * wait for it.
 *
 * The one difference from the server's copy is the input. There it is database rows; here it is
 * the domain types straight off disk, because that is what the repositories hand back.
 */
import type {
  Day,
  DayPlan,
  Goal,
  MindfulSession,
  PlanBlock,
  Session,
  Thread,
  WeekPlan,
} from './domain.js';
import { localDateRange } from './time.js';
import { weekKeyOf } from './week.js';

// ------------------------------------------------------------------- shapes

/** Where an entry came from. Drives what the UI can do with it, not just its colour. */
export type CalendarSource = 'plan' | 'session' | 'sit';

/**
 * What the entry is for. The first six are `PlanBlockKind` verbatim; the last two are the two
 * things that only ever happened rather than were planned.
 */
export type CalendarKind = PlanBlock['kind'] | 'session' | 'sit';

/**
 * How a planned entry turned out.
 *
 * `done` is only ever claimed from a real session — never from the clock having passed the
 * block's end time. A plan that marks itself complete because it is now the afternoon is a plan
 * that lies, and the whole value of putting both on one timeline is that it does not.
 */
export type CalendarStatus = 'planned' | 'done' | 'running' | 'missed';

export interface CalendarEntry {
  /** Stable across regenerations of the same plan, so a list can be keyed on it. */
  id: string;
  source: CalendarSource;
  /** The day this belongs to, taken from the record. Never computed from a timestamp. */
  localDate: string;
  /** Local wall clock, `HH:MM`, 24-hour. */
  start: string;
  end: string;
  kind: CalendarKind;
  title: string;
  /** One line on why this, now. Plan blocks only — a session that happened needs no argument. */
  why?: string;
  threadId?: string;
  todoId?: string;
  goalId?: string;
  /** See `PlanBlock.promoted`: the block became a real thread and is a commitment, not a guess. */
  promoted?: boolean;
  status: CalendarStatus;
  /**
   * Time actually spent against this entry.
   *
   * On a session or a sit it is that record's own time. On a plan block it is the time of the
   * sessions attributed to it — see `attribute()`, which hands each session to exactly one
   * block, so summing this across a day's blocks never double-counts an hour.
   */
  actualMs?: number;
  /** The raw instant, for placing the entry in a timezone other than the one used here. */
  startedAt?: string;
  endedAt?: string;
}

/** Enough of a day to render a column without asking for anything else. */
export interface CalendarDay {
  localDate: string;
  weekKey: string;
  /** The plan's own header, if the day was ever planned. Null is a perfectly normal day. */
  plan: {
    generatedAt: string;
    wakeTime: string;
    startTime: string;
    endTime: string;
    headline: string;
  } | null;
  /** Every entry on the day, ordered by start. Absent at `summary` detail. */
  entries?: CalendarEntry[];
  summary: CalendarDaySummary;
}

/** The numbers a month grid and the widget render. Always present, at every detail level. */
export interface CalendarDaySummary {
  /** Wall-clock time the plan asked for, focus and admin blocks only. */
  plannedMs: number;
  /** Time actually focused, from sessions. The one number worth comparing to `plannedMs`. */
  focusMs: number;
  sitMs: number;
  blocks: number;
  /** Planned work blocks that a real session was found for. */
  blocksDone: number;
  sessions: number;
  todosOpen: number;
  todosDone: number;
  /** True when the day was planned at all. Cheaper for a grid than checking `plan` for null. */
  planned: boolean;
}

/** The week a run produced, and the goals it was built from. */
export interface CalendarWeek {
  weekKey: string;
  from: string;
  to: string;
  generatedAt: string | null;
  headline: string;
  deferred: string[];
  model: string | null;
  goals: CalendarGoal[];
}

export interface CalendarGoal {
  id: string;
  title: string;
  done: boolean;
  order: number | null;
}

export interface Calendar {
  from: string;
  to: string;
  /** The timezone every wall-clock time in here was computed in. */
  timezone: string;
  detail: CalendarDetail;
  weeks: CalendarWeek[];
  days: CalendarDay[];
}

export type CalendarDetail = 'full' | 'summary';

/** Which of the three shapes the calendar is being read in. */
export type CalendarScope = 'day' | 'week' | 'month';

// -------------------------------------------------------------------- input

/**
 * The records this needs, as the repositories hand them back.
 *
 * Threads are here only to give a session a title — a session entry that says "Focus" where it
 * could say what you were focusing on is the difference between a calendar and a bar chart.
 */
export interface CalendarSources {
  from: string;
  to: string;
  timezone: string;
  plans: DayPlan[];
  sessions: Session[];
  sits: MindfulSession[];
  days: Day[];
  weekPlans: WeekPlan[];
  goals: Goal[];
  threads: Pick<Thread, 'id' | 'title'>[];
}

// ----------------------------------------------------------------- building

/**
 * How long a range may be asked for at each detail level. Mirrors the server's caps so a client
 * cannot ask for something the API would refuse and then silently fall back.
 */
export const MAX_FULL_DAYS = 62;
export const MAX_SUMMARY_DAYS = 366;

export function maxDaysFor(detail: CalendarDetail): number {
  return detail === 'summary' ? MAX_SUMMARY_DAYS : MAX_FULL_DAYS;
}

/** The detail a scope needs. A month grid renders dots; it does not need five hundred blocks. */
export function detailFor(scope: CalendarScope): CalendarDetail {
  return scope === 'month' ? 'summary' : 'full';
}

/**
 * Fold everything into one calendar.
 *
 * Every day between `from` and `to` gets a column, including the empty ones. A calendar with
 * holes where nothing happened is a calendar you cannot count squares on.
 */
export function buildCalendar(
  sources: CalendarSources,
  detail: CalendarDetail = 'full',
): Calendar {
  const dates = localDateRange(sources.from, sources.to);

  const live = <T extends { deletedAt?: string | null }>(rows: T[]): T[] =>
    rows.filter((row) => !row.deletedAt);

  const plansByDate = byKey(live(sources.plans), (plan) => plan.localDate);
  const daysByDate = byKey(live(sources.days), (day) => day.localDate);
  const sessionsByDate = groupBy(live(sources.sessions), (session) => session.localDate);
  const sitsByDate = groupBy(live(sources.sits), (sit) => sit.localDate);
  const titles = new Map(sources.threads.map((thread) => [thread.id, thread.title]));

  const days: CalendarDay[] = dates.map((localDate) => {
    const plan = plansByDate.get(localDate) ?? null;
    const sessions = sessionsByDate.get(localDate) ?? [];
    const sits = sitsByDate.get(localDate) ?? [];
    const todos = daysByDate.get(localDate)?.todos ?? [];

    const entries = entriesFor(localDate, plan, sessions, sits, titles, sources.timezone);

    return {
      localDate,
      // The plan's own week key is authoritative when it has one — it is what the run filed the
      // day under, and re-deriving it would disagree for a plan generated across a boundary.
      weekKey: plan?.weekKey || weekKeyOf(localDate),
      plan: plan
        ? {
            generatedAt: plan.generatedAt,
            wakeTime: plan.wakeTime,
            startTime: plan.startTime,
            endTime: plan.endTime,
            headline: plan.headline,
          }
        : null,
      ...(detail === 'full' ? { entries } : {}),
      summary: summarise(entries, todos, plan !== null),
    };
  });

  return {
    from: sources.from,
    to: sources.to,
    timezone: sources.timezone,
    detail,
    weeks: weeksFor(dates, live(sources.weekPlans), live(sources.goals)),
    days,
  };
}

/**
 * One day's entries, plan and reality on the same timeline, ordered by start.
 *
 * Sessions are kept as their own entries even when they match a block, rather than being folded
 * into it. Two reasons: a block matched by three short sessions is a genuinely different day
 * from one matched by a single long one, and work that was never planned at all is the most
 * interesting thing a calendar can show you — it is the difference between the week you designed
 * and the week you had.
 */
function entriesFor(
  localDate: string,
  plan: DayPlan | null,
  sessions: Session[],
  sits: MindfulSession[],
  titles: Map<string, string>,
  timezone: string,
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];

  const blocks = plan?.blocks ?? [];
  const spentByBlock = attribute(blocks, sessions, timezone);

  for (const block of blocks) {
    const spent = spentByBlock.get(block.id);
    entries.push({
      id: `plan:${localDate}:${block.id}`,
      source: 'plan',
      localDate,
      start: block.start,
      end: block.end,
      kind: block.kind,
      title: block.title,
      ...(block.why ? { why: block.why } : {}),
      ...(block.threadId ? { threadId: block.threadId } : {}),
      ...(block.todoId ? { todoId: block.todoId } : {}),
      ...(block.goalId ? { goalId: block.goalId } : {}),
      ...(block.promoted ? { promoted: true } : {}),
      // Only a real session promotes a block past `planned`. Nothing here consults the clock.
      status: spent ? 'done' : 'planned',
      ...(spent ? { actualMs: spent } : {}),
    });
  }

  for (const session of sessions) {
    const start = wallClock(session.startedAt, timezone);
    entries.push({
      id: `session:${session.id}`,
      source: 'session',
      localDate,
      start,
      end: runningEnd(session.startedAt, session.endedAt, session.activeMs, timezone),
      kind: 'session',
      title: (session.threadId && titles.get(session.threadId)?.trim()) || 'Focus',
      ...(session.threadId ? { threadId: session.threadId } : {}),
      status: session.endedAt ? 'done' : 'running',
      actualMs: Math.max(0, session.activeMs),
      startedAt: session.startedAt,
      ...(session.endedAt ? { endedAt: session.endedAt } : {}),
    });
  }

  for (const sit of sits) {
    const start = wallClock(sit.startedAt, timezone);
    entries.push({
      id: `sit:${sit.id}`,
      source: 'sit',
      localDate,
      start,
      end: runningEnd(sit.startedAt, sit.endedAt, sit.actualMs, timezone),
      kind: 'sit',
      title: 'Sit',
      status: sit.endedAt ? 'done' : 'running',
      actualMs: Math.max(0, sit.actualMs),
      startedAt: sit.startedAt,
      ...(sit.endedAt ? { endedAt: sit.endedAt } : {}),
    });
  }

  // By start time, then by source so a block and the session that fulfilled it land in a stable
  // order rather than swapping places between two renders.
  return entries.sort(
    (a, b) =>
      toMinutes(a.start) - toMinutes(b.start) ||
      SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] ||
      a.id.localeCompare(b.id),
  );
}

const SOURCE_ORDER: Record<CalendarSource, number> = { plan: 0, session: 1, sit: 2 };

/**
 * Which planned block each session paid off, and how much time it brought.
 *
 * Matching is by thread first and clock second. Thread first because a block you finally got to
 * after dinner is still that block done, and demanding that the session land inside the planned
 * hour would mark a day you fully delivered — late — as a day you ignored the plan.
 *
 * Clock second because a thread commonly appears in the day twice: an hour in the morning and
 * another after lunch. Crediting both blocks with every minute spent on the thread reports two
 * hours of work for one, so each session is given to exactly one block — the one starting
 * nearest to it — and the result is a partition. Every minute is counted once, or not at all.
 *
 * A session whose thread the plan never mentions is attributed to nothing, on purpose. It stays
 * on the timeline as its own entry, which is the point: unplanned work is the most interesting
 * thing a calendar can show you, and folding it into the nearest block would hide it.
 */
function attribute(
  blocks: PlanBlock[],
  sessions: Session[],
  timezone: string,
): Map<string, number> {
  const spent = new Map<string, number>();
  if (!blocks.length) return spent;

  const byThread = new Map<string, PlanBlock[]>();
  for (const block of blocks) {
    if (!block.threadId) continue;
    const list = byThread.get(block.threadId);
    if (list) list.push(block);
    else byThread.set(block.threadId, [block]);
  }

  for (const session of sessions) {
    if (!session.threadId) continue;
    const candidates = byThread.get(session.threadId);
    if (!candidates?.length) continue;

    const at = toMinutes(wallClock(session.startedAt, timezone));
    // Nearest by start time. Ties go to the earlier block, which `reduce` gives for free by
    // keeping the incumbent — and blocks arrive in the order the plan wrote them.
    const winner = candidates.reduce((best, block) =>
      Math.abs(toMinutes(block.start) - at) < Math.abs(toMinutes(best.start) - at) ? block : best,
    );
    spent.set(winner.id, (spent.get(winner.id) ?? 0) + Math.max(0, session.activeMs));
  }

  return spent;
}

/** Blocks that represent work, and so are worth counting as a plan you did or did not follow. */
const WORK_KINDS: ReadonlySet<CalendarKind> = new Set(['focus', 'admin']);

function summarise(
  entries: CalendarEntry[],
  todos: { done: boolean }[],
  planned: boolean,
): CalendarDaySummary {
  let plannedMs = 0;
  let focusMs = 0;
  let sitMs = 0;
  let blocks = 0;
  let blocksDone = 0;
  let sessions = 0;

  for (const entry of entries) {
    if (entry.source === 'plan') {
      blocks += 1;
      if (WORK_KINDS.has(entry.kind)) {
        plannedMs += spanMs(entry.start, entry.end);
        if (entry.status === 'done') blocksDone += 1;
      }
    } else if (entry.source === 'session') {
      sessions += 1;
      focusMs += entry.actualMs ?? 0;
    } else {
      sitMs += entry.actualMs ?? 0;
    }
  }

  return {
    plannedMs,
    focusMs,
    sitMs,
    blocks,
    blocksDone,
    sessions,
    todosOpen: todos.filter((todo) => !todo.done).length,
    todosDone: todos.filter((todo) => todo.done).length,
    planned,
  };
}

/**
 * The weeks the range touches, each with its run and its goals.
 *
 * Every week a date falls in gets an entry even when it was never planned, so the UI can say
 * "no plan for this week" rather than rendering nothing and leaving the user to wonder whether
 * something failed.
 */
function weeksFor(dates: string[], weekPlans: WeekPlan[], goals: Goal[]): CalendarWeek[] {
  const keys: string[] = [];
  for (const date of dates) {
    const key = weekKeyOf(date);
    if (!keys.includes(key)) keys.push(key);
  }

  const runs = byKey(weekPlans, (week) => week.weekKey);
  const goalsByWeek = groupBy(goals, (goal) => goal.weekKey);

  return keys.map((weekKey) => {
    const run = runs.get(weekKey);
    return {
      weekKey,
      from: run?.fromDate ?? '',
      to: run?.toDate ?? '',
      generatedAt: run?.generatedAt ?? null,
      headline: run?.headline ?? '',
      deferred: (run?.deferred ?? []).filter((line) => typeof line === 'string' && line.trim()),
      model: run?.model || null,
      goals: (goalsByWeek.get(weekKey) ?? [])
        .map((goal) => ({
          id: goal.id,
          title: goal.title,
          done: goal.done,
          order: goal.order ?? null,
        }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id)),
    };
  });
}

// ---------------------------------------------------------------- utilities

/**
 * `HH:MM` for an instant, in the user's timezone.
 *
 * `en-GB` with `hourCycle: 'h23'` because it formats as `09:05` and needs no reassembly, and
 * because `h23` vs `h24` disagree about midnight — one says `00:00`, the other `24:00` — on
 * exactly one minute of the day.
 */
export function wallClock(iso: string, timezone: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '00:00';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(at);
  } catch {
    return iso.slice(11, 16);
  }
}

/**
 * Where a record's bar ends on a timeline.
 *
 * A finished one ends when it ended. A *running* one has no end yet, and reporting `end === start`
 * gives every live session a zero-height bar — invisible on the grid, which is the one entry on
 * the screen you most want to see. So it is drawn from its start across the time it has actually
 * accrued.
 *
 * Deliberately `activeMs` rather than "now": the projection is a pure function and reading a
 * clock inside it would make the same records render differently on two devices a second apart,
 * and make it untestable. The cost is that a session paused for ten minutes draws ten minutes
 * short of the wall clock — which is the honest direction to be wrong in, because it never claims
 * more time than was worked.
 */
function runningEnd(
  startedAt: string,
  endedAt: string | null | undefined,
  accruedMs: number,
  timezone: string,
): string {
  if (endedAt) return wallClock(endedAt, timezone);
  const accrued = new Date(new Date(startedAt).getTime() + Math.max(0, accruedMs));
  return Number.isNaN(accrued.getTime())
    ? wallClock(startedAt, timezone)
    : wallClock(accrued.toISOString(), timezone);
}

/** `HH:MM` → minutes since midnight. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Milliseconds between two wall-clock times. A block never crosses midnight. */
export function spanMs(start: string, end: string): number {
  return Math.max(0, toMinutes(end) - toMinutes(start)) * 60_000;
}

function byKey<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) out.set(key(row), row);
  return out;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

// ------------------------------------------------------------------ reading

/** An empty calendar for a range, so a view has something to render before anything loads. */
export function emptyCalendar(
  from: string,
  to: string,
  timezone: string,
  detail: CalendarDetail = 'full',
): Calendar {
  return buildCalendar(
    {
      from,
      to,
      timezone,
      plans: [],
      sessions: [],
      sits: [],
      days: [],
      weekPlans: [],
      goals: [],
      threads: [],
    },
    detail,
  );
}
