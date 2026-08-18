/**
 * Plain JSON files. That is the whole engine.
 *
 * This replaces a sharded store with a manifest index, a write-ahead journal, size-based shard
 * splitting, an LRU shard cache, compaction and quarantine — about 1,100 lines of machinery
 * built for a scale this app does not reach. A heavy user writes a few thousand records a year;
 * three years of that is a couple of megabytes, which is smaller than the code that was managing
 * it. All of it is now held in memory and written back whole.
 *
 * What was kept, because it earns its place:
 *  - atomic write (tmp → fsync → rename), so a crash mid-write never truncates a file;
 *  - deterministic serialisation, so the data directory stays diffable and hand-repairable;
 *  - Zod validation on read, so a bad file is reported rather than silently half-loaded;
 *  - debounced writes, so holding a key down does not hammer the disk.
 *
 * Days and sessions are split by month (`days/2026-08.json`) purely so no single file grows
 * without bound and so a month is easy to inspect by hand. Threads live in one file — the
 * active cap plus a done pile keeps that small by construction.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import { FLUSH_DEBOUNCE_MS } from '@shared/constants.js';
import { atomicWriteFile, readFileIfExists } from './atomicWrite.js';
import { serialise } from './serialise.js';
import {
  COLLECTION,
  type Collection,
  type CollectionName,
  type CollectionOptions,
  type Store,
} from './Store.js';

export interface CollectionSpec<T> {
  name: CollectionName;
  schema: z.ZodType<T>;
  key: (record: T) => string;
  /**
   * Which file a record belongs in. Undefined means the collection is a single file.
   * Returning `2026-08` puts the record in `<name>/2026-08.json`.
   */
  partition?: (record: T) => string;
}

export type AnySpec = CollectionSpec<never>;

export function defineCollection<T>(spec: CollectionSpec<T>): AnySpec {
  return spec as unknown as AnySpec;
}

export interface JsonStoreEvents {
  /** A file could not be read or validated. The app carries on without it. */
  onUnreadable?: (file: string, reason: string) => void;
  /**
   * Every tracked local write, before it reaches disk. This is the one place a record can
   * change, which is what makes "nothing gets edited without sync finding out" true by
   * construction rather than by remembering to call something in twelve repository methods.
   */
  onWrite?: (collection: CollectionName, key: string) => void;
}

interface Partition {
  records: Map<string, unknown>;
  dirty: boolean;
}

interface LoadedCollection {
  spec: CollectionSpec<unknown>;
  /** Keyed by partition name; the single-file case uses one partition called ''. */
  partitions: Map<string, Partition>;
}

export class JsonStore implements Store {
  private readonly collections = new Map<string, LoadedCollection>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  private constructor(
    private readonly root: string,
    private readonly events: JsonStoreEvents,
  ) {}

  /** Reads everything into memory once. There is no lazy loading and none is needed. */
  static async open(
    root: string,
    specs: AnySpec[],
    events: JsonStoreEvents = {},
  ): Promise<JsonStore> {
    const store = new JsonStore(root, events);
    for (const raw of specs) {
      const spec = raw as unknown as CollectionSpec<unknown>;
      const loaded: LoadedCollection = { spec, partitions: new Map() };
      for (const [name, records] of await store.readCollection(spec)) {
        loaded.partitions.set(name, { records, dirty: false });
      }
      store.collections.set(spec.name, loaded);
    }
    return store;
  }

