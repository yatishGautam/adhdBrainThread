import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { ShardedStore } from './ShardedStore.js';
import { defineCollection, type AnyCollectionConfig } from './types.js';

export interface Note {
  id: string;
  body: string;
  updatedAt: string;
}

export const noteSchema: z.ZodType<Note> = z.object({
  id: z.string(),
  body: z.string(),
  updatedAt: z.string(),
});

export const noteCollection: AnyCollectionConfig = defineCollection<Note>({
  name: 'notes',
  dir: 'notes',
  prefix: 'not',
  schema: noteSchema,
  key: (note) => note.id,
  updatedAt: (note) => note.updatedAt,
});

export async function tempRoot(label: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `thread-${label}-`));
}

export interface TestStoreOptions {
  maxBytes?: number;
  maxRecords?: number;
  cacheLimit?: number;
}

export async function openStore(root: string, options: TestStoreOptions = {}): Promise<ShardedStore> {
  const store = new ShardedStore({
    root,
    collections: [noteCollection],
    flushDebounceMs: 5,
    maxBytes: options.maxBytes ?? 1024,
    maxRecords: options.maxRecords ?? 8,
    cacheLimit: options.cacheLimit ?? 6,
  });
  await store.init();
  return store;
}

export function note(id: string, body = 'x'.repeat(40), updatedAt = '2026-01-01T00:00:00.000Z'): Note {
  return { id, body, updatedAt };
}
