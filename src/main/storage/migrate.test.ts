import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate, needsMigration } from './migrate.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'migrate-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/** The old engine's file shape: `{ id, records: [...] }`, indexed by a manifest. */
async function writeShard(relative: string, records: unknown[]): Promise<void> {
  const file = path.join(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ id: path.basename(relative, '.json'), records }));
}

async function readJson<T>(relative: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(root, relative), 'utf8')) as T;
}

async function buildOldLayout(): Promise<void> {
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify({ version: 1 }));
  await fs.writeFile(path.join(root, 'journal.jsonl'), '');
  await writeShard('threads/active.json', [{ id: 't1', title: 'Live' }]);
  await writeShard('threads/archive/thr-000001.json', [{ id: 't2', title: 'Old' }]);
  await writeShard('days/day-000001.json', [
    { localDate: '2026-07-30', todos: [] },
    { localDate: '2026-08-02', todos: [] },
  ]);
  await writeShard('sessions/ses-000001.json', [{ id: 's1', localDate: '2026-08-02' }]);
  // Derived index from the old layout — records must not be invented from it.
  await fs.writeFile(
    path.join(root, 'days', 'index.json'),
    JSON.stringify(['2026-07-30', '2026-08-02']),
  );
}

describe('migrate', () => {
  it('does nothing when there is no old layout', async () => {
    expect(await needsMigration(root)).toBe(false);
    expect((await migrate(root)).migrated).toBe(false);
  });

  it('carries every record across, active and archived alike', async () => {
    await buildOldLayout();
    const report = await migrate(root);

    expect(report).toMatchObject({ migrated: true, threads: 2, days: 2, sessions: 1 });
    const threads = await readJson<{ id: string }[]>('threads.json');
    expect(threads.map((t) => t.id).sort()).toEqual(['t1', 't2']);
  });

  it('splits days and sessions into month files', async () => {
    await buildOldLayout();
    await migrate(root);

    expect((await fs.readdir(path.join(root, 'days'))).sort()).toContain('2026-07.json');
    expect(await readJson<unknown[]>('days/2026-08.json')).toHaveLength(1);
    expect(await readJson<unknown[]>('sessions/2026-08.json')).toHaveLength(1);
  });

  it('backs the old layout up instead of deleting it', async () => {
    await buildOldLayout();
    await migrate(root);

    const backup = path.join(root, '.old-storage');
    expect(await fs.readdir(backup)).toEqual(
      expect.arrayContaining(['manifest.json', 'journal.jsonl', 'threads', 'days', 'sessions']),
    );
    // The originals are still readable, so a bad migration is recoverable by hand.
    const archived = JSON.parse(
      await fs.readFile(path.join(backup, 'threads', 'active.json'), 'utf8'),
    ) as { records: unknown[] };
    expect(archived.records).toHaveLength(1);
  });

  it('leaves the new month files in place while moving old shards aside', async () => {
    await buildOldLayout();
    await migrate(root);

    const days = await fs.readdir(path.join(root, 'days'));
    expect(days).toContain('2026-08.json');
    expect(days).not.toContain('day-000001.json');
    expect(days).not.toContain('index.json');
  });

  it('is not run twice', async () => {
    await buildOldLayout();
    await migrate(root);

    expect(await needsMigration(root)).toBe(false);
    expect((await migrate(root)).migrated).toBe(false);
  });

  it('skips a shard it cannot parse rather than losing the whole migration', async () => {
    await buildOldLayout();
    await fs.writeFile(path.join(root, 'days', 'day-000002.json'), '{ broken');

    const report = await migrate(root);
    expect(report.migrated).toBe(true);
    expect(report.days).toBe(2);
  });
});
