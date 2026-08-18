/**
 * Reconciles the local store with the server.
 *
 * Pull first, then push. Pulling first means the last-write-wins comparison happens against
 * records this machine has actually seen, so a push cannot silently clobber an edit made on the
 * phone that the laptop had not yet heard about.
 *
 * Nothing in here is on the path of a user action. Every write in this app lands in local JSON
 * and returns; this runs afterwards, on a debounce, and a failure is a status line rather than
 * an error — the work is already saved.
 */
import type { Day, MindfulSession, Session, Thread } from "@shared/domain.js";
import type { SyncPhase, SyncStatus } from "@shared/sync.js";
import type { AuthService } from "../services/AuthService.js";
import { ApiError, NetworkError } from "../services/ApiClient.js";
import type { Database } from "../storage/Database.js";
import { COLLECTION, type Collection } from "../storage/Store.js";
import type { SyncState } from "./SyncState.js";
import {
	dayIn,
	dayOut,
	mindfulIn,
	mindfulOut,
	sessionIn,
	sessionOut,
	threadIn,
	threadOut,
	type PullResponse,
	type WireOut,
} from "./wire.js";

/** The server's own limits, from API.md. A first sync of a real account exceeds all three. */
const MAX_THREADS = 2000;
const MAX_DAYS = 2000;
const MAX_SESSIONS = 5000;

export type { SyncPhase, SyncStatus };

export interface SyncOutcome {
	pulled: number;
	pushed: number;
	conflicts: number;
}

export class SyncEngine {
	private phase: SyncPhase = "idle";
	private message: string | null = null;
	private inFlight: Promise<SyncOutcome | null> | null = null;
	private debounce: ReturnType<typeof setTimeout> | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private pushSuspended = false;
	private closed = false;

	constructor(
		private readonly db: Database,
		private readonly auth: AuthService,
		private readonly state: SyncState,
		private readonly onChanged: (status: SyncStatus) => void,
	) {}

	status(): SyncStatus {
		const snapshot = this.state.snapshot();
		return {
			phase: this.phase,
			lastSyncedAt: snapshot.lastSyncedAt,
			pending: snapshot.pending,
			cursor: snapshot.cursor,
			message: this.message,
		};
	}

	/**
	 * A focus session ticks every second, and pushing each tick would hammer the API and the
	 * battery for nothing — the session is pushed once, when it ends. Pulling stays allowed.
	 */
	suspendPush(suspended: boolean): void {
		this.pushSuspended = suspended;
	}

	start(): void {
		if (this.timer) return;
		// Slow on purpose. This is the safety net for a laptop that has been sitting open with
		// nothing happening; every interesting moment already triggers a sync directly.
		this.timer = setInterval(() => void this.sync().catch(() => {}), 5 * 60_000);
		this.timer.unref?.();
	}

	stop(): void {
		this.closed = true;
		if (this.timer) clearInterval(this.timer);
		if (this.debounce) clearTimeout(this.debounce);
		this.timer = null;
		this.debounce = null;
	}

	/** A local write happened. Coalesced, because a burst of typing is one sync, not thirty. */
	schedule(delayMs = 5_000): void {
		if (this.closed || this.debounce) return;
		this.debounce = setTimeout(() => {
			this.debounce = null;
			void this.sync().catch(() => {});
		}, delayMs);
		this.debounce.unref?.();
	}

	/**
	 * One full round trip. Concurrent calls collapse into the one already running rather than
	 * queueing behind it — three triggers firing at once is normal, three syncs is not.
	 */
	async sync(): Promise<SyncOutcome | null> {
		if (this.inFlight) return this.inFlight;
		const token = this.auth.currentToken();
		if (!token) return null;

		this.inFlight = this.run(token).finally(() => {
			this.inFlight = null;
		});
		return this.inFlight;
	}