  collection<T>(name: CollectionName, options: CollectionOptions = {}): Collection<T> {
    const loaded = this.collections.get(name);
    if (!loaded) throw new Error(`unknown collection: ${name}`);
    const track = options.track !== false;

    return {
      all: async () => this.recordsOf(loaded) as T[],
      get: async (key) => (this.find(loaded, key) as T | undefined) ?? null,
      put: async (record) => this.write(loaded, record, track),
      delete: async (key) => this.remove(loaded, key, track),
    };
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    for (const loaded of this.collections.values()) {
      for (const [name, partition] of loaded.partitions) {
        if (!partition.dirty) continue;
        // Cleared before the await: a write landing during the flush re-marks it, and the
        // record is already in the map we are serialising either way.
        partition.dirty = false;
        const records = [...partition.records.values()];
        await atomicWriteFile(this.fileFor(loaded.spec, name), serialise(records));
      }
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.flush();
  }

  /** One file containing everything, for the export button. */
  async exportTo(target: string): Promise<void> {
    await this.flush();
    const out: Record<string, unknown[]> = {};
    for (const [name, loaded] of this.collections) {
      out[name] = this.recordsOf(loaded);
    }
    await atomicWriteFile(target, serialise({ exportedAt: new Date().toISOString(), ...out }));
  }

  /**
   * Re-reads every file from disk, replacing what is in memory. This is the whole of what
   * "repair" now means: there is no index to rebuild and no journal to replay.
   */
  async reload(): Promise<void> {
    await this.flush();
    for (const loaded of this.collections.values()) {
      loaded.partitions.clear();
      for (const [name, records] of await this.readCollection(loaded.spec)) {
        loaded.partitions.set(name, { records, dirty: false });
      }
    }
  }

  get fileCount(): number {
    let total = 0;
    for (const loaded of this.collections.values()) total += loaded.partitions.size;
    return total;
  }

  // ---------------------------------------------------------------- internals

  private recordsOf(loaded: LoadedCollection): unknown[] {
    const out: unknown[] = [];
    for (const partition of loaded.partitions.values()) out.push(...partition.records.values());
    return out;
  }

  private find(loaded: LoadedCollection, key: string): unknown | undefined {
    for (const partition of loaded.partitions.values()) {
      const found = partition.records.get(key);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  private write(loaded: LoadedCollection, record: unknown, track = true): void {
    const key = loaded.spec.key(record);
    if (track) this.events.onWrite?.(loaded.spec.name, key);
    const target = loaded.spec.partition?.(record) ?? '';

    // A record whose partition changed (a session backdated across a month boundary) must not
    // be left behind in the old file as a duplicate.
    for (const [name, partition] of loaded.partitions) {
      if (name !== target && partition.records.delete(key)) partition.dirty = true;
    }

    const partition = this.partitionFor(loaded, target);
    partition.records.set(key, record);
    partition.dirty = true;
    this.scheduleFlush();
  }

  private remove(loaded: LoadedCollection, key: string, track = true): void {
    if (track) this.events.onWrite?.(loaded.spec.name, key);
    for (const partition of loaded.partitions.values()) {
      if (partition.records.delete(key)) partition.dirty = true;
    }
    this.scheduleFlush();
  }

  private partitionFor(loaded: LoadedCollection, name: string): Partition {
    const existing = loaded.partitions.get(name);
    if (existing) return existing;
    const created: Partition = { records: new Map(), dirty: true };
    loaded.partitions.set(name, created);
    return created;
  }

  private scheduleFlush(): void {
    if (this.closed || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush().catch((error: unknown) => console.error('[storage] flush failed', error));
    }, FLUSH_DEBOUNCE_MS);
  }

  private fileFor(spec: CollectionSpec<unknown>, partition: string): string {
    return partition
      ? path.join(this.root, spec.name, `${partition}.json`)
      : path.join(this.root, `${spec.name}.json`);
  }

  private async readCollection(
    spec: CollectionSpec<unknown>,
  ): Promise<Map<string, Map<string, unknown>>> {
    const out = new Map<string, Map<string, unknown>>();
    for (const partition of await this.partitionNames(spec)) {
      const records = await this.readFile(spec, this.fileFor(spec, partition));
      if (records) out.set(partition, records);
    }
    return out;
  }

  private async partitionNames(spec: CollectionSpec<unknown>): Promise<string[]> {
    if (!spec.partition) return [''];
    try {
      const entries = await fs.readdir(path.join(this.root, spec.name));
      return entries.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length));
    } catch {
      return [];
    }
  }

  private async readFile(
    spec: CollectionSpec<unknown>,
    file: string,
  ): Promise<Map<string, unknown> | null> {
    const raw = await readFileIfExists(file);
    if (raw === null) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      this.events.onUnreadable?.(file, `not valid JSON: ${(error as Error).message}`);
      return null;
    }
    if (!Array.isArray(parsed)) {
      this.events.onUnreadable?.(file, 'expected an array of records');
      return null;
    }

    const records = new Map<string, unknown>();
    let rejected = 0;
    for (const candidate of parsed) {
      const result = spec.schema.safeParse(candidate);
      // One malformed record loses that record, not the file around it.
      if (!result.success) {
        rejected += 1;
        continue;
      }
      records.set(spec.key(result.data), result.data);
    }
    if (rejected > 0) {
      this.events.onUnreadable?.(file, `${rejected} record(s) did not match the schema`);
    }
    return records;
  }
}

export { COLLECTION };
