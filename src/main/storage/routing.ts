/**
 * Key → shard resolution. Keys sort lexicographically (localDate or ULID), so the whole thing
 * is a scan of the tiny manifest rather than an index structure of its own.
 */
import type { CollectionIndex, ShardMeta } from './schemas/manifest.js';

function isEmpty(shard: ShardMeta): boolean {
  return shard.count === 0;
}

export function headOf(index: CollectionIndex): ShardMeta | undefined {
  return index.shards.find((shard) => shard.id === index.headShardId);
}

/**
 * Ordering of the cases matters:
 *  1. a shard whose inclusive range already contains the key wins outright;
 *  2. anything newer than the head's max extends the head;
 *  3. anything else is backdated and lands in the newest shard that starts at or before it,
 *     which is what keeps ranges non-overlapping as they widen (§4.6 #5).
 */
export function resolveShardId(index: CollectionIndex, key: string): string {
  for (const shard of index.shards) {
    if (isEmpty(shard)) continue;
    if (key >= shard.minKey && key <= shard.maxKey) return shard.id;
  }

  const head = headOf(index);
  if (!head) return index.headShardId;
  if (isEmpty(head) || key > head.maxKey) return head.id;

  let candidate: ShardMeta | undefined;
  for (const shard of index.shards) {
    if (isEmpty(shard)) continue;
    if (shard.minKey <= key) candidate = shard;
  }
  if (candidate) return candidate.id;

  // Older than everything on record: extend the earliest shard downwards.
  const earliest = index.shards.find((shard) => !isEmpty(shard));
  return earliest?.id ?? head.id;
}

/** Every shard that could hold a key in [minKey, maxKey], inclusive. */
export function shardsForRange(index: CollectionIndex, minKey: string, maxKey: string): ShardMeta[] {
  return index.shards.filter(
    (shard) => !isEmpty(shard) && !(shard.maxKey < minKey || shard.minKey > maxKey),
  );
}

export function nonEmptyShards(index: CollectionIndex): ShardMeta[] {
  return index.shards.filter((shard) => !isEmpty(shard));
}
