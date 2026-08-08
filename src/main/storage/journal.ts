/**
 * Append-only write-ahead log. This is what makes size-based sharding safe: the hot path is a
 * single appended line, and the expensive shard rewrite stays rare and debounced (§4.6 #3, #7).
 */
import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';

export interface JournalEntry {
  seq: number;
  at: string;
  collection: string;
  key: string;
  op: 'put' | 'delete';
  /** Last-write-wins discriminator, which is what makes replay idempotent. */
  updatedAt: string;
  record?: unknown;
}

export class Journal {
  private handle: FileHandle | null = null;
  private seq = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async open(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    this.handle = await fs.open(this.file, 'a+');
    this.seq = (await this.readAll()).reduce((max, entry) => Math.max(max, entry.seq), 0);
  }

  /**
   * `durable: false` skips the fsync. Used only for session heartbeats, where losing the last
   * few seconds of a running clock is recoverable from `startedAt` anyway.
   */
  append(entry: Omit<JournalEntry, 'seq' | 'at'>, durable = true): Promise<void> {
    this.seq += 1;
    const line = `${JSON.stringify({ ...entry, seq: this.seq, at: new Date().toISOString() })}\n`;
    // Serialised through a promise chain so two concurrent mutations cannot interleave bytes.
    this.queue = this.queue.then(async () => {
      const handle = this.handle;
      if (!handle) throw new Error('journal not open');
      await handle.appendFile(line, 'utf8');
      if (durable) await handle.sync();
    });
    return this.queue;
  }

  async readAll(): Promise<JournalEntry[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const entries: JournalEntry[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as JournalEntry);
      } catch {
        // A half-written trailing line means we were killed mid-append. Everything before it
        // is still good, so drop this one and keep the rest.
      }
    }
    return entries.sort((a, b) => a.seq - b.seq);
  }

  /** Only ever called after a successful manifest write. */
  async truncate(): Promise<void> {
    await this.queue;
    await this.handle?.truncate(0);
    await this.handle?.sync();
    this.seq = 0;
  }

  async close(): Promise<void> {
    await this.queue;
    await this.handle?.close();
    this.handle = null;
  }
}
