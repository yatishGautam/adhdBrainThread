import type { z } from 'zod';
import type { ShardMeta } from './schemas/manifest.js';

export interface CollectionConfig<T> {
  /** Logical name, used as the manifest key and in journal entries. */
  name: string;
  /** Directory under the data root. */
  dir: string;
  /** Shard id prefix, e.g. 'day' → day-000001. */
  prefix: string;
  schema: z.ZodType<T>;
  /** Must sort lexicographically in creation order — localDate or ULID. */
  key: (record: T) => string;
  /** Drives last-write-wins during journal replay. */
  updatedAt: (record: T) => string;
  /**
   * When set, the collection lives in one unsharded file at this path and never seals or
   * splits. Used for threads/active.json, which is bounded by the WIP cap.
   */
  singleFile?: string;
}

/**
 * Collections are stored heterogeneously, so the engine works in `unknown` and every record is
 * Zod-validated on the way in from disk. `defineCollection` is the one place that erases the
 * type parameter, and typed access comes back via `ShardedStore.collection<T>()`.
 */
export type AnyCollectionConfig = CollectionConfig<unknown>;

export function defineCollection<T>(config: CollectionConfig<T>): AnyCollectionConfig {
  return config as unknown as AnyCollectionConfig;
}

export interface LoadedShard {
  collection: string;
  /** The same object the manifest index holds, so meta updates propagate without a copy step. */
  meta: ShardMeta;
  records: Map<string, unknown>;
  dirty: boolean;
  /**
   * Bumped on every mutation. A flush that started before a mutation landed must not clear
   * `dirty`, or the journal gets truncated and that mutation exists nowhere.
   */
  version: number;
}

export interface StoreEvents {
  /** A shard failed to parse or validate and was moved aside. */
  onQuarantine?: (originalFile: string, movedTo: string, reason: string) => void;
  onWarning?: (message: string) => void;
}
