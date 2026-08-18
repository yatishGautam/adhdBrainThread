/**
 * The wire format, which is deliberately not the local format.
 *
 * The server sends `boardOrder` where this app says `order`, and `nowText` where it says `now`,
 * because those are its column names — and Postgres hands back timestamps and dates in its own
 * shape. Decoding straight into the domain types would tie this app's JSON files to whatever
 * the database columns happen to be called, so the translation lives here, in one file, in both
 * directions.
 *
 * Everything inbound is defensive: a field this version does not understand is ignored, and a
 * missing one falls back rather than throwing. A client that crashes on an unfamiliar payload
 * cannot be deployed independently of the server, and these three apps very much are.
 */
import type { Day, MindfulSession, Session, Thread } from "@shared/domain.js";

export interface WireOut {
	threads?: unknown[];
	days?: unknown[];
	sessions?: unknown[];
	mindfulSessions?: unknown[];
	profile?: { timezone: string; updatedAt: string; displayName?: string };
}

export interface PullResponse {
	threads?: unknown[];
	days?: unknown[];
	sessions?: unknown[];
	/** Absent from a backend deployed before sits existed. */
	mindfulSessions?: unknown[];
	profile?: unknown;
	seq?: number;
}

export interface PushResponse {
	applied?: string[];
	conflicts?: { kind: string; id: string; server?: unknown }[];
	seq?: number;
}

// ------------------------------------------------------------------- outbound

export function threadOut(thread: Thread): Record<string, unknown> {
	return {
		id: thread.id,
		title: thread.title,
		notes: thread.notes ?? "",
		status: thread.status,
		waitingOn: thread.waitingOn ?? null,
		link: thread.link ?? null,
		order: thread.order ?? null,
		steps: thread.steps ?? [],
		createdAt: iso(thread.createdAt),
		completedAt: thread.completedAt ? iso(thread.completedAt) : null,
		completedLocalDate: thread.completedLocalDate ?? null,
		totalFocusMs: thread.totalFocusMs ?? 0,
		sessionCount: thread.sessionCount ?? 0,
		distractionCount: thread.distractionCount ?? 0,
		archived: thread.archived ?? false,
		updatedAt: iso(thread.updatedAt),
		deletedAt: thread.deletedAt ? iso(thread.deletedAt) : null,
	};
}

export function dayOut(day: Day): Record<string, unknown> {
	return {
		localDate: day.localDate,
		createdAt: iso(day.createdAt),
		now: day.now ?? null,
		note: day.note ?? null,
		todos: day.todos ?? [],
		blockers: day.blockers ?? [],
		log: day.log ?? [],
		thoughts: day.thoughts ?? [],
		intentThreadIds: day.intentThreadIds ?? [],
		loggedThreadIds: day.loggedThreadIds ?? [],
		// A day written before sync existed has no updatedAt. Sending its createdAt rather than
		// "now" is the honest answer: it says the day is old, so a newer copy on another device
		// wins — which is what should happen.
		updatedAt: iso(day.updatedAt ?? day.createdAt),
		deletedAt: day.deletedAt ? iso(day.deletedAt) : null,
	};
}

export function sessionOut(session: Session): Record<string, unknown> {
	return {
		id: session.id,
		threadId: session.threadId,
		startedAt: iso(session.startedAt),
		endedAt: session.endedAt ? iso(session.endedAt) : null,
		localDate: session.localDate,
		plannedMs: session.plannedMs,
		activeMs: session.activeMs,
		grantedMs: session.grantedMs ?? 0,
		outcome: session.outcome,
		switchedToThreadId: session.switchedToThreadId ?? null,
		distractions: session.distractions ?? [],
		pauses: session.pauses ?? [],
		updatedAt: iso(session.updatedAt ?? session.endedAt ?? session.startedAt),
		deletedAt: session.deletedAt ? iso(session.deletedAt) : null,
	};
}

export function mindfulOut(sit: MindfulSession): Record<string, unknown> {
	return {
		id: sit.id,
		startedAt: iso(sit.startedAt),
		endedAt: sit.endedAt ? iso(sit.endedAt) : null,
		localDate: sit.localDate,
		plannedMs: sit.plannedMs,
		actualMs: sit.actualMs,
		completed: sit.completed,
		updatedAt: iso(sit.updatedAt ?? sit.startedAt),
		deletedAt: sit.deletedAt ? iso(sit.deletedAt) : null,
	};
}

// -------------------------------------------------------------------- inbound

