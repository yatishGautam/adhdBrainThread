/** Reading, writing and quarantining a single shard file. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile, checksum, readFileIfExists } from './atomicWrite.js';
import { byteLength, serialise } from './serialise.js';
import { shardFileSchema, type ShardMeta } from './schemas/manifest.js';
import type { AnyCollectionConfig, LoadedShard } from './types.js';

export function shardPath(root: string, meta: ShardMeta): string {
  return path.join(root, meta.file);
}

export function relativeShardFile(config: AnyCollectionConfig, shardId: string): string {
  if (config.singleFile) return config.singleFile;
  return path.posix.join(config.dir, `${shardId}.json`);
}

export type ShardLoad =
  | { kind: 'ok'; shard: LoadedShard; checksumMismatch: boolean }
  | { kind: 'missing' }
  | { kind: 'corrupt'; reason: string };

export async function readShard(
  root: string,
  config: AnyCollectionConfig,
  meta: ShardMeta,
): Promise<ShardLoad> {
  const raw = await readFileIfExists(shardPath(root, meta));
  if (raw === null) return { kind: 'missing' };

  let records: Map<string, unknown>;
  try {
    const file = shardFileSchema.parse(JSON.parse(raw));
    records = new Map();
    for (const candidate of file.records) {
      const record = config.schema.parse(candidate);
      records.set(config.key(record), record);
    }
  } catch (error) {
    return { kind: 'corrupt', reason: error instanceof Error ? error.message : String(error) };
  }

  // A mismatch means the file was edited outside the app or a manifest write was lost. The
  // records validated, so the data is fine — it is the index that needs correcting.
  const checksumMismatch = checksum(raw) !== meta.checksum;
  const bounds = keyBounds(records);
  const shard: LoadedShard = {
    meta: { ...meta, ...bounds, count: records.size, bytes: byteLength(raw), checksum: checksum(raw) },
    records,
    dirty: false,
  };
  return { kind: 'ok', shard, checksumMismatch };
}

/**
 * Records are written sorted by key, so a diff of this file reads like a timeline.
 * Deliberately does not clear `shard.dirty` — only the caller knows whether a mutation landed
 * while this write was in flight.
 */
export async function writeShard(
  root: string,
  config: AnyCollectionConfig,
  shard: LoadedShard,
): Promise<void> {
  const sorted = [...shard.records.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const text = serialise({ id: shard.meta.id, records: sorted.map(([, record]) => record) });
  await atomicWriteFile(path.join(root, shard.meta.file), text);
  Object.assign(shard.meta, {
    ...keyBounds(shard.records),
    count: shard.records.size,
    bytes: byteLength(text),
    checksum: checksum(text),
    updatedAt: new Date().toISOString(),
  });
}

export function keyBounds(records: Map<string, unknown>): { minKey: string; maxKey: string } {
  let minKey = '';
  let maxKey = '';
  for (const key of records.keys()) {
    if (minKey === '' || key < minKey) minKey = key;
    if (maxKey === '' || key > maxKey) maxKey = key;
  }
  return { minKey, maxKey };
}

/**
 * Never delete. Losing a month of history is survivable; a boot loop is not, and the user may
 * still want to hand-repair the file.
 */
export async function quarantineFile(root: string, relative: string): Promise<string> {
  const from = path.join(root, relative);
  const to = `${from}.corrupt-${Date.now()}`;
  await fs.rename(from, to);
  return path.relative(root, to);
}

export function emptyShardMeta(id: string, file: string): ShardMeta {
  return {
    id,
    file,
    count: 0,
    bytes: 0,
    minKey: '',
    maxKey: '',
    sealed: false,
    checksum: '',
    updatedAt: new Date().toISOString(),
  };
}
