/**
 * Sync status, shared by main and the renderer.
 *
 * `offline` is deliberately a phase rather than an error: the queue is durable and every local
 * write is already on disk, so a laptop with no network is in a normal state, not a broken one.
 */
export type SyncPhase = "idle" | "syncing" | "offline" | "error";

export interface SyncStatus {
	phase: SyncPhase;
	lastSyncedAt: string | null;
	/** Local records the server has not accepted yet. */
	pending: number;
	cursor: number;
	/** Written to be shown to a person. Present only when the last attempt failed. */
	message: string | null;
}
