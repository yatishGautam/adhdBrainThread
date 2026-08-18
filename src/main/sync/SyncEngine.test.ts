/**
 * The parts of sync that decide what happens to your data: which copy of a record wins, whether
 * a delete stays deleted, and whether a first sync is small enough for the server to accept.
 *
 * A real backend is not needed for any of it — SyncIntegration.test.ts covers that. What these
 * cover is the reasoning, which is where sync goes quietly wrong: a conflict resolved the wrong
 * way loses work, and nothing fails.
 */
import { describe, expect, it } from 'vitest';
import type { Day, MindfulSession, Session, Thread } from '@shared/domain.js';
import { chunk } from './SyncEngine.js';
import { dayIn, dayOut, mindfulIn, sessionIn, threadIn, threadOut } from './wire.js';

function thread(id: string, updatedAt: string, extra: Partial<Thread> = {}): Thread {
  return {
    id,
    title: id,
    notes: '',
    status: 'in_progress',
    steps: [],
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt,
    totalFocusMs: 0,
    sessionCount: 0,
    distractionCount: 0,
    archived: false,
    ...extra,
  };
}

describe('the wire format', () => {
  it('translates the server column names, which are not the local ones', () => {
    const decoded = threadIn({
      id: '01ABC',
      title: 'Ship the backend',
      status: 'in_progress',
      // The server says boardOrder; this app says order.
      boardOrder: 2000,
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: '2026-08-02T09:00:00.000Z',
    });
    expect(decoded?.order).toBe(2000);

    const day = dayIn({
      localDate: '2026-08-13',
      createdAt: '2026-08-13T09:00:00.000Z',
      // …and nowText, where this app says now.
      nowText: 'writing the sync engine',
      updatedAt: '2026-08-13T10:00:00.000Z',
    });
    expect(day?.now).toBe('writing the sync engine');
  });

  it('accepts a date column whether it arrives as a day or a full timestamp', () => {
    expect(dayIn({ localDate: '2026-08-13T00:00:00.000Z', createdAt: '2026-08-13T09:00:00.000Z' })?.localDate)
      .toBe('2026-08-13');
    expect(dayIn({ localDate: '2026-08-13', createdAt: '2026-08-13T09:00:00.000Z' })?.localDate)
      .toBe('2026-08-13');
  });

  it('reads numbers that Postgres drivers hand back as strings', () => {
    const decoded = sessionIn({
      id: '01S',
      threadId: '01T',
      startedAt: '2026-08-13T09:00:00.000Z',
      localDate: '2026-08-13',
      plannedMs: '1500000',
      activeMs: '1500000',
      outcome: 'completed',
      updatedAt: '2026-08-13T09:25:00.000Z',
    });
    expect(decoded?.plannedMs).toBe(1_500_000);
    expect(decoded?.activeMs).toBe(1_500_000);
  });

  it('survives a record from a newer server without throwing', () => {
    const decoded = threadIn({
      id: '01ABC',
      title: 'Ship it',
      status: 'a_status_this_version_has_never_heard_of',
      somethingNew: { nested: true },
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: '2026-08-02T09:00:00.000Z',
    });
    // Falls back rather than refusing the record — a client that crashes on an unfamiliar
    // payload cannot be released independently of the server, and these three apps are.
    expect(decoded?.status).toBe('in_progress');
    expect(decoded?.title).toBe('Ship it');
  });

  it('refuses a record with no identity rather than inventing one', () => {
    expect(threadIn({ title: 'no id' })).toBeNull();
    expect(sessionIn({ id: '01S', startedAt: '2026-08-13T09:00:00.000Z' })).toBeNull();
    expect(mindfulIn({ id: '01M', localDate: '2026-08-13' })).toBeNull();
  });

  it('sends a delete as a tombstone, never as an absent record', () => {
    const deleted = threadOut(thread('01ABC', '2026-08-13T10:00:00.000Z', { deletedAt: '2026-08-13T10:00:00.000Z' }));
    expect(deleted.deletedAt).toBe('2026-08-13T10:00:00.000Z');
    expect(deleted.id).toBe('01ABC');
  });

  it('gives a pre-sync day its createdAt rather than pretending it was just edited', () => {
    const day: Day = {
      localDate: '2026-08-01',
      createdAt: '2026-08-01T09:00:00.000Z',
      intentThreadIds: [],
      todos: [],
      thoughts: [],
      loggedThreadIds: [],
    };
    // Stamping "now" here would make an old local day beat a newer one from the phone.
    expect(dayOut(day).updatedAt).toBe('2026-08-01T09:00:00.000Z');
  });
});

describe('batching a first sync', () => {
  const sits: MindfulSession[] = [
    { id: '01M', startedAt: '2026-08-13T07:00:00.000Z', localDate: '2026-08-13', plannedMs: 600000, actualMs: 600000, completed: true },
  ];

  it('splits past the server limits rather than sending a body it will reject', () => {
    const threads = Array.from({ length: 4500 }, (_, i) => thread(`t${i}`, '2026-08-13T10:00:00.000Z'));
    const batches = chunk(threads, [], [], []);
    expect(batches).toHaveLength(3);
    expect(batches[0]?.threads).toHaveLength(2000);
    expect(batches[2]?.threads).toHaveLength(500);
    expect(batches.flatMap((batch) => batch.threads)).toHaveLength(4500);
  });

  it('sends sits once, in the first batch, rather than with every page', () => {
    const threads = Array.from({ length: 2500 }, (_, i) => thread(`t${i}`, '2026-08-13T10:00:00.000Z'));
    const batches = chunk(threads, [], [], sits);
    expect(batches[0]?.sits).toHaveLength(1);
    expect(batches[1]?.sits).toHaveLength(0);
  });

  it('still produces one batch when only the profile changed', () => {
    expect(chunk([], [], [], [])).toHaveLength(1);
  });

  it('pages each kind independently — 3000 days do not drag threads into a second batch', () => {
    const days: Day[] = Array.from({ length: 3000 }, (_, i) => ({
      localDate: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
      createdAt: '2026-08-01T09:00:00.000Z',
      intentThreadIds: [],
      todos: [],
      thoughts: [],
      loggedThreadIds: [],
    }));
    const sessions: Session[] = [];
    const batches = chunk([thread('t0', '2026-08-13T10:00:00.000Z')], days, sessions, []);
    expect(batches).toHaveLength(2);
    expect(batches[0]?.threads).toHaveLength(1);
    expect(batches[1]?.threads).toHaveLength(0);
    expect(batches[1]?.days).toHaveLength(1000);
  });
});
