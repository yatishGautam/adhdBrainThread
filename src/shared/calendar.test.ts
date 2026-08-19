/**
 * Ported from the backend's `src/calendar.test.ts`, on the same instruction that brought
 * `week.test.ts` across: port the tests, not only the code. Two implementations of one
 * projection are only safe if the same cases hold both sides.
 *
 * The cases worth having are the ones that fail silently. A calendar that quietly drops a day,
 * marks a block done because the afternoon arrived, or moves a late-evening session onto tomorrow
 * all *look* fine on screen — you only find out by disagreeing with your own week weeks later.
 */
import { describe, expect, it } from 'vitest';
import { buildCalendar, wallClock, type CalendarSources } from './calendar.js';
import type { Day, DayPlan, Goal, MindfulSession, PlanBlock, Session, WeekPlan } from './domain.js';

const EMPTY: CalendarSources = {
  from: '2026-08-17',
  to: '2026-08-23',
  timezone: 'UTC',
  plans: [],
  sessions: [],
  sits: [],
  days: [],
  weekPlans: [],
  goals: [],
  threads: [],
};

function sources(patch: Partial<CalendarSources> = {}): CalendarSources {
  return { ...EMPTY, ...patch };
}

function block(patch: Partial<PlanBlock> = {}): PlanBlock {
  return {
    id: '20260819-00',
    start: '09:00',
    end: '10:00',
    kind: 'focus',
    title: 'Write the backfill script',
    ...patch,
  };
}

function plan(patch: Partial<DayPlan> = {}): DayPlan {
  return {
    localDate: '2026-08-19',
    weekKey: '2026-W34',
    generatedAt: '2026-08-19T08:00:00.000Z',
    wakeTime: '07:00',
    startTime: '09:00',
    endTime: '18:00',
    headline: 'One thing today.',
    blocks: [block()],
    ...patch,
  };
}

function session(patch: Partial<Session> = {}): Session {
  return {
    id: '01SESSION',
    threadId: 'thread-1',
    localDate: '2026-08-19',
    startedAt: '2026-08-19T09:05:00.000Z',
    endedAt: '2026-08-19T09:30:00.000Z',
    plannedMs: 1_500_000,
    activeMs: 1_500_000,
    grantedMs: 0,
    outcome: 'completed',
    distractions: [],
    pauses: [],
    ...patch,
  };
}

function sit(patch: Partial<MindfulSession> = {}): MindfulSession {
  return {
    id: '01SIT',
    localDate: '2026-08-19',
    startedAt: '2026-08-19T11:00:00.000Z',
    endedAt: '2026-08-19T11:10:00.000Z',
    plannedMs: 600_000,
    actualMs: 600_000,
    completed: true,
    ...patch,
  };
}

function day(patch: Partial<Day> = {}): Day {
  return {
    localDate: '2026-08-19',
    createdAt: '2026-08-19T09:00:00.000Z',
    intentThreadIds: [],
    todos: [],
    thoughts: [],
    loggedThreadIds: [],
    ...patch,
  };
}

function goal(patch: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    title: 'Get the billing migration merged',
    done: false,
    context: '',
    weekKey: '2026-W34',
    order: 1000,
    createdAt: '2026-08-17T09:00:00.000Z',
    updatedAt: '2026-08-17T09:00:00.000Z',
    ...patch,
  };
}

function weekPlan(patch: Partial<WeekPlan> = {}): WeekPlan {
  return {
    weekKey: '2026-W34',
    generatedAt: '2026-08-19T08:00:00.000Z',
    fromDate: '2026-08-19',
    toDate: '2026-08-23',
    headline: 'Two goals on the table.',
    deferred: [],
    model: 'claude-opus-5',
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    ...patch,
  };
}

const on = (calendar: ReturnType<typeof buildCalendar>, date: string) =>
  calendar.days.find((d) => d.localDate === date);