export function threadIn(raw: unknown): Thread | null {
	const row = raw as Record<string, unknown>;
	const id = str(row.id);
	const createdAt = str(row.createdAt);
	const updatedAt = str(row.updatedAt);
	if (!id || !createdAt || !updatedAt) return null;

	return {
		id,
		title: str(row.title) ?? "Untitled",
		notes: str(row.notes) ?? "",
		status: threadStatus(str(row.status)),
		steps: Array.isArray(row.steps) ? (row.steps as Thread["steps"]) : [],
		...optional("waitingOn", str(row.waitingOn)),
		...optional("link", str(row.link)),
		// `boardOrder` on the wire; `order` here. The column was renamed to avoid quoting a
		// reserved word in SQL, and the client kept the word that reads better.
		...optional("order", num(row.boardOrder ?? row.order)),
		createdAt,
		updatedAt,
		...optional("completedAt", str(row.completedAt)),
		...optional("completedLocalDate", date(row.completedLocalDate)),
		totalFocusMs: num(row.totalFocusMs) ?? 0,
		sessionCount: num(row.sessionCount) ?? 0,
		distractionCount: num(row.distractionCount) ?? 0,
		archived: bool(row.archived),
		deletedAt: str(row.deletedAt) ?? null,
	};
}

export function dayIn(raw: unknown): Day | null {
	const row = raw as Record<string, unknown>;
	const localDate = date(row.localDate);
	const createdAt = str(row.createdAt);
	if (!localDate || !createdAt) return null;

	return {
		localDate,
		createdAt,
		intentThreadIds: strings(row.intentThreadIds),
		todos: array(row.todos) as Day["todos"],
		thoughts: array(row.thoughts) as Day["thoughts"],
		loggedThreadIds: strings(row.loggedThreadIds),
		...optional("note", str(row.note)),
		...optional("now", str(row.nowText ?? row.now)),
		blockers: array(row.blockers) as Day["blockers"],
		log: array(row.log) as Day["log"],
		updatedAt: str(row.updatedAt) ?? createdAt,
		deletedAt: str(row.deletedAt) ?? null,
	};
}

export function sessionIn(raw: unknown): Session | null {
	const row = raw as Record<string, unknown>;
	const id = str(row.id);
	const startedAt = str(row.startedAt);
	const localDate = date(row.localDate);
	if (!id || !startedAt || !localDate) return null;

	return {
		id,
		threadId: str(row.threadId) ?? "",
		startedAt,
		...optional("endedAt", str(row.endedAt)),
		localDate,
		plannedMs: num(row.plannedMs) ?? 0,
		activeMs: num(row.activeMs) ?? 0,
		grantedMs: num(row.grantedMs) ?? 0,
		outcome: outcome(str(row.outcome)),
		...optional("switchedToThreadId", str(row.switchedToThreadId)),
		distractions: array(row.distractions) as Session["distractions"],
		pauses: array(row.pauses) as Session["pauses"],
		updatedAt: str(row.updatedAt) ?? startedAt,
		deletedAt: str(row.deletedAt) ?? null,
	};
}

export function mindfulIn(raw: unknown): MindfulSession | null {
	const row = raw as Record<string, unknown>;
	const id = str(row.id);
	const startedAt = str(row.startedAt);
	const localDate = date(row.localDate);
	if (!id || !startedAt || !localDate) return null;

	return {
		id,
		startedAt,
		endedAt: str(row.endedAt) ?? null,
		localDate,
		plannedMs: num(row.plannedMs) ?? 0,
		actualMs: num(row.actualMs) ?? 0,
		completed: bool(row.completed),
		updatedAt: str(row.updatedAt) ?? startedAt,
		deletedAt: str(row.deletedAt) ?? null,
	};
}

// -------------------------------------------------------------------- helpers

/**
 * Exactly-optional fields (`waitingOn?: string`) cannot hold `undefined` under
 * `exactOptionalPropertyTypes`, so a missing value has to be an absent key rather than an
 * explicit undefined.
 */
function optional<K extends string, V>(key: K, value: V | null | undefined): Record<K, V> | Record<string, never> {
	return value === null || value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function str(value: unknown): string | null {
	if (typeof value === "string") return value;
	// Postgres timestamps arrive as Date once something has already parsed the JSON for us.
	if (value instanceof Date) return value.toISOString();
	return null;
}

function num(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
		// `bigint` and `numeric` columns come back as strings from most Postgres drivers.
		return Number(value);
	}
	return null;
}

function bool(value: unknown): boolean {
	return value === true;
}

function array(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
	return array(value).filter((item): item is string => typeof item === "string");
}

/** A `date` column can arrive as `2026-08-13` or as a full timestamp; both mean the same day. */
function date(value: unknown): string | null {
	const text = str(value);
	if (!text) return null;
	return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

function iso(value: string): string {
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

const STATUSES = ["idle", "in_progress", "blocked", "waiting", "done", "dormant"] as const;

function threadStatus(value: string | null): Thread["status"] {
	return (STATUSES as readonly string[]).includes(value ?? "")
		? (value as Thread["status"])
		: "in_progress";
}

const OUTCOMES = ["completed", "ended_early", "switched", "abandoned", "recovered"] as const;

function outcome(value: string | null): Session["outcome"] {
	return (OUTCOMES as readonly string[]).includes(value ?? "")
		? (value as Session["outcome"])
		: "ended_early";
}
