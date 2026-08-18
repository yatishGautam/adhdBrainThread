/**
 * What the sync engine has to remember between runs: how far it has read, and what it has
 * written that the server has not seen.
 *
 * The dirty sets live on disk rather than in memory because the process that made the edit is
 * often not the process that gets to push it — quit the app mid-edit and the queue has to still
 * be there next launch. They are sets of keys, not copies of records: the record itself is
 * already in the store, and holding a second copy is how a queue drifts out of step with the
 * data it describes.
 */
import path from "node:path";
import { atomicWriteFile, readFileIfExists } from "../storage/atomicWrite.js";
import { COLLECTION, type CollectionName } from "../storage/Store.js";

/** The tracked collections, in push order. Settings/profile is tracked separately. */
const TRACKED: CollectionName[] = [
	COLLECTION.threads,
	COLLECTION.days,
	COLLECTION.sessions,
	COLLECTION.mindful,
];

interface Persisted {
	version: 1;
	cursor: number;
	lastSyncedAt: string | null;
	profileDirty: boolean;
	dirty: Record<string, string[]>;
}

export interface SyncSnapshot {
	cursor: number;
	lastSyncedAt: string | null;
	/** How many local records are waiting to be pushed. */
	pending: number;
}

export class SyncState {
	private cursor = 0;
	private lastSyncedAt: string | null = null;
	private profileDirty = false;
	private readonly dirty = new Map<CollectionName, Set<string>>(
		TRACKED.map((name) => [name, new Set<string>()]),
	);
	private writing: Promise<void> | null = null;
	private again = false;

	constructor(private readonly root: string) {}

	private get file(): string {
		return path.join(this.root, "sync.json");
	}

	async load(): Promise<void> {
		const raw = await readFileIfExists(this.file);
		if (raw === null) return;
		try {
			const parsed = JSON.parse(raw) as Persisted;
			this.cursor = Number.isFinite(parsed.cursor) ? parsed.cursor : 0;
			this.lastSyncedAt = parsed.lastSyncedAt ?? null;
			this.profileDirty = parsed.profileDirty ?? false;
			for (const name of TRACKED) {
				this.dirty.set(name, new Set(parsed.dirty?.[name] ?? []));
			}
		} catch {
			// A corrupt queue file is recoverable: cursor 0 re-reads everything from the server,
			// which is slow but correct. Refusing to boot over it would not be.
			console.warn("[sync] sync.json unreadable — starting from a full pull");
			this.reset();
		}
	}

	snapshot(): SyncSnapshot {
		return {
			cursor: this.cursor,
			lastSyncedAt: this.lastSyncedAt,
			pending: this.pendingCount(),
		};
	}

	pendingCount(): number {
		let total = 0;
		for (const set of this.dirty.values()) total += set.size;
		return total;
	}

	keys(name: CollectionName): string[] {
		return [...(this.dirty.get(name) ?? [])];
	}

	get since(): number {
		return this.cursor;
	}

	get isProfileDirty(): boolean {
		return this.profileDirty;
	}

	/** Called for every local write, from the store's own write path. */
	mark(name: CollectionName, key: string): void {
		const set = this.dirty.get(name);
		if (!set || set.has(key)) return;
		set.add(key);
		this.schedulePersist();
	}

	markProfile(): void {
		if (this.profileDirty) return;
		this.profileDirty = true;
		this.schedulePersist();
	}

	/**
	 * Drops keys the server has accepted — and keys it rejected as conflicts, which is the same
	 * thing for queueing purposes. A conflict means our version lost; keeping it dirty would
	 * push the same stale record forever.
	 *
	 * `applied` from the server is a flat list of ids across every kind, so it is matched
	 * against all of them. Ids are ULIDs and day keys are dates, so they cannot collide.
	 */
	clear(keys: Iterable<string>): void {
		let changed = false;
		for (const key of keys) {
			for (const set of this.dirty.values()) {
				if (set.delete(key)) changed = true;
			}
		}
		if (changed) this.schedulePersist();
	}

	clearProfile(): void {
		if (!this.profileDirty) return;
		this.profileDirty = false;
		this.schedulePersist();
	}

	advanceCursor(seq: number): void {
		if (seq <= this.cursor) return;
		this.cursor = seq;
		this.schedulePersist();
	}

	markSynced(at: string): void {
		this.lastSyncedAt = at;
		this.schedulePersist();
	}

	/** Signing out. The next account starts from nothing, not from this one's queue. */
	reset(): void {
		this.cursor = 0;
		this.lastSyncedAt = null;
		this.profileDirty = false;
		for (const set of this.dirty.values()) set.clear();
		this.schedulePersist();
	}

	/**
	 * Waits for the queue file to be on disk. It joins the serialised chain rather than writing
	 * alongside it — two concurrent writers of the same file is how the last one wins by luck.
	 */
	async flush(): Promise<void> {
		while (this.writing) {
			const current = this.writing;
			await current;
			if (this.writing === current) break;
		}
		await this.persist();
	}

	// ---------------------------------------------------------------- private

	/**
	 * Serialised rather than debounced: this file must never lag behind a crash by more than the
	 * write in flight, because a lost dirty key is a record that silently never syncs. Writes
	 * that arrive during one are coalesced into a single follow-up.
	 */
	private schedulePersist(): void {
		if (this.writing) {
			this.again = true;
			return;
		}
		this.writing = this.persist()
			.catch((error: unknown) => console.error("[sync] could not save the queue", error))
			.finally(() => {
				this.writing = null;
				if (this.again) {
					this.again = false;
					this.schedulePersist();
				}
			});
	}

	private async persist(): Promise<void> {
		const out: Persisted = {
			version: 1,
			cursor: this.cursor,
			lastSyncedAt: this.lastSyncedAt,
			profileDirty: this.profileDirty,
			dirty: Object.fromEntries(TRACKED.map((name) => [name, this.keys(name)])),
		};
		await atomicWriteFile(this.file, `${JSON.stringify(out, null, 2)}\n`);
	}
}
