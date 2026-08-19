/**
 * Goals and plans through the real `Database` — real files, real schemas, real partitioning.
 *
 * The unit tests above this one exercise the maths; this one exists because the failures that
 * actually reach a user live in the seams: a record that writes fine and fails validation on the
 * next read, a partition key that files a goal under a year it does not belong to, a tombstone
 * that a read path forgets to filter.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Database } from './Database.js';
import { SyncState } from '../sync/SyncState.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'goals-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/** Reopening is the point of most of these: it proves the record survives a serialise/parse. */
async function reopen(db: Database): Promise<Database> {
  await db.close();
  return Database.open(root);
}

describe('goals through the database', () => {
  it('writes a goal that still validates when read back from disk', async () => {
    let db = await Database.open(root);
    const created = await db.goals.add('Ship the thing', '2026-W34');
    expect(created.context).toBe('');

    db = await reopen(db);
    const goals = await db.goals.list('2026-W34');
    expect(goals).toHaveLength(1);
    expect(goals[0]?.title).toBe('Ship the thing');
    await db.close();
  });

  it('files a goal under its ISO week-numbering year, not its calendar year', async () => {
    const db = await Database.open(root);
    // 2026-W53 runs into January 2027, and the file has to follow the week, not the dates.
    await db.goals.add('New year goal', '2026-W53');
    await db.store.flush();

    const files = await fs.readdir(path.join(root, 'goals'));
    expect(files).toEqual(['2026.json']);
    await db.close();
  });

  it('keeps long context intact across a reopen', async () => {
    let db = await Database.open(root);
    const goal = await db.goals.add('With context', '2026-W34');
    const context = 'line one\nline two\n\n- a bullet\n- another';
    await db.goals.update(goal.id, { context });

    db = await reopen(db);
    const goals = await db.goals.list('2026-W34');
    expect(goals[0]?.context).toBe(context);
    await db.close();
  });

  it('stamps a local date on completion and removes it again when un-ticked', async () => {
    const db = await Database.open(root);
    const goal = await db.goals.add('Tick me', '2026-W34');

    const done = await db.goals.toggle(goal.id);
    expect(done.done).toBe(true);
    expect(done.completedLocalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // The keys must be gone, not set to undefined — an explicit undefined serialises to a null
    // that the schema rejects on the next read.
    const undone = await db.goals.toggle(goal.id);
    expect(undone.done).toBe(false);
    expect('completedAt' in undone).toBe(false);
    expect('completedLocalDate' in undone).toBe(false);
    await db.close();
  });

  it('survives a round trip after being un-ticked', async () => {
    let db = await Database.open(root);
    const goal = await db.goals.add('Toggle twice', '2026-W34');
    await db.goals.toggle(goal.id);
    await db.goals.toggle(goal.id);

    db = await reopen(db);
    // A record that failed validation on read would simply be missing here.
    expect(await db.goals.list('2026-W34')).toHaveLength(1);
    await db.close();
  });

  it('hides a deleted goal from every read path but keeps its tombstone on disk', async () => {
    let db = await Database.open(root);
    const goal = await db.goals.add('Delete me', '2026-W34');
    await db.goals.remove(goal.id);

    expect(await db.goals.list('2026-W34')).toHaveLength(0);
    expect(await db.goals.get(goal.id)).toBeNull();
    expect(await db.goals.weeks()).toEqual([]);

    db = await reopen(db);
    expect(await db.goals.list('2026-W34')).toHaveLength(0);
    const raw = JSON.parse(await fs.readFile(path.join(root, 'goals', '2026.json'), 'utf8'));
    expect(raw).toHaveLength(1);
    expect(raw[0].deletedAt).toBeTruthy();
    await db.close();
  });

  it('orders goals by insertion and keeps that order after a reopen', async () => {
    let db = await Database.open(root);
    for (const title of ['first', 'second', 'third']) await db.goals.add(title, '2026-W34');

    db = await reopen(db);
    expect((await db.goals.list('2026-W34')).map((g) => g.title)).toEqual([
      'first',
      'second',
      'third',
    ]);
    await db.close();
  });

  it('moves a goal between weeks and remembers where it started', async () => {
    const db = await Database.open(root);
    const goal = await db.goals.add('Rolls over', '2026-W34');
    const moved = await db.goals.carryOver(goal.id, '2026-W35');

    expect(moved.weekKey).toBe('2026-W35');
    expect(moved.carriedFromWeek).toBe('2026-W34');
    expect(await db.goals.list('2026-W34')).toHaveLength(0);
    expect(await db.goals.list('2026-W35')).toHaveLength(1);

    // Rolling over twice must still point at where it originally came from.
    const again = await db.goals.carryOver(goal.id, '2026-W36');
    expect(again.carriedFromWeek).toBe('2026-W34');
    await db.close();
  });

  it('lists only the weeks that actually have goals, newest first', async () => {
    const db = await Database.open(root);
    await db.goals.add('a', '2026-W34');
    await db.goals.add('b', '2026-W36');
    expect(await db.goals.weeks()).toEqual(['2026-W36', '2026-W34']);
    await db.close();
  });
});

describe('plans through the database', () => {
  const plan = (localDate: string, costUsd: number) => ({
    localDate,
    generatedAt: '2026-08-19T08:00:00.000Z',
    wakeTime: '07:30',
    startTime: '09:00',
    endTime: '18:00',
    blocks: [
      {
        id: '01J5BLOCK000000000000001',
        start: '09:00',
        end: '09:25',
        kind: 'focus' as const,
        title: 'The first real thing',
        why: 'Because it matters most.',
        threadId: '01J5THREAD00000000000001',
      },
    ],
    headline: 'One thing matters today.',
    deferred: ['The invoice, until the accountant replies.'],
    model: 'claude-opus-5',
    usage: { inputTokens: 1581, outputTokens: 1487, costUsd },
  });

  it('round-trips a full plan, blocks and ids intact', async () => {
    let db = await Database.open(root);
    await db.plans.save(plan('2026-08-19', 0.0451));

    db = await reopen(db);
    const saved = await db.plans.get('2026-08-19');
    expect(saved?.headline).toBe('One thing matters today.');
    expect(saved?.blocks[0]?.threadId).toBe('01J5THREAD00000000000001');
    expect(saved?.deferred).toHaveLength(1);
    await db.close();
  });

  it('replaces the plan for a day rather than stacking a second one', async () => {
    const db = await Database.open(root);
    await db.plans.save(plan('2026-08-19', 0.04));
    await db.plans.save({ ...plan('2026-08-19', 0.05), headline: 'Rethought it.' });

    expect((await db.plans.get('2026-08-19'))?.headline).toBe('Rethought it.');
    const spend = await db.plans.spend('2026-08');
    expect(spend.plans).toBe(1);
    expect(spend.costUsd).toBeCloseTo(0.05, 5);
    await db.close();
  });

  it('sums spend for the month asked for, and all time separately', async () => {
    const db = await Database.open(root);
    await db.plans.save(plan('2026-08-19', 0.05));
    await db.plans.save(plan('2026-08-20', 0.03));
    await db.plans.save(plan('2026-07-30', 0.10));

    const august = await db.plans.spend('2026-08');
    expect(august.plans).toBe(2);
    expect(august.costUsd).toBeCloseTo(0.08, 5);
    expect(august.totalPlans).toBe(3);
    expect(august.totalCostUsd).toBeCloseTo(0.18, 5);
    await db.close();
  });

  it('links a block to a thread and leaves every other block alone', async () => {
    let db = await Database.open(root);
    const saved = await db.plans.save({
      ...plan('2026-08-19', 0.05),
      blocks: [
        { id: 'b1', start: '09:00', end: '09:25', kind: 'admin' as const, title: 'Renew the domain' },
        { id: 'b2', start: '09:30', end: '09:55', kind: 'focus' as const, title: 'Something else' },
      ],
    });
    expect(saved.blocks[0]?.threadId).toBeUndefined();

    await db.plans.linkBlock('2026-08-19', 'b1', '01J5THREAD00000000000009');

    db = await reopen(db);
    const linked = await db.plans.get('2026-08-19');
    expect(linked?.blocks[0]?.threadId).toBe('01J5THREAD00000000000009');
    expect(linked?.blocks[1]?.threadId).toBeUndefined();
    // Linking must not disturb anything else about the plan.
    expect(linked?.headline).toBe('One thing matters today.');
    await db.close();
  });

  it('refuses to link a block on a day with no plan', async () => {
    const db = await Database.open(root);
    await expect(db.plans.linkBlock('2026-08-19', 'b1', 't1')).rejects.toThrow();
    await db.close();
  });

  it('forgets what a plan cost when the plan is thrown away', async () => {
    const db = await Database.open(root);
    await db.plans.save(plan('2026-08-19', 0.05));
    await db.plans.remove('2026-08-19');

    expect(await db.plans.get('2026-08-19')).toBeNull();
    expect((await db.plans.spend('2026-08')).costUsd).toBe(0);
    await db.close();
  });

  it('splits plans into month files', async () => {
    const db = await Database.open(root);
    await db.plans.save(plan('2026-08-19', 0.05));
    await db.plans.save(plan('2026-07-30', 0.05));
    await db.store.flush();

    expect((await fs.readdir(path.join(root, 'plans'))).sort()).toEqual([
      '2026-07.json',
      '2026-08.json',
    ]);
    await db.close();
  });
});

describe('the sync queue', () => {
  /**
   * The inverse of the guard this replaced.
   *
   * Goals used to be desktop-local, and a test here asserted they never entered the push queue —
   * a deliberate tripwire, to be removed on the day the backend grew columns for them rather
   * than left to start failing mysteriously. That day has come: a goal written on the laptop has
   * to reach the phone, so it must queue.
   */
  it('queues a goal for push, alongside a thread', async () => {
    const syncState = new SyncState(root);
    await syncState.load();

    // Wired exactly as AppContext wires it, so this exercises the real path rather than a
    // reimplementation of it.
    const db = await Database.open(root, {
      onWrite: (collection, key) => syncState.mark(collection, key),
    });

    const goal = await db.goals.add('A goal', '2026-W34');
    expect(syncState.keys('goals' as never)).toEqual([goal.id]);

    const thread = await db.threads.create('A thread');
    expect(syncState.keys('threads' as never)).toEqual([thread.id]);
    expect(syncState.pendingCount()).toBe(2);

    await db.close();
  });

  /**
   * The one asymmetry worth a test: the server authors plans, this app does not.
   *
   * A plan arriving from a generation is written through the untracked path, so it does not
   * queue — pushing it back would burn a round trip settling a conflict with ourselves. Throwing
   * one away *is* a local decision, and that has to travel.
   */
  it('does not queue a plan the server produced, but does queue throwing one away', async () => {
    const syncState = new SyncState(root);
    await syncState.load();
    const db = await Database.open(root, {
      onWrite: (collection, key) => syncState.mark(collection, key),
    });

    await db.plans.saveWeek(
      {
        weekKey: '2026-W34',
        generatedAt: '2026-08-19T08:00:00.000Z',
        fromDate: '2026-08-19',
        toDate: '2026-08-23',
        headline: 'A week',
        deferred: [],
        model: 'claude-opus-5',
        usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      },
      [
        {
          localDate: '2026-08-19',
          weekKey: '2026-W34',
          generatedAt: '2026-08-19T08:00:00.000Z',
          wakeTime: '07:30',
          startTime: '09:00',
          endTime: '18:00',
          blocks: [],
          headline: 'x',
        },
      ],
    );

    expect(syncState.keys('plans' as never)).toEqual([]);
    expect(syncState.keys('weekPlans' as never)).toEqual([]);
    expect(syncState.pendingCount()).toBe(0);

    await db.plans.remove('2026-08-19');
    expect(syncState.keys('plans' as never)).toEqual(['2026-08-19']);
    // The tombstone stays readable on disk, but reads as no plan.
    expect(await db.plans.get('2026-08-19')).toBeNull();

    await db.close();
  });
});
