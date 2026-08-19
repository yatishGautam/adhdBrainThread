/**
 * The storage seam.
 *
 * Repositories talk to this and nothing else, so the thing behind it can change without
 * touching a single feature.
 *
 * When this app grows a backend, the local store does NOT get replaced by an HTTP one — that
 * would make every read and write depend on a network, and this app has to keep working on a
 * plane. `JsonStore` stays the write path and a sync layer replicates alongside it: writes land
 * locally first and are pushed when a connection exists. The server is the durable merge point,
 * not something standing between the user and their own data.
 *
 * What that costs, and what this interface is shaped to allow:
 *  - every record already carries `updatedAt`, so last-write-wins can compare timestamps rather
 *    than trusting arrival order — a laptop flushing a stale queue after days offline must not
 *    clobber newer edits from another device;
 *  - `delete` will need to leave a tombstone rather than vanishing, or a delete resurrects
 *    itself from whichever device has not heard about it yet.
 *
 * Everything here is async for that reason — the file-backed implementation could answer
 * synchronously, but code written against a synchronous store cannot have a network put behind
 * any part of it later without rewriting every caller.
 */

/** The collections the app stores. One file (or one file per month) each. */
export const COLLECTION = {
  threads: 'threads',
  days: 'days',
  sessions: 'sessions',
  /** Sits. Written only by the sync engine — they are recorded on the phone. */
  mindful: 'mindful',
  /**
   * Weekly goals and generated day plans. Local to this desktop for now: the backend has no
   * columns for either, and `SyncState.TRACKED` deliberately omits them, so a write here marks
   * nothing dirty and nothing is ever pushed. Both are shaped like every other record —
   * `updatedAt`, tombstones — so teaching the server about them later is a wire change, not a
   * storage one.
   */
  goals: 'goals',
  plans: 'plans',
} as const;

export type CollectionName = (typeof COLLECTION)[keyof typeof COLLECTION];

export interface Collection<T> {
  /** Every record, unordered. Callers sort — ordering is a view concern, not a storage one. */
  all(): Promise<T[]>;
  get(key: string): Promise<T | null>;
  /** Insert or replace, keyed by the collection's key function. */
  put(record: T): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * `track: false` writes without telling the sync engine. Exactly one caller uses it — the
 * engine itself, applying what it just pulled. A merged record marked dirty would be pushed
 * straight back to the server it came from, forever.
 */
export interface CollectionOptions {
  track?: boolean;
}

export interface Store {
  collection<T>(name: CollectionName, options?: CollectionOptions): Collection<T>;
  /** Write anything pending. Called on blur, sleep, screen lock and quit. */
  flush(): Promise<void>;
  close(): Promise<void>;
}
