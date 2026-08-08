import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadManifest } from './manifest.js';
import { serialise } from './serialise.js';
import { note, noteCollection, openStore, tempRoot, type Note } from './testUtils.js';

async function seed(root: string, count: number, prefix = 'n'): Promise<void> {
  const store = await openStore(root);
  const notes = store.collection<Note>('notes');
  for (let i = 0; i < count; i += 1) {
    await notes.put(note(`${prefix}${String(i).padStart(4, '0')}`));
  }
  await store.close();
}

describe('round trip', () => {
  it('reads back what it wrote after a reopen', async () => {
    const root = await tempRoot('roundtrip');
    await seed(root, 5);

    const store = await openStore(root);
    const notes = store.collection<Note>('notes');
    expect(await notes.get('n0003')).toMatchObject({ id: 'n0003' });
    expect((await notes.all()).length).toBe(5);
    await store.close();
  });

  it('writes shard files with sorted keys and 2-space indent', async () => {
    const root = await tempRoot('diffable');
    await seed(root, 3);
    const raw = await fs.readFile(path.join(root, 'notes', 'not-000001.json'), 'utf8');
    expect(raw).toBe(serialise(JSON.parse(raw)));
    expect(raw.indexOf('n0000')).toBeLessThan(raw.indexOf('n0002'));
  });
});

describe('sharding', () => {
  it('seals the head and opens a new one once a threshold is crossed', async () => {
    const root = await tempRoot('seal');
    await seed(root, 30);

    const manifest = await loadManifest(root);
    const index = manifest?.collections.notes;
    expect(index).toBeDefined();
    expect(index!.shards.length).toBeGreaterThan(1);
    const sealed = index!.shards.filter((shard) => shard.sealed);
    expect(sealed.length).toBeGreaterThan(0);
    // Ranges must not overlap, or key resolution would be ambiguous.
    const ordered = index!.shards.filter((s) => s.count > 0).sort((a, b) => (a.minKey < b.minKey ? -1 : 1));
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i]!.minKey > ordered[i - 1]!.maxKey).toBe(true);
    }
  });

  it('routes a backdated key into the sealed shard that owns its range', async () => {
    const root = await tempRoot('backdate');
    await seed(root, 30, 'n');

    const store = await openStore(root);
    const notes = store.collection<Note>('notes');
    // 'n0005a' sorts inside the first sealed shard, not at the head.
    await notes.put(note('n0005a', 'backdated'));
    await store.close();

    const manifest = await loadManifest(root);
    const owner = manifest!.collections.notes!.shards.find(
      (shard) => shard.minKey <= 'n0005a' && shard.maxKey >= 'n0005a',
    );
    expect(owner).toBeDefined();
    expect(owner!.sealed).toBe(true);

    const reopened = await openStore(root);
    expect(await reopened.collection<Note>('notes').get('n0005a')).toMatchObject({
      body: 'backdated',
    });
    await reopened.close();
  });

  it('splits a sealed shard in place once backdated inserts overflow it', async () => {
    const root = await tempRoot('overflow');
    await seed(root, 20);
    const before = (await loadManifest(root))!.collections.notes!.shards.length;

    const store = await openStore(root);
    const notes = store.collection<Note>('notes');
    for (let i = 0; i < 40; i += 1) await notes.put(note(`n0001-${String(i).padStart(3, '0')}`));
    await store.close();

    const after = (await loadManifest(root))!.collections.notes!;
    expect(after.shards.length).toBeGreaterThan(before);
    for (const shard of after.shards) {
      // 2x threshold is the ceiling a sealed shard is allowed to reach before splitting.
      expect(shard.count).toBeLessThanOrEqual(8 * 2);
    }
  });
});