	private async run(token: string): Promise<SyncOutcome | null> {
		this.setPhase("syncing", null);
		try {
			const pulled = await this.pullAndMerge(token);
			const { pushed, conflicts } = this.pushSuspended
				? { pushed: 0, conflicts: 0 }
				: await this.pushDirty(token);

			this.state.markSynced(new Date().toISOString());
			await this.state.flush();
			this.setPhase("idle", null);
			return { pulled, pushed, conflicts };
		} catch (error: unknown) {
			// Offline is not a failure — the queue is durable and the work is already on disk.
			if (error instanceof NetworkError) {
				this.setPhase("offline", error.message);
				return null;
			}
			if (error instanceof ApiError && error.isUnauthorized) {
				// The token died while we were using it. AuthService owns signing out; the queue
				// is kept, because those records are still this user's unsynced work.
				await this.auth.handleUnauthorized();
				this.setPhase("error", "Signed out — sign in again to keep syncing.");
				return null;
			}
			this.setPhase("error", error instanceof Error ? error.message : "Sync failed.");
			return null;
		}
	}

	// ----------------------------------------------------------------- pull

	private async pullAndMerge(token: string): Promise<number> {
		const response: PullResponse = await this.auth.api.pull(token, this.state.since);

		let merged = 0;
		merged += await this.mergeInto<Thread>(
			this.remote<Thread>(COLLECTION.threads),
			response.threads,
			threadIn,
			(record) => record.id,
			(record) => record.updatedAt,
		);
		merged += await this.mergeInto<Day>(
			this.remote<Day>(COLLECTION.days),
			response.days,
			dayIn,
			(record) => record.localDate,
			(record) => record.updatedAt ?? record.createdAt,
		);
		merged += await this.mergeInto<Session>(
			this.remote<Session>(COLLECTION.sessions),
			response.sessions,
			sessionIn,
			(record) => record.id,
			(record) => record.updatedAt ?? record.startedAt,
		);
		merged += await this.mergeInto<MindfulSession>(
			this.remote<MindfulSession>(COLLECTION.mindful),
			response.mindfulSessions,
			mindfulIn,
			(record) => record.id,
			(record) => record.updatedAt ?? record.startedAt,
		);

		if (typeof response.seq === "number") this.state.advanceCursor(response.seq);
		return merged;
	}

	/**
	 * Last-write-wins on `updatedAt`, never on arrival order. The case that matters is not two
	 * people editing at once — it is this laptop waking after a weekend and meeting edits the
	 * phone made on Saturday.
	 *
	 * Tombstones are written like any other record. Dropping them instead is how a thread
	 * deleted on the phone quietly comes back on the next sync.
	 */
	private async mergeInto<T>(
		collection: Collection<T>,
		rows: unknown[] | undefined,
		decode: (raw: unknown) => T | null,
		keyOf: (record: T) => string,
		stampOf: (record: T) => string | undefined,
	): Promise<number> {
		if (!rows?.length) return 0;
		let merged = 0;

		for (const raw of rows) {
			const incoming = decode(raw);
			if (!incoming) continue;
			const key = keyOf(incoming);
			const existing = await collection.get(key);

			if (existing && !isNewer(stampOf(incoming), stampOf(existing))) continue;
			await collection.put(incoming);
			// It came from the server, so it is not something to send back. This also settles the
			// race where a record was edited locally and lost: it is no longer ours to push.
			this.state.clear([key]);
			merged += 1;
		}
		return merged;
	}

	// ----------------------------------------------------------------- push

	private async pushDirty(token: string): Promise<{ pushed: number; conflicts: number }> {
		const threads = await this.dirtyRecords<Thread>(COLLECTION.threads);
		const days = await this.dirtyRecords<Day>(COLLECTION.days);
		const sessions = await this.dirtyRecords<Session>(COLLECTION.sessions);
		const sits = await this.dirtyRecords<MindfulSession>(COLLECTION.mindful);
		const profileDirty = this.state.isProfileDirty;

		if (!threads.length && !days.length && !sessions.length && !sits.length && !profileDirty) {
			return { pushed: 0, conflicts: 0 };
		}

		let pushed = 0;
		let conflicts = 0;
		const batches = chunk(threads, days, sessions, sits);

		for (const [index, batch] of batches.entries()) {
			const body: WireOut = {
				threads: batch.threads.map(threadOut),
				days: batch.days.map(dayOut),
				sessions: batch.sessions.map(sessionOut),
				mindfulSessions: batch.sits.map(mindfulOut),
			};
			if (index === 0 && profileDirty) {
				const displayName = this.auth.state().account?.displayName ?? null;
				body.profile = {
					timezone: this.db.settings.get().timezone,
					updatedAt: new Date().toISOString(),
					...(displayName ? { displayName } : {}),
				};
			}

			const result = await this.auth.api.push(token, body);
			const applied = result.applied ?? [];
			pushed += applied.length;
			this.state.clear(applied);

			// A conflict means the server had something newer. Overwrite the local copy with the
			// winner and drop it from the queue — do not retry, do not ask the user. Our version
			// lost, and that is the correct outcome. Keeping it dirty would push the same stale
			// record forever.
			for (const conflict of result.conflicts ?? []) {
				conflicts += 1;
				await this.applyConflict(conflict);
				this.state.clear([conflict.id]);
			}

			if (index === 0 && profileDirty) this.state.clearProfile();
			if (typeof result.seq === "number") this.state.advanceCursor(result.seq);
		}

		return { pushed, conflicts };
	}

