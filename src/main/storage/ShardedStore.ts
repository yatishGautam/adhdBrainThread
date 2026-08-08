/**
 * Size-based sharding with a manifest index, lazy loading and a write-ahead journal.
 *
 * Invariants, in the order they are relied on:
 *  1. every mutation reaches the journal (fsync) before it is considered accepted;
 *  2. shard files are written before the manifest, always;
 *  3. the journal is truncated only after a successful manifest write.
 */
import path from 'node:path';
import {
  FLUSH_DEBOUNCE_MS,
  SEALED_OVERFLOW_FACTOR,
  SHARD_CACHE_LIMIT,
  SHARD_MAX_BYTES,
  SHARD_MAX_RECORDS,
} from '@shared/constants.js';
import { Journal } from './journal.js';
import {
  emptyManifest,
  loadManifest,
  nextShardId,
  saveManifest,
  type CollectionIndex,
  type Manifest,
  type ShardMeta,
} from './manifest.js';
import { headOf, nonEmptyShards, resolveShardId, shardsForRange } from './routing.js';
import {
  emptyShardMeta,
  keyBounds,
  quarantineFile,
  readShard,
  relativeShardFile,
  writeShard,
} from './shardIO.js';
import { pathExists } from './atomicWrite.js';
import { compact, exportSnapshot, rebuildManifest, type CompactReport } from './repair.js';
import type { AnyCollectionConfig, LoadedShard, StoreEvents } from './types.js';

export interface ShardedStoreOptions {
  root: string;
  collections: AnyCollectionConfig[];
  events?: StoreEvents;
  maxBytes?: number;
  maxRecords?: number;
  cacheLimit?: number;
  flushDebounceMs?: number;
}

export interface InitReport {
  manifestRebuilt: boolean;
  journalEntriesReplayed: number;
  quarantined: string[];
}

/** Typed view over one collection. Repositories talk to this; nothing else touches the engine. */
export interface CollectionHandle<T> {
  get(key: string): Promise<T | null>;
  put(record: T): Promise<void>;
  delete(key: string): Promise<void>;
  range(minKey: string, maxKey: string): Promise<T[]>;
  all(): Promise<T[]>;
  /** Shard ids newest-first. Paged reads walk these so they stay lazy. */
  shardIds(): string[];
  recordsIn(shardId: string): Promise<T[]>;
}

export class ShardedStore {
  private manifest: Manifest = emptyManifest();
  private readonly cache = new Map<string, LoadedShard>();
  private readonly configs = new Map<string, AnyCollectionConfig>();
  private readonly journal: Journal;
  private readonly quarantined: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushChain: Promise<void> = Promise.resolve();
  private manifestDirty = false;
  private closed = false;

  constructor(private readonly options: ShardedStoreOptions) {
    for (const config of options.collections) this.configs.set(config.name, config);
    this.journal = new Journal(path.join(options.root, 'journal.jsonl'));
  }

  async init(): Promise<InitReport> {
    await this.journal.open();
    let manifest = await loadManifest(this.options.root);
    let manifestRebuilt = false;

    if (!manifest || !(await this.allShardFilesPresent(manifest))) {
      manifest = await rebuildManifest(
        this.options.root,
        [...this.configs.values()],
        this.collectQuarantine(),
      );
      manifestRebuilt = true;
      this.manifestDirty = true;
    }
    this.manifest = manifest;
    for (const config of this.configs.values()) this.indexFor(config);

    const journalEntriesReplayed = await this.replayJournal();
    if (manifestRebuilt || journalEntriesReplayed > 0 || this.manifestDirty) await this.flush();
    return { manifestRebuilt, journalEntriesReplayed, quarantined: [...this.quarantined] };
  }

  collection<T>(name: string): CollectionHandle<T> {
    const config = this.configs.get(name);
    if (!config) throw new Error(`unknown collection: ${name}`);
    return {
      get: async (key) => (await this.getRecord(config, key)) as T | null,
      put: (record) => this.putRecord(config, record),
      delete: (key) => this.deleteRecord(config, key),
      range: async (min, max) => (await this.rangeRecords(config, min, max)) as T[],
      all: async () => (await this.allRecords(config)) as T[],
      shardIds: () =>
        nonEmptyShards(this.indexFor(config))
          .map((shard) => shard.id)
          .reverse(),
      recordsIn: async (shardId) => (await this.recordsInShard(config, shardId)) as T[],
    };
  }

