/**
 * The queue's memory, and the one-time backfill.
 *
 * The backfill exists because of a bug that produced no error anywhere: a device that had
 * records before it signed in never queued them — nothing had written them *since* sync existed
 * — so the engine correctly reported nothing pending while the account stayed empty. From the
 * outside that is indistinguishable from sync being broken.
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { SyncState } from './SyncState.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'syncstate-'));
});

async function loaded(): Promise<SyncState> {
  const state = new SyncState(root);
  await state.load();
  return state;
}

describe('the backfill flag', () => {
  it('is false on a device that has never synced', async () => {
    const state = await loaded();
    expect(state.hasBackfilled).toBe(false);
  });

  it('survives a restart once set', async () => {
    const first = await loaded();
    first.markBackfilled();
    await first.flush();

    expect((await loaded()).hasBackfilled).toBe(true);
  });

  /**
   * The case that matters: a sync.json written before the backfill existed. Those are precisely
   * the installs carrying unpushed records, so the absent field has to read as false.
   */
  it('reads as false in a file written before it existed', async () => {
    await writeFile(
      path.join(root, 'sync.json'),
      JSON.stringify({
        version: 1,
        cursor: 3,
        lastSyncedAt: '2026-08-19T12:49:10.184Z',
        profileDirty: false,
        dirty: { threads: [], days: [], sessions: [], mindful: [] },
      }),
    );

    const state = await loaded();
    expect(state.hasBackfilled).toBe(false);
    // And the rest of the file still loads, so the flag is additive.
    expect(state.since).toBe(3);
  });

  it('clears on reset, so a different account is offered this device’s records too', async () => {
    const state = await loaded();
    state.markBackfilled();
    state.reset();
    expect(state.hasBackfilled).toBe(false);
  });
});

describe('queueing many records at once', () => {
  it('queues every key given', async () => {
    const state = await loaded();
    state.markMany('threads', ['01A', '01B', '01C']);
    expect(state.keys('threads').sort()).toEqual(['01A', '01B', '01C']);
    expect(state.pendingCount()).toBe(3);
  });

  it('does not duplicate keys already queued', async () => {
    const state = await loaded();
    state.mark('threads', '01A');
    state.markMany('threads', ['01A', '01B']);
    expect(state.keys('threads').sort()).toEqual(['01A', '01B']);
  });

  it('persists what it queued', async () => {
    const first = await loaded();
    first.markMany('days', ['2026-08-18', '2026-08-19']);
    await first.flush();

    const raw = JSON.parse(await readFile(path.join(root, 'sync.json'), 'utf8'));
    expect(raw.dirty.days.sort()).toEqual(['2026-08-18', '2026-08-19']);
  });

  it('ignores a collection it does not track', async () => {
    const state = await loaded();
    // Should not throw, and should not invent a queue.
    state.markMany('nonsense' as never, ['01A']);
    expect(state.pendingCount()).toBe(0);
  });
});