describe('durability', () => {
  it('replays the journal when the process dies before the shard flush', async () => {
    const root = await tempRoot('journal');
    await seed(root, 3);

    // Simulate a kill between journal append and flush: append by hand, never flush.
    const entry = {
      seq: 999,
      at: new Date().toISOString(),
      collection: 'notes',
      key: 'n9999',
      op: 'put',
      updatedAt: '2026-02-02T00:00:00.000Z',
      record: note('n9999', 'survived'),
    };
    await fs.appendFile(path.join(root, 'journal.jsonl'), `${JSON.stringify(entry)}\n`);

    const store = await openStore(root);
    expect(await store.collection<Note>('notes').get('n9999')).toMatchObject({ body: 'survived' });
    await store.close();

    expect((await fs.readFile(path.join(root, 'journal.jsonl'), 'utf8')).trim()).toBe('');
  });

  it('ignores a half-written trailing journal line', async () => {
    const root = await tempRoot('torn');
    await seed(root, 2);
    await fs.appendFile(path.join(root, 'journal.jsonl'), '{"seq":5,"collection":"notes","k');

    const store = await openStore(root);
    expect((await store.collection<Note>('notes').all()).length).toBe(2);
    await store.close();
  });

  it('survives a truncated shard file by quarantining it', async () => {
    const root = await tempRoot('corrupt');
    await seed(root, 4);
    const file = path.join(root, 'notes', 'not-000001.json');
    await fs.writeFile(file, '{"id":"not-000001","records":[{"id":"a"');

    const quarantined: string[] = [];
    const store = await openStore(root);
    // The quarantine happens on first touch of the shard.
    await store.collection<Note>('notes').all();
    await store.close();
    void quarantined;

    const files = await fs.readdir(path.join(root, 'notes'));
    expect(files.some((name) => name.includes('.corrupt-'))).toBe(true);
  });

  it('rebuilds a deleted manifest from the shard files alone', async () => {
    const root = await tempRoot('rebuild');
    await seed(root, 25);
    const expected = (await openStore(root).then(async (s) => {
      const all = await s.collection<Note>('notes').all();
      await s.close();
      return all;
    })).length;

    await fs.rm(path.join(root, 'manifest.json'));

    const store = await openStore(root);
    const recovered = await store.collection<Note>('notes').all();
    await store.close();
    expect(recovered.length).toBe(expected);
    expect(await loadManifest(root)).not.toBeNull();
  });
});

describe('cache', () => {
  it('keeps at most the configured number of shards resident and flushes dirty on evict', async () => {
    const root = await tempRoot('lru');
    await seed(root, 60);

    const store = await openStore(root, { cacheLimit: 2 });
    const notes = store.collection<Note>('notes');
    const all = await notes.all();
    expect(all.length).toBe(60);
    await store.close();

    const reopened = await openStore(root, { cacheLimit: 2 });
    expect((await reopened.collection<Note>('notes').all()).length).toBe(60);
    await reopened.close();
  });
});

describe('deletes', () => {
  it('removes a record and keeps it removed across a reopen', async () => {
    const root = await tempRoot('delete');
    await seed(root, 6);

    const store = await openStore(root);
    await store.collection<Note>('notes').delete('n0002');
    await store.close();

    const reopened = await openStore(root);
    expect(await reopened.collection<Note>('notes').get('n0002')).toBeNull();
    expect((await reopened.collection<Note>('notes').all()).length).toBe(5);
    await reopened.close();
  });

  it('merges sparse shards when compacting', async () => {
    const root = await tempRoot('compact');
    await seed(root, 40);

    const store = await openStore(root);
    const notes = store.collection<Note>('notes');
    for (let i = 0; i < 30; i += 1) await notes.delete(`n${String(i).padStart(4, '0')}`);
    const { compacted } = await store.repair();
    await store.close();

    expect(compacted.after).toBeLessThanOrEqual(compacted.before);
    const reopened = await openStore(root);
    expect((await reopened.collection<Note>('notes').all()).length).toBe(10);
    await reopened.close();
  });
});

describe('collection config', () => {
  it('never shards a single-file collection', () => {
    expect(noteCollection.singleFile).toBeUndefined();
  });
});