  /** Forced on quit, window blur and session end; otherwise debounced. */
  flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushChain = this.flushChain.then(() => this.flushNow()).catch((error: unknown) => {
      this.options.events?.onWarning?.(`flush failed: ${String(error)}`);
    });
    return this.flushChain;
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.flush();
    await this.journal.close();
  }

  get manifestSnapshot(): Manifest {
    return this.manifest;
  }

  get shardCount(): number {
    return Object.values(this.manifest.collections).reduce(
      (total, index) => total + index.shards.length,
      0,
    );
  }

  /** Settings → Repair data. Rebuilds the index from disk, then merges sparse shards. */
  async repair(): Promise<{ quarantined: string[]; compacted: CompactReport }> {
    await this.flush();
    this.cache.clear();
    const configs = [...this.configs.values()];
    const before = this.quarantined.length;
    this.manifest = await rebuildManifest(this.options.root, configs, this.collectQuarantine());
    const compacted = await compact(this.options.root, configs, this.manifest, this.options.events);
    this.manifestDirty = false;
    return { quarantined: this.quarantined.slice(before), compacted };
  }

  async exportTo(destination: string): Promise<void> {
    await this.flush();
    await exportSnapshot(this.options.root, [...this.configs.values()], this.manifest, destination);
  }

  private collectQuarantine(): StoreEvents {
    return {
      onWarning: this.options.events?.onWarning,
      onQuarantine: (file, movedTo, reason) => {
        this.quarantined.push(movedTo);
        this.options.events?.onQuarantine?.(file, movedTo, reason);
      },
    };
  }

  // ---------------------------------------------------------------- mutations

  private async getRecord(config: AnyCollectionConfig, key: string): Promise<unknown> {
    const shard = await this.shardForKey(config, key);
    return shard.records.get(key) ?? null;
  }

  private async putRecord(config: AnyCollectionConfig, record: unknown): Promise<void> {
    const parsed = config.schema.parse(record);
    const key = config.key(parsed);
    await this.journal.append({
      collection: config.name,
      key,
      op: 'put',
      updatedAt: config.updatedAt(parsed),
      record: parsed,
    });
    const shard = await this.shardForKey(config, key);
    shard.records.set(key, parsed);
    shard.dirty = true;
    this.scheduleFlush();
  }

  private async deleteRecord(config: AnyCollectionConfig, key: string): Promise<void> {
    await this.journal.append({
      collection: config.name,
      key,
      op: 'delete',
      updatedAt: new Date().toISOString(),
    });
    const shard = await this.shardForKey(config, key);
    if (shard.records.delete(key)) {
      shard.dirty = true;
      this.scheduleFlush();
    }
  }

  private async rangeRecords(
    config: AnyCollectionConfig,
    minKey: string,
    maxKey: string,
  ): Promise<unknown[]> {
    const index = this.indexFor(config);
    const out: unknown[] = [];
    for (const meta of shardsForRange(index, minKey, maxKey)) {
      const shard = await this.loadShard(config, meta);
      for (const [key, record] of shard.records) {
        if (key >= minKey && key <= maxKey) out.push(record);
      }
    }
    return out;
  }

  private async recordsInShard(config: AnyCollectionConfig, shardId: string): Promise<unknown[]> {
    const meta = this.indexFor(config).shards.find((shard) => shard.id === shardId);
    if (!meta) return [];
    const shard = await this.loadShard(config, meta);
    return [...shard.records.values()];
  }

  private async allRecords(config: AnyCollectionConfig): Promise<unknown[]> {
    const index = this.indexFor(config);
    const out: unknown[] = [];
    for (const meta of [...index.shards]) {
      const shard = await this.loadShard(config, meta);
      out.push(...shard.records.values());
    }
    return out;
  }

  // ------------------------------------------------------------------ shards

  private indexFor(config: AnyCollectionConfig): CollectionIndex {
    const existing = this.manifest.collections[config.name];
    if (existing && existing.shards.length > 0) return existing;
    const id = config.singleFile ? `${config.prefix}-active` : nextShardId(config.prefix, existing);
    const index: CollectionIndex = {
      headShardId: id,
      shards: [emptyShardMeta(id, relativeShardFile(config, id))],
    };
    this.manifest.collections[config.name] = index;
    this.manifestDirty = true;
    return index;
  }

  private async shardForKey(config: AnyCollectionConfig, key: string): Promise<LoadedShard> {
    const index = this.indexFor(config);
    const shardId = config.singleFile ? index.headShardId : resolveShardId(index, key);
    const meta = index.shards.find((shard) => shard.id === shardId) ?? index.shards[0];
    if (!meta) throw new Error(`collection ${config.name} has no shards`);
    return this.loadShard(config, meta);
  }

  private async loadShard(config: AnyCollectionConfig, meta: ShardMeta): Promise<LoadedShard> {
    const cacheKey = `${config.name}/${meta.id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached;
    }

    const result = await readShard(this.options.root, config, meta);
    if (result.kind === 'corrupt') {
      return this.quarantineAndReplace(config, meta, result.reason);
    }

    const shard: LoadedShard =
      result.kind === 'missing'
        ? { collection: config.name, meta, records: new Map(), dirty: false }
        : { collection: config.name, meta, records: result.shard.records, dirty: false };

    if (result.kind === 'ok') {
      // The manifest index and the cache share this object, so correcting it here is enough.
      Object.assign(meta, result.shard.meta, { id: meta.id, file: meta.file, sealed: meta.sealed });
      if (result.checksumMismatch) {
        this.manifestDirty = true;
        this.options.events?.onWarning?.(`checksum corrected for ${meta.file}`);
      }
    }

    this.cache.set(cacheKey, shard);
    await this.evictIfNeeded();
    return shard;
  }

  private async quarantineAndReplace(
    config: AnyCollectionConfig,
    meta: ShardMeta,
    reason: string,
  ): Promise<LoadedShard> {
    const movedTo = await quarantineFile(this.options.root, meta.file);
    this.quarantined.push(movedTo);
    this.options.events?.onQuarantine?.(meta.file, movedTo, reason);

    const index = this.indexFor(config);
    index.shards = index.shards.filter((shard) => shard.id !== meta.id);
    this.cache.delete(`${config.name}/${meta.id}`);
    this.manifestDirty = true;

    if (index.shards.length === 0 || index.headShardId === meta.id) {
      const id = config.singleFile ? `${config.prefix}-active` : nextShardId(config.prefix, index);
      const fresh = emptyShardMeta(id, relativeShardFile(config, id));
      index.shards.push(fresh);
      index.headShardId = id;
      const shard: LoadedShard = {
        collection: config.name,
        meta: fresh,
        records: new Map(),
        dirty: true,
      };
      this.cache.set(`${config.name}/${id}`, shard);
      return shard;
    }
    const head = headOf(index);
    if (!head) throw new Error(`collection ${config.name} lost its head shard`);
    return this.loadShard(config, head);
  }

  private async evictIfNeeded(): Promise<void> {
    const limit = this.options.cacheLimit ?? SHARD_CACHE_LIMIT;
    for (const [key, shard] of this.cache) {
      if (this.cache.size <= limit) break;
      const config = this.configs.get(shard.collection);
      if (config?.singleFile) continue; // pinned: bounded by the WIP cap, always hot
      if (shard.dirty && config) await writeShard(this.options.root, config, shard);
      this.cache.delete(key);
      this.manifestDirty = true;
    }
  }

  // ------------------------------------------------------------------- flush

  private scheduleFlush(): void {
    if (this.closed || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.options.flushDebounceMs ?? FLUSH_DEBOUNCE_MS);
    this.flushTimer.unref?.();
  }

  private async flushNow(): Promise<void> {
    for (let pass = 0; pass < 4; pass += 1) {
      const dirty = [...this.cache.values()].filter((shard) => shard.dirty);
      if (dirty.length === 0 && pass > 0) break;
      for (const shard of dirty) {
        const config = this.configs.get(shard.collection);
        if (!config) continue;
        await writeShard(this.options.root, config, shard);
        this.manifestDirty = true;
      }
      if (!(await this.applyStructure())) break;
    }
    if (this.manifestDirty) {
      await saveManifest(this.options.root, this.manifest);
      this.manifestDirty = false;
    }
    await this.journal.truncate();
  }

  // --------------------------------------------------------------- structure

  private overThreshold(meta: ShardMeta, factor: number): boolean {
    const maxBytes = (this.options.maxBytes ?? SHARD_MAX_BYTES) * factor;
    const maxRecords = (this.options.maxRecords ?? SHARD_MAX_RECORDS) * factor;
    return meta.bytes > maxBytes || meta.count > maxRecords;
  }

  private async applyStructure(): Promise<boolean> {
    let changed = false;
    for (const config of this.configs.values()) {
      if (config.singleFile) continue;
      const index = this.indexFor(config);
      const head = headOf(index);
      if (head && this.overThreshold(head, 1)) {
        await this.splitShard(config, index, head, true);
        changed = true;
      }
      for (const meta of [...index.shards]) {
        if (!meta.sealed || !this.overThreshold(meta, SEALED_OVERFLOW_FACTOR)) continue;
        await this.splitShard(config, index, meta, false);
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Splits by record count — never at a byte offset, which would leave two unparseable files.
   * The upper half moves into a new shard; when the source was the head, that new shard becomes
   * the head so subsequent appends keep flowing forwards.
   */
  private async splitShard(
    config: AnyCollectionConfig,
    index: CollectionIndex,
    meta: ShardMeta,
    isHead: boolean,
  ): Promise<void> {
    const source = await this.loadShard(config, meta);
    const keys = [...source.records.keys()].sort();

    if (keys.length < 2) {
      // A single oversized record cannot be split. Seal it and start a fresh head instead.
      meta.sealed = true;
      if (isHead) this.openNewHead(config, index);
      this.manifestDirty = true;
      return;
    }

    const pivot = Math.ceil(keys.length / 2);
    const upperId = nextShardId(config.prefix, index);
    const upperMeta = emptyShardMeta(upperId, relativeShardFile(config, upperId));
    const upper: LoadedShard = {
      collection: config.name,
      meta: upperMeta,
      records: new Map(),
      dirty: true,
    };
    for (const key of keys.slice(pivot)) {
      upper.records.set(key, source.records.get(key));
      source.records.delete(key);
    }

    meta.sealed = true;
    upperMeta.sealed = !isHead;
    Object.assign(meta, keyBounds(source.records), { count: source.records.size });
    Object.assign(upperMeta, keyBounds(upper.records), { count: upper.records.size });
    source.dirty = true;

    index.shards.push(upperMeta);
    if (isHead) index.headShardId = upperId;
    this.cache.set(`${config.name}/${upperId}`, upper);
    this.manifestDirty = true;
  }

  private openNewHead(config: AnyCollectionConfig, index: CollectionIndex): void {
    const id = nextShardId(config.prefix, index);
    const meta = emptyShardMeta(id, relativeShardFile(config, id));
    index.shards.push(meta);
    index.headShardId = id;
    this.cache.set(`${config.name}/${id}`, {
      collection: config.name,
      meta,
      records: new Map(),
      dirty: true,
    });
  }

  // -------------------------------------------------------------- boot paths

  private async allShardFilesPresent(manifest: Manifest): Promise<boolean> {
    for (const index of Object.values(manifest.collections)) {
      for (const shard of index.shards) {
        if (shard.count === 0) continue;
        if (!(await pathExists(path.join(this.options.root, shard.file)))) return false;
      }
    }
    return true;
  }

  private async replayJournal(): Promise<number> {
    const entries = await this.journal.readAll();
    let applied = 0;
    for (const entry of entries) {
      const config = this.configs.get(entry.collection);
      if (!config) continue;
      const shard = await this.shardForKey(config, entry.key);
      const existing = shard.records.get(entry.key);
      // Idempotent: an entry older than what already landed on disk is a no-op.
      if (existing && config.updatedAt(existing) > entry.updatedAt) continue;

      if (entry.op === 'delete') {
        if (!shard.records.delete(entry.key)) continue;
      } else {
        const parsed = config.schema.safeParse(entry.record);
        if (!parsed.success) {
          this.options.events?.onWarning?.(`skipped invalid journal entry ${entry.seq}`);
          continue;
        }
        shard.records.set(entry.key, parsed.data);
      }
      shard.dirty = true;
      applied += 1;
    }
    return applied;
  }
}
