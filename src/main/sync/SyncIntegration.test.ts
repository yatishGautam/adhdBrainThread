/**
 * Two devices, one account, a real server.
 *
 * Everything else in this repo proves the client is self-consistent. These prove it agrees with
 * the backend — which a fixture cannot, because a fixture I wrote decodes perfectly forever,
 * including when it is wrong about what the server actually sends.
 *
 *   cd ../adhd-webapp && npm run dev:up && npm run dev
 *   ADHD_TEST_API=http://localhost:8099 npm test
 *
 * The second device is raw HTTP against the same account — that is exactly what the phone is,
 * and standing one up here is cheaper and more honest than mocking one.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MindfulSession, Thread } from '@shared/domain.js';
import { ApiClient } from '../services/ApiClient.js';
import { Database } from '../storage/Database.js';
import { COLLECTION } from '../storage/Store.js';
import { SyncEngine } from './SyncEngine.js';
import { SyncState } from './SyncState.js';

const API = process.env.ADHD_TEST_API;
const PASSWORD = 'correct-horse-battery';

/** The other device. Deliberately not this codebase — that is the whole point of it. */
class Phone {
  constructor(
    private readonly base: string,
    private readonly token: string,
  ) {}

  async push(body: Record<string, unknown>): Promise<{ applied: string[]; seq: number }> {
    const response = await fetch(`${this.base}/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`phone push failed: ${response.status} ${await response.text()}`);
    return (await response.json()) as { applied: string[]; seq: number };
  }

  async pull(): Promise<{
    threads: Record<string, unknown>[];
    mindfulSessions?: Record<string, unknown>[];
    goals?: Record<string, unknown>[];
    plans?: Record<string, unknown>[];
  }> {
    const response = await fetch(`${this.base}/sync?since=0`, {
      headers: { authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) throw new Error(`phone pull failed: ${response.status}`);
    return (await response.json()) as never;
  }
}

describe.skipIf(!API)('a laptop and a phone on one account', () => {
  const base = API as string;
  let root: string;
  let db: Database;
  let state: SyncState;
  let engine: SyncEngine;
  let phone: Phone;
  let token: string;

  beforeAll(async () => {
    const client = new ApiClient(base);
    const email = `sync-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    token = (await client.register(email, PASSWORD, 'Europe/London')).token;
    phone = new Phone(base, token);

    root = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-desktop-'));
    state = new SyncState(root);
    await state.load();
    db = await Database.open(root, {
      onWrite: (collection, key) => state.mark(collection, key),
    });

    // The engine only ever asks auth for a token and a client, so a stub is the whole surface.
    const auth = {
      currentToken: () => token,
      api: client,
      handleUnauthorized: async () => {},
    };
    engine = new SyncEngine(db, auth as never, state, () => {});
  });

