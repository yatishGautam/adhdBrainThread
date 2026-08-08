import { z } from 'zod';
import { isoTimestamp } from './common.js';

export const shardMetaSchema = z.object({
  id: z.string(),
  file: z.string(),
  count: z.number().nonnegative(),
  bytes: z.number().nonnegative(),
  /** Inclusive. */
  minKey: z.string(),
  /** Inclusive. */
  maxKey: z.string(),
  sealed: z.boolean(),
  /** sha256 of the file contents as written. */
  checksum: z.string(),
  updatedAt: isoTimestamp,
});

export const collectionIndexSchema = z.object({
  headShardId: z.string(),
  shards: z.array(shardMetaSchema),
});

export const manifestSchema = z.object({
  version: z.literal(2),
  updatedAt: isoTimestamp,
  collections: z.record(z.string(), collectionIndexSchema),
});

export const shardFileSchema = z.object({
  id: z.string(),
  records: z.array(z.unknown()),
});

export type ShardMeta = z.infer<typeof shardMetaSchema>;
export type CollectionIndex = z.infer<typeof collectionIndexSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
