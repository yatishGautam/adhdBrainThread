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
import type {
	Day,
	DayPlan,
	Goal,
	MindfulSession,
	PlanBlock,
	Session,
	Settings,
	Thread,
	WeekPlan,
} from "@shared/domain.js";
import { PLANNER_MODELS } from "@shared/constants.js";

export interface WireOut {
	threads?: unknown[];
	days?: unknown[];
	sessions?: unknown[];
	mindfulSessions?: unknown[];
	goals?: unknown[];
	plans?: unknown[];
	weekPlans?: unknown[];
	profile?: {
		timezone: string;
		updatedAt: string;
		displayName?: string;
		settings?: Record<string, string>;
	};
}

export interface PullResponse {
	threads?: unknown[];
	days?: unknown[];
	sessions?: unknown[];
	/** Absent from a backend deployed before sits existed. */
	mindfulSessions?: unknown[];
	/** Absent from a backend deployed before the week planner existed. */
	goals?: unknown[];
	plans?: unknown[];
	weekPlans?: unknown[];
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

export function goalOut(goal: Goal): Record<string, unknown> {
	return {
		id: goal.id,
		title: goal.title,
		done: goal.done,
		context: goal.context ?? "",
		weekKey: goal.weekKey,
		// `boardOrder` on the wire; `order` here, same rename as threads.
		order: goal.order ?? null,
		createdAt: iso(goal.createdAt),
		updatedAt: iso(goal.updatedAt),
		completedAt: goal.completedAt ? iso(goal.completedAt) : null,
		completedLocalDate: goal.completedLocalDate ?? null,
		carriedFromWeek: goal.carriedFromWeek ?? null,
		deletedAt: goal.deletedAt ? iso(goal.deletedAt) : null,
	};
}

/**
 * Plans go out, but only ever to carry a tombstone.
 *
 * The server writes plans; this app never authors one. What it can do is throw one away, and
 * that has to reach the phone — so the record is sent back whole, with `deletedAt` set. The
 * server's last-write-wins then does the rest.
 */
export function planOut(plan: DayPlan): Record<string, unknown> {
	return {
		localDate: plan.localDate,
		weekKey: plan.weekKey ?? "",
		generatedAt: iso(plan.generatedAt),
		wakeTime: plan.wakeTime,
		startTime: plan.startTime,
		endTime: plan.endTime,
		blocks: plan.blocks ?? [],
		headline: plan.headline ?? "",
		updatedAt: iso(plan.updatedAt ?? plan.generatedAt),
		deletedAt: plan.deletedAt ? iso(plan.deletedAt) : null,
	};
}

export function weekPlanOut(plan: WeekPlan): Record<string, unknown> {
	return {
		weekKey: plan.weekKey,
		generatedAt: iso(plan.generatedAt),
		fromDate: plan.fromDate,
		toDate: plan.toDate,
		headline: plan.headline ?? "",
		deferred: plan.deferred ?? [],
		model: plan.model ?? "",
		// Round-tripped, never recomputed here. What a run cost is the server's number.
		usage: plan.usage ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 },
		updatedAt: iso(plan.updatedAt ?? plan.generatedAt),
		deletedAt: plan.deletedAt ? iso(plan.deletedAt) : null,
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

export function goalIn(raw: unknown): Goal | null {
	const row = raw as Record<string, unknown>;
	const id = str(row.id);
	const weekKey = str(row.weekKey);
	const createdAt = str(row.createdAt);
	if (!id || !weekKey || !createdAt) return null;

	return {
		id,
		title: str(row.title) ?? "Untitled",
		done: bool(row.done),
		context: str(row.context) ?? "",
		weekKey,
		order: num(row.boardOrder ?? row.order) ?? 0,
		createdAt,
		updatedAt: str(row.updatedAt) ?? createdAt,
		...optional("completedAt", str(row.completedAt)),
		...optional("completedLocalDate", date(row.completedLocalDate)),
		...optional("carriedFromWeek", str(row.carriedFromWeek)),
		deletedAt: str(row.deletedAt) ?? null,
	};
}

export function planIn(raw: unknown): DayPlan | null {
	const row = raw as Record<string, unknown>;
	const localDate = date(row.localDate);
	const generatedAt = str(row.generatedAt);
	if (!localDate || !generatedAt) return null;

	return {
		localDate,
		...optional("weekKey", str(row.weekKey)),
		generatedAt,
		wakeTime: str(row.wakeTime) ?? "07:00",
		startTime: str(row.startTime) ?? "09:00",
		endTime: str(row.endTime) ?? "18:00",
		blocks: array(row.blocks) as PlanBlock[],
		headline: str(row.headline) ?? "",
		updatedAt: str(row.updatedAt) ?? generatedAt,
		deletedAt: str(row.deletedAt) ?? null,
	};
}

export function weekPlanIn(raw: unknown): WeekPlan | null {
	const row = raw as Record<string, unknown>;
	const weekKey = str(row.weekKey);
	const generatedAt = str(row.generatedAt);
	if (!weekKey || !generatedAt) return null;

	const usage = row.usage as Record<string, unknown> | undefined;
	return {
		weekKey,
		generatedAt,
		fromDate: date(row.fromDate) ?? "",
		toDate: date(row.toDate) ?? "",
		headline: str(row.headline) ?? "",
		deferred: strings(row.deferred),
		model: str(row.model) ?? "",
		usage: {
			inputTokens: num(usage?.inputTokens) ?? 0,
			outputTokens: num(usage?.outputTokens) ?? 0,
			costUsd: num(usage?.costUsd) ?? 0,
		},
		updatedAt: str(row.updatedAt) ?? generatedAt,
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

// ------------------------------------------------------------------- profile settings

/**
 * The slice of Settings that rides the profile. Only what the server's planner actually reads —
 * HUD positions and sound toggles are this machine's business, and pushing them would make every
 * devices' local preferences fight through last-write-wins for no reason.
 */
export function plannerSettingsOut(settings: Settings): Record<string, string> {
	return {
		wakeTime: settings.wakeTime,
		dayStartTime: settings.dayStartTime,
		dayEndTime: settings.dayEndTime,
		plannerContext: settings.plannerContext,
		plannerModel: settings.plannerModel,
		plannerEffort: settings.plannerEffort,
	};
}

/**
 * The same slice coming back, defensively. The blob is schema-less on the server, so every key
 * is validated here rather than trusted: a malformed time would fail the settings schema and
 * take the whole local settings file hostage over one bad value.
 */
export function plannerSettingsIn(raw: unknown): Partial<Settings> {
	if (typeof raw !== "object" || raw === null) return {};
	const settings = (raw as { settings?: unknown }).settings;
	if (typeof settings !== "object" || settings === null) return {};
	const blob = settings as Record<string, unknown>;
	const patch: Partial<Settings> = {};

	const clock = (value: unknown): string | undefined =>
		typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : undefined;

	const wakeTime = clock(blob.wakeTime);
	if (wakeTime) patch.wakeTime = wakeTime;
	const dayStartTime = clock(blob.dayStartTime);
	if (dayStartTime) patch.dayStartTime = dayStartTime;
	const dayEndTime = clock(blob.dayEndTime);
	if (dayEndTime) patch.dayEndTime = dayEndTime;

	if (typeof blob.plannerContext === "string") patch.plannerContext = blob.plannerContext;
	if (
		typeof blob.plannerModel === "string" &&
		PLANNER_MODELS.some((model) => model.id === blob.plannerModel)
	) {
		patch.plannerModel = blob.plannerModel;
	}
	if (
		blob.plannerEffort === "low" ||
		blob.plannerEffort === "medium" ||
		blob.plannerEffort === "high"
	) {
		patch.plannerEffort = blob.plannerEffort;
	}
	return patch;
}
