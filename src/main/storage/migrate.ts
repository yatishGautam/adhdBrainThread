/**
 * One-time import from the old sharded layout.
 *
 * The previous engine wrote `days/day-000001.json`, `sessions/ses-000001.json`,
 * `threads/active.json` and `threads/archive/*.json`, each shaped `{ id, records: [...] }`,
 * indexed by a `manifest.json` and fronted by a `journal.jsonl`. This reads those files
 * directly — no manifest, no journal replay, because the shards themselves are the truth and
 * were always written before the manifest.
 *
 * Nothing is deleted. The old files move to `.old-storage/` so a mistake here is recoverable by
 * dragging one folder back.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile, pathExists, readFileIfExists } from './atomicWrite.js';
import { serialise } from './serialise.js';

export interface MigrationReport {
  migrated: boolean;
  threads: number;
  days: number;
  sessions: number;
  backupDir?: string;
}

const BACKUP_DIR = '.old-storage';

/** The old layout is recognised by its manifest — the new one has no index at all. */
export async function needsMigration(root: string): Promise<boolean> {
  if (await pathExists(path.join(root, BACKUP_DIR))) return false;
  return pathExists(path.join(root, 'manifest.json'));
}

export async function migrate(root: string): Promise<MigrationReport> {
  if (!(await needsMigration(root))) {
    return { migrated: false, threads: 0, days: 0, sessions: 0 };
  }

  const threads = [
    ...(await readShard(path.join(root, 'threads', 'active.json'))),
    ...(await readShardsIn(path.join(root, 'threads', 'archive'))),
  ];
  const days = await readShardsIn(path.join(root, 'days'));
  const sessions = await readShardsIn(path.join(root, 'sessions'));

  // Written before anything is moved: if this throws, the old layout is still in place and
  // untouched, and the next boot simply tries again.
  await atomicWriteFile(path.join(root, 'threads.json'), serialise(threads));
  await writePartitioned(path.join(root, 'days'), days, (day) => localDateOf(day).slice(0, 7));
  await writePartitioned(path.join(root, 'sessions'), sessions, (s) =>
    localDateOf(s).slice(0, 7),
  );

  const backup = path.join(root, BACKUP_DIR);
  await fs.mkdir(backup, { recursive: true });
  for (const stale of ['manifest.json', 'journal.jsonl']) {
    await move(path.join(root, stale), path.join(backup, stale));
  }
  await move(path.join(root, 'threads'), path.join(backup, 'threads'));
  await moveOldShards(path.join(root, 'days'), path.join(backup, 'days'));
  await moveOldShards(path.join(root, 'sessions'), path.join(backup, 'sessions'));

  return {
    migrated: true,
    threads: threads.length,
    days: days.length,
    sessions: sessions.length,
    backupDir: backup,
  };
}

// ------------------------------------------------------------------ internals

function localDateOf(record: unknown): string {
  const value = (record as { localDate?: unknown }).localDate;
  // A record with no usable local date still has to land somewhere readable rather than be lost.
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '0000-00-00';
}

async function readShard(file: string): Promise<unknown[]> {
  const raw = await readFileIfExists(file);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    const records = (parsed as { records?: unknown }).records;
    return Array.isArray(records) ? records : [];
  } catch {
    // A shard that will not parse is left for the backup folder rather than aborting the whole
    // migration over one bad file.
    console.warn('[migrate] could not read', file);
    return [];
  }
}

async function readShardsIn(dir: string): Promise<unknown[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: unknown[] = [];
  for (const entry of entries.sort()) {
    // index.json was a derived list of dates, not records.
    if (!entry.endsWith('.json') || entry === 'index.json') continue;
    out.push(...(await readShard(path.join(dir, entry))));
  }
  return out;
}

async function writePartitioned(
  dir: string,
  records: unknown[],
  partition: (record: unknown) => string,
): Promise<void> {
  const groups = new Map<string, unknown[]>();
  for (const record of records) {
    const key = partition(record);
    const list = groups.get(key);
    if (list) list.push(record);
    else groups.set(key, [record]);
  }
  for (const [key, list] of groups) {
    await atomicWriteFile(path.join(dir, `${key}.json`), serialise(list));
  }
}

async function move(from: string, to: string): Promise<void> {
  try {
    await fs.rename(from, to);
  } catch {
    /* not there — nothing to preserve */
  }
}

/** Moves the old `day-000001.json` shards aside, leaving the new `2026-08.json` files behind. */
async function moveOldShards(dir: string, backup: string): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  await fs.mkdir(backup, { recursive: true });
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    // New files are named by month; anything else is an old shard or the derived index.
    if (/^\d{4}-\d{2}\.json$/.test(entry)) continue;
    await move(path.join(dir, entry), path.join(backup, entry));
  }
}
