import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { JsonStore, defineCollection } from './JsonStore.js';
import { COLLECTION } from './Store.js';

interface Note {
  id: string;
  localDate: string;
  text: string;
}

const noteSchema: z.ZodType<Note> = z.object({
  id: z.string(),
  localDate: z.string(),
  text: z.string(),
});

/** Threads stand in for the single-file case, sessions for the month-partitioned one. */
const specs = [
  defineCollection<Note>({
    name: COLLECTION.threads,
    schema: noteSchema,
    key: (n) => n.id,
  }),
  defineCollection<Note>({
    name: COLLECTION.sessions,
    schema: noteSchema,
    key: (n) => n.id,
    partition: (n) => n.localDate.slice(0, 7),
  }),
];

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'jsonstore-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const note = (id: string, localDate = '2026-08-13', text = id): Note => ({ id, localDate, text });

async function reopen(store: JsonStore): Promise<JsonStore> {
  await store.close();
  return JsonStore.open(root, specs);
}

describe('single-file collections', () => {
  it('round-trips records through a close and reopen', async () => {
    let store = await JsonStore.open(root, specs);
    await store.collection<Note>(COLLECTION.threads).put(note('a'));
    await store.collection<Note>(COLLECTION.threads).put(note('b'));

    store = await reopen(store);
    const all = await store.collection<Note>(COLLECTION.threads).all();
    expect(all.map((n) => n.id).sort()).toEqual(['a', 'b']);
    await store.close();
  });

  it('replaces a record with the same key rather than duplicating it', async () => {
    const store = await JsonStore.open(root, specs);
    const threads = store.collection<Note>(COLLECTION.threads);
    await threads.put(note('a', '2026-08-13', 'first'));
    await threads.put(note('a', '2026-08-13', 'second'));

    const all = await threads.all();
    expect(all).toHaveLength(1);
    expect(all[0]?.text).toBe('second');
    await store.close();
  });

  it('deletes, and the delete survives a reopen', async () => {
    let store = await JsonStore.open(root, specs);
    await store.collection<Note>(COLLECTION.threads).put(note('a'));
    await store.collection<Note>(COLLECTION.threads).put(note('b'));
    await store.collection<Note>(COLLECTION.threads).delete('a');

    store = await reopen(store);
    const all = await store.collection<Note>(COLLECTION.threads).all();
    expect(all.map((n) => n.id)).toEqual(['b']);
    await store.close();
  });

  it('writes one flat file named after the collection', async () => {
    const store = await JsonStore.open(root, specs);
    await store.collection<Note>(COLLECTION.threads).put(note('a'));
    await store.close();

    const raw = JSON.parse(await fs.readFile(path.join(root, 'threads.json'), 'utf8')) as Note[];
    expect(raw).toHaveLength(1);
    expect(raw[0]?.id).toBe('a');
  });
});

describe('month-partitioned collections', () => {
  it('splits records into one file per month', async () => {
    const store = await JsonStore.open(root, specs);
    const sessions = store.collection<Note>(COLLECTION.sessions);
    await sessions.put(note('a', '2026-07-30'));
    await sessions.put(note('b', '2026-08-01'));
    await sessions.put(note('c', '2026-08-20'));
    await store.close();

    const files = (await fs.readdir(path.join(root, 'sessions'))).sort();
    expect(files).toEqual(['2026-07.json', '2026-08.json']);
    const august = JSON.parse(
      await fs.readFile(path.join(root, 'sessions', '2026-08.json'), 'utf8'),
    ) as Note[];
    expect(august.map((n) => n.id).sort()).toEqual(['b', 'c']);
  });

  it('reads every month back as one collection', async () => {
    let store = await JsonStore.open(root, specs);
    await store.collection<Note>(COLLECTION.sessions).put(note('a', '2026-06-01'));
    await store.collection<Note>(COLLECTION.sessions).put(note('b', '2026-08-01'));

    store = await reopen(store);
    const all = await store.collection<Note>(COLLECTION.sessions).all();
    expect(all.map((n) => n.id).sort()).toEqual(['a', 'b']);
    await store.close();
  });

  it('moves a record that changes month instead of leaving a duplicate behind', async () => {
    let store = await JsonStore.open(root, specs);
    await store.collection<Note>(COLLECTION.sessions).put(note('a', '2026-07-31'));
    // Backdated correction across a month boundary — the classic way to end up with two copies.
    await store.collection<Note>(COLLECTION.sessions).put(note('a', '2026-08-01'));

    store = await reopen(store);
    const all = await store.collection<Note>(COLLECTION.sessions).all();
    expect(all).toHaveLength(1);
    expect(all[0]?.localDate).toBe('2026-08-01');
    await store.close();
  });
});

describe('bad data', () => {
  it('keeps the good records in a file and reports the bad ones', async () => {
    await fs.mkdir(path.join(root, 'sessions'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'threads.json'),
      JSON.stringify([note('good'), { id: 'bad' }]),
    );

    const seen: string[] = [];
    const store = await JsonStore.open(root, specs, {
      onUnreadable: (file, reason) => seen.push(`${path.basename(file)}: ${reason}`),
    });

    const all = await store.collection<Note>(COLLECTION.threads).all();
    expect(all.map((n) => n.id)).toEqual(['good']);
    expect(seen.join()).toContain('did not match the schema');
    await store.close();
  });

  it('reports a corrupt file and carries on with an empty collection', async () => {
    await fs.writeFile(path.join(root, 'threads.json'), '{ not json');

    const seen: string[] = [];
    const store = await JsonStore.open(root, specs, {
      onUnreadable: (_file, reason) => seen.push(reason),
    });

    expect(await store.collection<Note>(COLLECTION.threads).all()).toEqual([]);
    expect(seen.join()).toContain('not valid JSON');
    await store.close();
  });

  it('starts empty when nothing has been written yet', async () => {
    const store = await JsonStore.open(root, specs);
    expect(await store.collection<Note>(COLLECTION.threads).all()).toEqual([]);
    expect(await store.collection<Note>(COLLECTION.sessions).all()).toEqual([]);
    await store.close();
  });
});

describe('reload', () => {
  it('picks up a file edited by hand underneath it', async () => {
    const store = await JsonStore.open(root, specs);
    await store.collection<Note>(COLLECTION.threads).put(note('a'));
    await store.flush();

    // The data directory is meant to be hand-repairable; this is that path.
    await fs.writeFile(path.join(root, 'threads.json'), JSON.stringify([note('edited')]));
    await store.reload();

    const all = await store.collection<Note>(COLLECTION.threads).all();
    expect(all.map((n) => n.id)).toEqual(['edited']);
    await store.close();
  });
});
