/**
 * The manifest is an index, not truth. Shard files are always written first; if the manifest
 * disagrees with what is on disk it is thrown away and rebuilt by scanning (§4.3 step 7).
 */
import path from 'node:path';
import { atomicWriteFile, readFileIfExists } from './atomicWrite.js';
import { serialise } from './serialise.js';
import { manifestSchema, type CollectionIndex, type Manifest, type ShardMeta } from './schemas/manifest.js';

export type { CollectionIndex, Manifest, ShardMeta };

export const MANIFEST_FILE = 'manifest.json';

export function emptyManifest(): Manifest {
  return { version: 2, updatedAt: new Date().toISOString(), collections: {} };
}

export function manifestPath(root: string): string {
  return path.join(root, MANIFEST_FILE);
}

/** Returns null when the manifest is absent, unparseable or invalid — all of which mean "rebuild". */
export async function loadManifest(root: string): Promise<Manifest | null> {
  const raw = await readFileIfExists(manifestPath(root));
  if (raw === null) return null;
  try {
    return manifestSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveManifest(root: string, manifest: Manifest): Promise<void> {
  manifest.updatedAt = new Date().toISOString();
  for (const index of Object.values(manifest.collections)) {
    index.shards.sort((a, b) => compareShards(a, b));
  }
  await atomicWriteFile(manifestPath(root), serialise(manifest));
}

/** Empty shards sort last so range resolution never has to special-case them mid-scan. */
function compareShards(a: ShardMeta, b: ShardMeta): number {
  if (a.count === 0 && b.count === 0) return a.id.localeCompare(b.id);
  if (a.count === 0) return 1;
  if (b.count === 0) return -1;
  if (a.minKey !== b.minKey) return a.minKey < b.minKey ? -1 : 1;
  return a.id.localeCompare(b.id);
}

export function shardFileName(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(6, '0')}`;
}

export function shardSequence(id: string): number {
  const match = /-(\d+)$/.exec(id);
  return match?.[1] ? Number(match[1]) : 0;
}

export function nextShardId(prefix: string, index: CollectionIndex | undefined): string {
  const highest = (index?.shards ?? []).reduce((max, shard) => Math.max(max, shardSequence(shard.id)), 0);
  return shardFileName(prefix, highest + 1);
}