describe('buildCalendar', () => {
  it('gives every day in the range a column, including the empty ones', () => {
    const calendar = buildCalendar(sources());
    expect(calendar.days).toHaveLength(7);
    expect(calendar.days[0]?.localDate).toBe('2026-08-17');
    expect(calendar.days[6]?.localDate).toBe('2026-08-23');
    expect(on(calendar, '2026-08-20')?.entries).toEqual([]);
    expect(on(calendar, '2026-08-20')?.summary.planned).toBe(false);
  });

  it('puts plan blocks and the sessions that happened on one timeline, in time order', () => {
    const calendar = buildCalendar(
      sources({
        plans: [plan({ blocks: [block({ id: 'b1', start: '14:00', end: '15:00' }), block()] })],
        sessions: [session()],
        threads: [{ id: 'thread-1', title: 'Billing migration' }],
      }),
    );
    expect(on(calendar, '2026-08-19')?.entries?.map((e) => [e.start, e.source])).toEqual([
      ['09:00', 'plan'],
      ['09:05', 'session'],
      ['14:00', 'plan'],
    ]);
    expect(on(calendar, '2026-08-19')?.entries?.[1]?.title).toBe('Billing migration');
  });

  /**
   * The one that makes the calendar honest. A block is done because time was spent on its
   * thread, never because the clock has gone past its end.
   */
  it('marks a block done only when a real session touched its thread', () => {
    const done = buildCalendar(
      sources({
        plans: [plan({ blocks: [block({ threadId: 'thread-1' })] })],
        sessions: [session()],
      }),
    );
    expect(on(done, '2026-08-19')?.entries?.[0]?.status).toBe('done');
    expect(on(done, '2026-08-19')?.entries?.[0]?.actualMs).toBe(1_500_000);

    // Same block, same long-past day, no session: still planned. Nothing consults the clock.
    const missed = buildCalendar(
      sources({ plans: [plan({ blocks: [block({ threadId: 'thread-1' })] })] }),
    );
    expect(on(missed, '2026-08-19')?.entries?.[0]?.status).toBe('planned');
  });

  it('matches a block done later in the day, not only one done at its scheduled hour', () => {
    const calendar = buildCalendar(
      sources({
        plans: [plan({ blocks: [block({ threadId: 'thread-1' })] })],
        sessions: [
          session({ startedAt: '2026-08-19T20:40:00.000Z', endedAt: '2026-08-19T21:05:00.000Z' }),
        ],
      }),
    );
    expect(on(calendar, '2026-08-19')?.entries?.[0]?.status).toBe('done');
  });

  /**
   * The same thread twice in a day is the common shape — an hour in the morning, another after
   * lunch. Crediting both blocks with every minute spent on the thread reports two hours for one.
   */
  it('gives each session to one block, so a thread planned twice does not double-count', () => {
    const calendar = buildCalendar(
      sources({
        plans: [
          plan({
            blocks: [
              block({ id: 'morning', start: '09:00', end: '10:00', threadId: 'thread-1' }),
              block({ id: 'afternoon', start: '13:30', end: '15:00', threadId: 'thread-1' }),
            ],
          }),
        ],
        sessions: [
          session({ id: 'a', startedAt: '2026-08-19T09:05:00.000Z', activeMs: 1_500_000 }),
          session({ id: 'b', startedAt: '2026-08-19T14:10:00.000Z', activeMs: 1_800_000 }),
        ],
      }),
    );

    const today = on(calendar, '2026-08-19');
    const byId = new Map(today?.entries?.map((entry) => [entry.id, entry]));
    expect(byId.get('plan:2026-08-19:morning')?.actualMs).toBe(1_500_000);
    expect(byId.get('plan:2026-08-19:afternoon')?.actualMs).toBe(1_800_000);

    const claimed = (today?.entries ?? [])
      .filter((entry) => entry.source === 'plan')
      .reduce((total, entry) => total + (entry.actualMs ?? 0), 0);
    expect(claimed).toBe(today?.summary.focusMs);
    expect(today?.summary.blocksDone).toBe(2);
  });

  it('keeps work that was never planned — the difference between the week you designed and had', () => {
    const calendar = buildCalendar(
      sources({
        sessions: [session({ threadId: 'never-planned' })],
        threads: [{ id: 'never-planned', title: 'Firefighting' }],
      }),
    );
    expect(on(calendar, '2026-08-19')?.entries).toHaveLength(1);
    expect(on(calendar, '2026-08-19')?.entries?.[0]?.title).toBe('Firefighting');
    expect(on(calendar, '2026-08-19')?.summary.focusMs).toBe(1_500_000);
  });

  it('files a session on the day its client stamped, never on one derived from the timestamp', () => {
    // 23:40 in Toronto on the 19th is 03:40 UTC on the 20th. The record says the 19th, and the
    // record wins — the DST/midnight bug the whole app is careful about.
    const calendar = buildCalendar(
      sources({
        timezone: 'America/Toronto',
        sessions: [
          session({
            localDate: '2026-08-19',
            startedAt: '2026-08-20T03:40:00.000Z',
            endedAt: '2026-08-20T04:05:00.000Z',
          }),
        ],
      }),
    );

    expect(on(calendar, '2026-08-20')?.entries).toEqual([]);
    expect(on(calendar, '2026-08-19')?.entries?.[0]?.start).toBe('23:40');
  });

  it('leaves a running session running, and carries the raw instants through', () => {
    const calendar = buildCalendar(
      sources({ sessions: [session({ endedAt: undefined, activeMs: 300_000 })] }),
    );
    const entry = on(calendar, '2026-08-19')?.entries?.[0];
    expect(entry?.status).toBe('running');
    expect(entry?.startedAt).toBe('2026-08-19T09:05:00.000Z');
    expect(entry?.endedAt).toBeUndefined();
  });

  /**
   * A live session reported as ending when it started draws a zero-height bar on the week grid —
   * invisible, on the one entry you most want to see. It is drawn across its accrued time instead.
   */
  it('draws a running session across the time it has accrued so far', () => {
    const calendar = buildCalendar(
      sources({ sessions: [session({ endedAt: undefined, activeMs: 25 * 60_000 })] }),
    );
    const entry = on(calendar, '2026-08-19')?.entries?.[0];
    expect(entry?.start).toBe('09:05');
    expect(entry?.end).toBe('09:30');
    // And it still says it is running — the drawn end is not an end.
    expect(entry?.status).toBe('running');
    expect(entry?.endedAt).toBeUndefined();
  });

  /** Tombstones are records too, and a deleted session that still draws is a ghost on the week. */
  it('ignores tombstoned records everywhere', () => {
    const calendar = buildCalendar(
      sources({
        plans: [plan({ deletedAt: '2026-08-19T10:00:00.000Z' })],
        sessions: [session({ deletedAt: '2026-08-19T10:00:00.000Z' })],
        sits: [sit({ deletedAt: '2026-08-19T10:00:00.000Z' })],
        goals: [goal({ deletedAt: '2026-08-19T10:00:00.000Z' })],
        weekPlans: [weekPlan({ deletedAt: '2026-08-19T10:00:00.000Z' })],
      }),
    );
    expect(on(calendar, '2026-08-19')?.entries).toEqual([]);
    expect(on(calendar, '2026-08-19')?.plan).toBeNull();
    expect(calendar.weeks[0]?.goals).toEqual([]);
    expect(calendar.weeks[0]?.generatedAt).toBeNull();
  });

  it('counts only work blocks as planned time, and reports what was matched', () => {
    const calendar = buildCalendar(
      sources({
        plans: [
          plan({
            blocks: [
              block({ id: 'a', threadId: 'thread-1' }),
              block({ id: 'b', start: '10:00', end: '10:15', kind: 'break', title: 'Tea' }),
              block({ id: 'c', start: '12:00', end: '13:00', kind: 'meal', title: 'Lunch' }),
              block({ id: 'd', start: '14:00', end: '15:00', kind: 'admin', title: 'Inbox' }),
            ],
          }),
        ],
        sessions: [session()],
        sits: [sit()],
      }),
    );

    const summary = on(calendar, '2026-08-19')?.summary;
    // Focus + admin only: two hours. The break and the meal are not work you owe anyone.
    expect(summary?.plannedMs).toBe(2 * 60 * 60_000);
    expect(summary?.blocks).toBe(4);
    expect(summary?.blocksDone).toBe(1);
    expect(summary?.sessions).toBe(1);
    expect(summary?.sitMs).toBe(600_000);
  });

  it('counts the day’s to-dos', () => {
    const calendar = buildCalendar(
      sources({
        days: [
          day({
            todos: [
              {
                id: '1',
                text: 'email the vendor',
                done: false,
                localDate: '2026-08-19',
                createdAt: '2026-08-19T09:00:00.000Z',
                order: 1000,
              },
              {
                id: '2',
                text: 'book the room',
                done: true,
                localDate: '2026-08-19',
                createdAt: '2026-08-19T09:00:00.000Z',
                order: 2000,
              },
            ],
          }),
        ],
      }),
    );
    expect(on(calendar, '2026-08-19')?.summary.todosOpen).toBe(1);
    expect(on(calendar, '2026-08-19')?.summary.todosDone).toBe(1);
  });

  it('returns a week entry even when the week was never planned', () => {
    const calendar = buildCalendar(sources());
    expect(calendar.weeks).toHaveLength(1);
    expect(calendar.weeks[0]).toMatchObject({ weekKey: '2026-W34', generatedAt: null, goals: [] });
  });

  it('carries the run and its goals, in board order', () => {
    const calendar = buildCalendar(
      sources({
        weekPlans: [weekPlan({ deferred: ['Not this week: the accountant.', '  '] })],
        goals: [
          goal({ id: 'g2', title: 'Second', order: 2000 }),
          goal({ id: 'g1', title: 'First', done: true, order: 1000 }),
          goal({ id: 'g9', title: 'Other week', weekKey: '2026-W35' }),
        ],
      }),
    );
    expect(calendar.weeks[0]?.deferred).toEqual(['Not this week: the accountant.']);
    expect(calendar.weeks[0]?.goals.map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it('spans two weeks when the range does', () => {
    const calendar = buildCalendar(sources({ from: '2026-08-21', to: '2026-08-25' }));
    expect(calendar.weeks.map((week) => week.weekKey)).toEqual(['2026-W34', '2026-W35']);
  });

  it('drops entries at summary detail but keeps every summary', () => {
    const calendar = buildCalendar(
      sources({ plans: [plan()], sessions: [session()] }),
      'summary',
    );
    expect(on(calendar, '2026-08-19')?.entries).toBeUndefined();
    expect(on(calendar, '2026-08-19')?.summary.blocks).toBe(1);
    expect(on(calendar, '2026-08-19')?.plan?.headline).toBe('One thing today.');
  });
});

describe('wallClock', () => {
  it('renders midnight as 00:00, not 24:00', () => {
    expect(wallClock('2026-08-19T00:00:00.000Z', 'UTC')).toBe('00:00');
  });

  it('applies the timezone', () => {
    expect(wallClock('2026-08-19T13:05:00.000Z', 'America/Toronto')).toBe('09:05');
    expect(wallClock('2026-08-19T13:05:00.000Z', 'Europe/Berlin')).toBe('15:05');
  });

  it('survives an unknown timezone and a malformed timestamp', () => {
    expect(wallClock('2026-08-19T13:05:00.000Z', 'Mars/Olympus')).toBe('13:05');
    expect(wallClock('not a date', 'UTC')).toBe('00:00');
  });
});
