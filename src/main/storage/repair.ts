/**
 * Repair paths. Every one of these is reachable from Settings → Repair data, and
 * `rebuildManifest` also runs automatically on boot when the manifest is missing, unparseable
 * or points at a file that is not there.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { COMPACT_FILL_RATIO, SHARD_MAX_BYTES, SHARD_MAX_RECORDS } from '@shared/constants.js';
import { atomicWriteFile } from './atomicWrite.js';
import { emptyManifest, saveManifest, shardSequence, type Manifest, type ShardMeta } from './manifest.js';
import { emptyShardMeta, quarantineFile, readShard, relativeShardFile, writeShard } from './shardIO.js';
import { serialise } from './serialise.js';
import type { AnyCollectionConfig, LoadedShard, StoreEvents } from './types.js';

async function listShardFiles(root: string, config: AnyCollectionConfig): Promise<string[]> {
  if (config.singleFile) return [config.singleFile];
  const dir = path.join(root, config.dir);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.startsWith(`${config.prefix}-`) && name.endsWith('.json'))
    .sort()
    .map((name) => path.posix.join(config.dir, name));
}

/**
 * Scans every shard directory and recomputes the index from what is actually on disk. This is
 * why deleting manifest.json is survivable: the shards are truth, the manifest is a cache.
 */
export async function rebuildManifest(
  root: string,
  configs: AnyCollectionConfig[],
  events?: StoreEvents,
): Promise<Manifest> {
  const manifest = emptyManifest();

  for (const config of configs) {
    const shards: ShardMeta[] = [];
    for (const file of await listShardFiles(root, config)) {
      const id = config.singleFile
        ? `${config.prefix}-active`
        : path.basename(file, '.json');
      const probe = emptyShardMeta(id, file);
      const result = await readShard(root, config, probe);
      if (result.kind === 'missing') continue;
      if (result.kind === 'corrupt') {
        const movedTo = await quarantineFile(root, file);
        events?.onQuarantine?.(file, movedTo, result.reason);
        continue;
      }
      shards.push({ ...result.shard.meta, sealed: true });
    }

    if (shards.length === 0) {
      const id = config.singleFile ? `${config.prefix}-active` : `${config.prefix}-000001`;
      shards.push(emptyShardMeta(id, relativeShardFile(config, id)));
    }
    // The highest sequence number is the head — that is where new keys append.
    const head = shards.reduce((best, shard) =>
      shardSequence(shard.id) >= shardSequence(best.id) ? shard : best,
    );
    head.sealed = false;
    manifest.collections[config.name] = { headShardId: head.id, shards };
  }

  await saveManifest(root, manifest);
  return manifest;
}

export interface CompactReport {
  before: number;
  after: number;
}

/**
 * Merges adjacent under-filled shards so deletions do not leave a directory full of near-empty
 * files. Runs only when the store is quiescent — the caller flushes and drops its cache first.
 */
export async function compact(
  root: string,
  configs: AnyCollectionConfig[],
  manifest: Manifest,
  events?: StoreEvents,
): Promise<CompactReport> {
  let before = 0;
  let after = 0;

  for (const config of configs) {
    const index = manifest.collections[config.name];
    if (!index || config.singleFile) continue;
    before += index.shards.length;

    const loaded: LoadedShard[] = [];
    for (const meta of index.shards) {
      const result = await readShard(root, config, meta);
      if (result.kind === 'ok') {
        loaded.push({ collection: config.name, meta, records: result.shard.records, dirty: false });
      } else {
        loaded.push({ collection: config.name, meta, records: new Map(), dirty: false });
      }
    }
    loaded.sort((a, b) => shardSequence(a.meta.id) - shardSequence(b.meta.id));

    const merged: LoadedShard[] = [];
    for (const shard of loaded) {
      const previous = merged[merged.length - 1];
      const bothSparse = previous && isSparse(previous.meta) && isSparse(shard.meta);
      const headInvolved = shard.meta.id === index.headShardId;
      if (previous && bothSparse && !headInvolved) {
        for (const [key, record] of shard.records) previous.records.set(key, record);
        previous.dirty = true;
        await fs.rm(path.join(root, shard.meta.file), { force: true });
        events?.onWarning?.(`compacted ${shard.meta.file} into ${previous.meta.file}`);
        continue;
      }
      merged.push(shard);
    }

    for (const shard of merged) {
      if (shard.dirty) await writeShard(root, config, shard);
    }
    index.shards = merged.map((shard) => shard.meta);
    if (!index.shards.some((shard) => shard.id === index.headShardId)) {
      const last = index.shards[index.shards.length - 1];
      if (last) index.headShardId = last.id;
    }
    after += index.shards.length;
  }

  await saveManifest(root, manifest);
  return { before, after };
}

function isSparse(meta: ShardMeta): boolean {
  return (
    meta.bytes < SHARD_MAX_BYTES * COMPACT_FILL_RATIO &&
    meta.count < SHARD_MAX_RECORDS * COMPACT_FILL_RATIO
  );
}

/** Writes a single pretty-printed snapshot of everything, for Settings → Export. */
export async function exportSnapshot(
  root: string,
  configs: AnyCollectionConfig[],
  manifest: Manifest,
  destination: string,
): Promise<void> {
  const payload: Record<string, unknown[]> = {};
  for (const config of configs) {
    const index = manifest.collections[config.name];
    if (!index) continue;
    const records: unknown[] = [];
    for (const meta of index.shards) {
      const result = await readShard(root, config, meta);
      if (result.kind === 'ok') records.push(...result.shard.records.values());
    }
    payload[config.name] = records;
  }
  await atomicWriteFile(destination, serialise({ exportedAt: new Date().toISOString(), ...payload }));
}