  afterAll(async () => {
    if (!API) return;
    await new ApiClient(base).deleteAccount(token).catch(() => {});
    await db?.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('sends a thread written on the laptop to the server', async () => {
    const created = await db.threads.create('Ship the sync engine');
    expect(state.pendingCount()).toBeGreaterThan(0);

    const outcome = await engine.sync();
    expect(outcome?.pushed).toBeGreaterThan(0);
    expect(state.pendingCount()).toBe(0);

    const onServer = (await phone.pull()).threads.find((row) => row.id === created.id);
    expect(onServer).toBeDefined();
    expect(onServer?.title).toBe('Ship the sync engine');
  });

  it('brings back a sit recorded on the phone — the thing that did not work before', async () => {
    const sit = {
      id: `01MIND${Date.now()}`,
      startedAt: '2026-08-18T07:00:00.000Z',
      endedAt: '2026-08-18T07:10:00.000Z',
      localDate: '2026-08-18',
      plannedMs: 600_000,
      actualMs: 600_000,
      completed: true,
      updatedAt: '2026-08-18T07:10:00.000Z',
    };
    await phone.push({ mindfulSessions: [sit] });

    await engine.sync();

    const stored = await db.store.collection<MindfulSession>(COLLECTION.mindful).get(sit.id);
    expect(stored).not.toBeNull();
    expect(stored?.actualMs).toBe(600_000);
    expect(stored?.completed).toBe(true);
    // A sit must not land among focus sessions, or it inflates momentum.
    expect(await db.sessions.get(sit.id)).toBeNull();
  });

  it('applies a thread the phone created', async () => {
    const id = `01PHONE${Date.now()}`;
    await phone.push({
      threads: [
        {
          id,
          title: 'Written on the phone',
          notes: '',
          status: 'in_progress',
          steps: [],
          createdAt: '2026-08-18T08:00:00.000Z',
          updatedAt: '2026-08-18T08:00:00.000Z',
        },
      ],
    });

    await engine.sync();

    const local = await db.threads.get(id);
    expect(local?.title).toBe('Written on the phone');
  });

  it('keeps a delete deleted, instead of resurrecting it on the next sync', async () => {
    const id = `01GONE${Date.now()}`;
    await phone.push({
      threads: [
        {
          id,
          title: 'Deleted on the phone',
          notes: '',
          status: 'in_progress',
          steps: [],
          createdAt: '2026-08-18T08:00:00.000Z',
          updatedAt: '2026-08-18T08:00:00.000Z',
        },
      ],
    });
    await engine.sync();
    expect(await db.threads.get(id)).not.toBeNull();

    await phone.push({
      threads: [
        {
          id,
          title: 'Deleted on the phone',
          notes: '',
          status: 'in_progress',
          steps: [],
          createdAt: '2026-08-18T08:00:00.000Z',
          updatedAt: '2026-08-18T09:00:00.000Z',
          deletedAt: '2026-08-18T09:00:00.000Z',
        },
      ],
    });
    await engine.sync();

    // Gone from every read path…
    expect(await db.threads.get(id)).toBeNull();
    expect((await db.threads.list()).some((thread) => thread.id === id)).toBe(false);
    // …but still on disk as a tombstone, or this device would re-upload it as new.
    const raw = await db.store.collection<Thread>(COLLECTION.threads).get(id);
    expect(raw?.deletedAt).toBeTruthy();
  });

  it('lets the newer edit win when both devices changed the same thread', async () => {
    const created = await db.threads.create('Contested');
    await engine.sync();

    // The phone edits it a minute into the future, and this laptop edits it now. The phone's
    // version is newer, so the laptop's must lose — silently, without a prompt.
    const later = new Date(Date.now() + 60_000).toISOString();
    await phone.push({
      threads: [
        {
          id: created.id,
          title: 'Edited on the phone',
          notes: '',
          status: 'in_progress',
          steps: [],
          createdAt: created.createdAt,
          updatedAt: later,
        },
      ],
    });
    await db.threads.save({ ...created, title: 'Edited on the laptop' });

    await engine.sync();

    expect((await db.threads.get(created.id))?.title).toBe('Edited on the phone');
    // And the losing copy is not left in the queue to be retried forever.
    expect(state.keys(COLLECTION.threads)).not.toContain(created.id);
  });

  it('does not re-push what it just pulled', async () => {
    await engine.sync();
    expect(state.pendingCount()).toBe(0);
    const second = await engine.sync();
    expect(second?.pushed).toBe(0);
  });

  /**
   * Goals are the collection this feature added that a *client* authors, so this is the one that
   * has to survive a round trip in both directions. Plans go the other way — the server writes
   * them — and are covered by the planner's own tests.
   */
  it('sends a goal written on the laptop to the server, context and all', async () => {
    const goal = await db.goals.add('Ship the week planner', '2026-W34');
    await db.goals.update(goal.id, { context: 'Backend is live.\nPhone needs a goals screen.' });
    expect(state.pendingCount()).toBeGreaterThan(0);

    await engine.sync();
    expect(state.pendingCount()).toBe(0);

    const onServer = (await phone.pull()).goals?.find((row) => row.id === goal.id);
    expect(onServer).toBeDefined();
    expect(onServer?.title).toBe('Ship the week planner');
    // The field the planner actually reads. A newline in it is the part a careless mapper eats.
    expect(onServer?.context).toBe('Backend is live.\nPhone needs a goals screen.');
    expect(onServer?.weekKey).toBe('2026-W34');
  });

  it('applies a goal the phone created, ordering and all', async () => {
    const id = `01PHONEGOAL${Date.now()}`;
    await phone.push({
      goals: [
        {
          id,
          title: 'Set from the phone',
          done: false,
          context: '',
          weekKey: '2026-W34',
          // `boardOrder` on the wire, `order` locally — the rename that, done wrong, shows up
          // as a list that reshuffles on every sync rather than as an error.
          order: 3000,
          createdAt: '2026-08-17T09:00:00.000Z',
          updatedAt: '2026-08-17T09:00:00.000Z',
        },
      ],
    });

    await engine.sync();

    const stored = await db.goals.get(id);
    expect(stored?.title).toBe('Set from the phone');
    expect(stored?.order).toBe(3000);
  });

  /**
   * The plan the server generates has to arrive here intact — including `promoted`, which is
   * what stops a regeneration orphaning a thread the user already started work on.
   */
  it('brings in a plan the server wrote, keeping the promoted flag on its blocks', async () => {
    await phone.push({
      plans: [
        {
          localDate: '2026-08-19',
          weekKey: '2026-W34',
          generatedAt: '2026-08-19T08:00:00.000Z',
          wakeTime: '07:00',
          startTime: '09:00',
          endTime: '18:00',
          headline: 'One thing today.',
          blocks: [
            {
              id: '20260819-00',
              start: '09:00',
              end: '09:25',
              kind: 'focus',
              title: 'The thing already underway',
              threadId: 'thread-real',
              promoted: true,
            },
          ],
          updatedAt: '2026-08-19T08:00:00.000Z',
        },
      ],
      weekPlans: [
        {
          weekKey: '2026-W34',
          generatedAt: '2026-08-19T08:00:00.000Z',
          fromDate: '2026-08-19',
          toDate: '2026-08-23',
          headline: 'The shape of the week.',
          deferred: ['Not this week: the accountant.'],
          model: 'claude-opus-5',
          usage: { inputTokens: 2956, outputTokens: 4284, costUsd: 0.12188 },
          updatedAt: '2026-08-19T08:00:00.000Z',
        },
      ],
    });

    await engine.sync();

    const plan = await db.plans.get('2026-08-19');
    expect(plan?.blocks[0]?.promoted).toBe(true);
    expect(plan?.blocks[0]?.threadId).toBe('thread-real');

    const week = await db.plans.getWeek('2026-W34');
    expect(week?.deferred).toEqual(['Not this week: the accountant.']);
    // The cost is the server's number, round-tripped rather than recomputed anywhere.
    expect(week?.usage.costUsd).toBeCloseTo(0.12188, 5);

    // A plan the server wrote must not be queued straight back at it.
    expect(state.keys('plans' as never)).toEqual([]);
    expect(state.keys('weekPlans' as never)).toEqual([]);
  });

});