	private async applyConflict(conflict: { kind: string; server?: unknown }): Promise<void> {
		if (!conflict.server) return;
		switch (conflict.kind) {
			case "thread": {
				const winner = threadIn(conflict.server);
				if (winner) await this.remote<Thread>(COLLECTION.threads).put(winner);
				return;
			}
			case "day": {
				const winner = dayIn(conflict.server);
				if (winner) await this.remote<Day>(COLLECTION.days).put(winner);
				return;
			}
			case "session": {
				const winner = sessionIn(conflict.server);
				if (winner) await this.remote<Session>(COLLECTION.sessions).put(winner);
				return;
			}
			case "mindfulSession": {
				const winner = mindfulIn(conflict.server);
				if (winner) await this.remote<MindfulSession>(COLLECTION.mindful).put(winner);
				return;
			}
			default:
				// An unknown kind still must not loop forever; the caller has already dropped it
				// from the queue.
				return;
		}
	}

	// -------------------------------------------------------------- internals

	/** Writes that must not be marked dirty: they came from the server. */
	private remote<T>(name: (typeof COLLECTION)[keyof typeof COLLECTION]): Collection<T> {
		return this.db.store.collection<T>(name, { track: false });
	}

	private async dirtyRecords<T>(
		name: (typeof COLLECTION)[keyof typeof COLLECTION],
	): Promise<T[]> {
		const keys = this.state.keys(name);
		if (!keys.length) return [];
		const collection = this.db.store.collection<T>(name, { track: false });
		const out: T[] = [];
		for (const key of keys) {
			const record = await collection.get(key);
			// A key with no record is a queue entry for something that no longer exists — a
			// pre-tombstone delete, or a file repaired by hand. Drop it rather than carrying it.
			if (record) out.push(record);
			else this.state.clear([key]);
		}
		return out;
	}

	private setPhase(phase: SyncPhase, message: string | null): void {
		this.phase = phase;
		this.message = message;
		this.onChanged(this.status());
	}
}

/** Strings compare correctly here because both sides are ISO-8601 in UTC. */
function isNewer(incoming: string | undefined, local: string | undefined): boolean {
	if (!incoming) return false;
	if (!local) return true;
	const a = Date.parse(incoming);
	const b = Date.parse(local);
	if (Number.isNaN(a)) return false;
	if (Number.isNaN(b)) return true;
	return a > b;
}

export interface Batch {
	threads: Thread[];
	days: Day[];
	sessions: Session[];
	sits: MindfulSession[];
}

/**
 * Splits a push into batches the server will accept. A first sync from an established account
 * exceeds every one of its limits, and a rejected 5MB body is not something to discover in the
 * field. Sits ride along in the first batch — there are never many.
 */
export function chunk(
	threads: Thread[],
	days: Day[],
	sessions: Session[],
	sits: MindfulSession[],
): Batch[] {
	const threadPages = pages(threads, MAX_THREADS);
	const dayPages = pages(days, MAX_DAYS);
	const sessionPages = pages(sessions, MAX_SESSIONS);
	const count = Math.max(1, threadPages.length, dayPages.length, sessionPages.length);

	return Array.from({ length: count }, (_unused, index) => ({
		threads: threadPages[index] ?? [],
		days: dayPages[index] ?? [],
		sessions: sessionPages[index] ?? [],
		sits: index === 0 ? sits.slice(0, MAX_SESSIONS) : [],
	}));
}

function pages<T>(items: T[], size: number): T[][] {
	if (!items.length) return [];
	const out: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		out.push(items.slice(index, index + size));
	}
	return out;
}
