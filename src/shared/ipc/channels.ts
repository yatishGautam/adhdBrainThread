/**
 * The single source of truth for every IPC channel name and payload type.
 * Imported by main, preload and renderer alike — a channel added on one side and not the
 * other is a type error, not a runtime surprise.
 */
import type { MomentumScope, ScopeSummary } from "../analytics.js";
import type { Calendar, CalendarScope } from "../calendar.js";
import type { AuthState, Credentials } from "../auth.js";
import type { WeekPlanAccepted } from "../planner.js";
import type { SyncStatus } from "../sync.js";
import type {
	Blocker,
	Day,
	DayPlan,
	Distraction,
	DistractionKind,
	Goal,
	Session,
	SessionOutcome,
	Settings,
	Thought,
	Thread,
	WeekPlan,
	ThreadStatus,
	Todo,
} from "../domain.js";

/** What the HUD and the Now panel both render. Derived in main so they can never disagree. */
export interface SessionState {
	session: Session;
	threadTitle: string;
	nextAction: string | null;
	remainingMs: number;
	paused: boolean;
}

export interface SessionTick {
	sessionId: string;
	remainingMs: number;
	activeMs: number;
	paused: boolean;
	/** 0..1 fraction of planned time spent, for the momentum ring in the HUD. */
	progress: number;
}

export interface CelebrationPayload {
	threadTitle: string;
	steps: number;
	focusMs: number;
	sessionCount: number;
	momentum: number;
	band: string;
}

export interface CelebrationCue {
	packId: string;
	payload: CelebrationPayload;
	reducedMotion: boolean;
	soundEnabled: boolean;
}

export interface RecoveryOffer {
	sessionId: string;
	threadTitle: string;
	activeMs: number;
}

export interface StorageBanner {
	message: string;
	files: string[];
}

export interface RepairReport {
	/** Data files re-read from disk. */
	filesRead: number;
	rollupsRebuilt: boolean;
}

export interface DoneQuery {
	/** Exclusive cursor — the lowest completedLocalDate already loaded. */
	before?: string;
	limit: number;
}

export interface DonePage {
	threads: Thread[];
	/** True when a further page exists in the archive shards. */
	hasMore: boolean;
}

export type ThoughtAction = "thread" | "todo" | "dismiss";

/**
 * The 25/5 cycle's paused moment (§4). A stage never auto-starts: when one ends the timer
 * parks here, showing what is next, until the user presses Resume. `kind` is the stage that is
 * about to run, not the one that just finished.
 */
export interface StageState {
	kind: "focus" | "break";
	threadId: string;
	threadTitle: string;
	plannedMs: number;
	remainingMs: number;
	/** False while waiting for Resume — the HUD pulses gently in that state. */
	running: boolean;
}

export interface StageTick {
	remainingMs: number;
	progress: number;
}

/** Global, carried-forward items (§5). Both lists are read whole, whatever day raised them. */
export interface CarryForward {
	todos: Todo[];
	blockers: Blocker[];
}

/**
 * Why the button may or may not work right now.
 *
 * There is no key state here any more, and no channel that carries a key in either direction —
 * the key lives on the server and this app has never seen it. What is left is the two reasons a
 * press would fail, both of which the button can say up front instead of after a round trip.
 */
export interface PlannerAvailability {
	/** Planning needs an account, because it happens on the server. */
	signedIn: boolean;
	/** Whether that server has a key configured. Unknown until the first `/auth/me`. */
	serverReady: boolean;
}

/** What the planner has cost, so the bill is a number on screen rather than a surprise. */
export interface PlannerSpend {
	month: string;
	plans: number;
	costUsd: number;
	totalPlans: number;
	totalCostUsd: number;
}

/** Everything the planner panel renders in one round trip. */
export interface PlannerState {
	availability: PlannerAvailability;
	spend: PlannerSpend;
	model: string;
	/** The week the button would plan, and which of its days are left. */
	weekKey: string;
	daysLeft: number;
	/** The current week's plan, if one has been generated. */
	week: WeekPlan | null;
}

/** What a view asks for. The scope picks the detail level, not just the layout. */
export interface CalendarRequest {
	from: string;
	to: string;
	scope: CalendarScope;
}

/**
 * A calendar and where it came from.
 *
 * `source` is not decoration. A week built from local files while signed out is complete and
 * correct; one built locally *because a request failed* may be missing what another device did
 * this morning. The UI says which, quietly, rather than pretending the two are the same.
 */
export interface CalendarPayload {
	calendar: Calendar;
	source: "server" | "local";
}

export interface GeneratePlanRequest {
	/** Defaults to today. */
	localDate?: string;
	wakeTime?: string;
	startTime?: string;
	endTime?: string;
	/** About this week only, never stored — a one-off, not a preference. */
	note?: string;
}

/** [request, response] for every `invoke` channel. */
export interface Requests {
	"threads:list": [void, Thread[]];
	"threads:get": [{ id: string }, Thread | null];
	"threads:create": [{ title: string; notes?: string }, Thread];
	"threads:update": [
		{ id: string; patch: Partial<Pick<Thread, "title" | "notes" | "link">> },
		Thread,
	];
	"threads:setStatus": [
		{ id: string; status: ThreadStatus; waitingOn?: string },
		Thread,
	];
	"threads:remove": [{ id: string }, void];
	"threads:done": [DoneQuery, DonePage];
	/** Drag-and-drop: reorder within a list, or move between Active and Dormant. */
	"threads:reorder": [
		{ id: string; toIndex: number; status?: ThreadStatus },
		Thread[],
	];

	"steps:add": [
		{ threadId: string; text: string; afterStepId?: string },
		Thread,
	];
	"steps:toggle": [{ threadId: string; stepId: string }, Thread];
	"steps:update": [{ threadId: string; stepId: string; text: string }, Thread];
	"steps:remove": [{ threadId: string; stepId: string }, Thread];
	"steps:reorder": [
		{ threadId: string; stepId: string; toIndex: number },
		Thread,
	];

	"day:get": [{ localDate: string }, Day | null];
	"day:today": [void, Day | null];
	"day:list": [void, string[]];
	"day:setIntent": [{ threadIds: string[] }, Day];
	"day:setNote": [{ localDate: string; note: string }, Day];
	/** Every write below targets `localDate`, or today when it is omitted. */
	"day:setNow": [{ now: string; localDate?: string }, Day];

	/** Every unresolved todo and blocker, from every day. */
	"carry:list": [void, CarryForward];

	"blocker:add": [{ text: string; localDate?: string }, Day];
	"blocker:resolve": [{ localDate: string; blockerId: string }, Day];
	"blocker:remove": [{ localDate: string; blockerId: string }, Day];

	"log:add": [{ text: string; localDate?: string }, Day];
	"log:remove": [{ localDate: string; entryId: string }, Day];

	"todo:add": [{ text: string; localDate?: string }, Day];
	"todo:toggle": [{ localDate: string; todoId: string }, Day];
	"todo:update": [{ localDate: string; todoId: string; text: string }, Day];
	"todo:remove": [{ localDate: string; todoId: string }, Day];
	"todo:reorder": [{ localDate: string; todoId: string; toIndex: number }, Day];
	"todo:promote": [
		{ localDate: string; todoId: string },
		{ day: Day; thread: Thread },
	];

	"thought:add": [{ text: string; localDate?: string }, Day];
	"thought:remove": [{ localDate: string; thoughtId: string }, Day];
	"thought:note": [{ localDate: string; thoughtId: string; note: string }, Day];
	/** Every parked thought from every day, for the Park view. */
	"park:all": [void, Thought[]];
	"thought:process": [
		{ localDate: string; thoughtId: string; action: ThoughtAction },
		{ day: Day; thread: Thread | null },
	];

	"session:start": [{ threadId: string; plannedMs?: number }, SessionState];
	"session:pause": [void, SessionState | null];
	"session:resume": [void, SessionState | null];
	"session:end": [{ outcome?: SessionOutcome }, null];
	"session:switch": [{ threadId: string }, SessionState];
	"session:distraction": [
		{ kind?: DistractionKind; note?: string },
		Distraction,
	];
	"session:state": [void, SessionState | null];
	"session:forThread": [{ threadId: string }, Session[]];
	"session:resolveRecovery": [{ sessionId: string; keep: boolean }, void];
	/**
	 * One tap: logs the distraction, writes a line to today's Park list and adds the grace time
	 * back to whichever stage is running. Never subtracts from anything.
	 */
	"session:park": [{ kind?: DistractionKind; note?: string }, void];

	"stage:state": [void, StageState | null];
	"stage:resume": [void, StageState | null];
	"stage:skip": [void, StageState | null];
	"stage:stop": [void, null];

	/**
	 * Weekly goals. Every write answers with the whole week's list rather than one goal, for the
	 * same reason the auth channels answer with the whole `AuthState`: the renderer never has to
	 * merge a fragment into a list it also holds.
	 */
	"goals:list": [{ weekKey?: string }, Goal[]];
	"goals:weeks": [void, string[]];
	"goals:add": [{ title: string; weekKey?: string }, Goal[]];
	"goals:update": [
		{ id: string; patch: Partial<Pick<Goal, "title" | "context">> },
		Goal[],
	];
	"goals:toggle": [{ id: string }, Goal[]];
	"goals:remove": [{ id: string }, Goal[]];
	"goals:reorder": [{ id: string; toIndex: number }, Goal[]];
	/** Move an unfinished goal into another week. Always a deliberate press, never automatic. */
	"goals:carryOver": [{ id: string; toWeek: string }, Goal[]];

	/**
	 * The week planner. `planner:generate` is the only channel in this app that costs money, so
	 * it is only ever reachable from a button — nothing calls it on boot, on a timer, or when
	 * the board changes. Generation happens on the server; these channels only ask for it and
	 * read what came back.
	 */
	"planner:state": [void, PlannerState];
	"planner:get": [{ localDate: string }, DayPlan | null];
	/** Every day of a week that still has a plan, in date order. */
	"planner:week": [{ weekKey: string }, { week: WeekPlan | null; days: DayPlan[] }];
	/**
	 * The one channel in this app that costs money. It plans every day left in the week in a
	 * single server call.
	 *
	 * It returns as soon as the run *starts*, not when it finishes — the plan takes the better
	 * part of a minute and arrives through sync, announced by `planner:weekChanged`. Never called
	 * except by a button.
	 */
	"planner:generate": [GeneratePlanRequest, WeekPlanAccepted];
	"planner:clear": [{ localDate: string }, void];
	/**
	 * Turn a plan block into a real thread and link the block to it. The block stops being a
	 * suggestion and starts being work you can run a timer on — the same move `todo:promote`
	 * makes, and it returns both halves for the same reason.
	 */
	"planner:promoteBlock": [
		{ localDate: string; blockId: string },
		{ plan: DayPlan; thread: Thread },
	];

	/**
	 * The calendar. Two channels, and the split is the point.
	 *
	 * `calendar:get` builds the week from local files and always answers — it is what the view
	 * paints with, and it never touches the network. `calendar:refresh` asks the server for its
	 * copy and answers `null` whenever it cannot be had, which includes being signed out. A view
	 * calls the first and renders, then calls the second and swaps only if something comes back.
	 *
	 * Deliberately not one channel that does both: that shape makes every calendar paint wait on
	 * a timeout the moment the wifi is captive-portalled, which is the exact case the whole
	 * local-first design exists for.
	 */
	"calendar:get": [CalendarRequest, CalendarPayload];
	"calendar:refresh": [CalendarRequest, CalendarPayload | null];

	"analytics:scope": [{ scope: MomentumScope; anchor: string }, ScopeSummary];
	"analytics:rebuild": [void, void];

	"settings:get": [void, Settings];
	"settings:update": [{ patch: Partial<Settings> }, Settings];

	/**
	 * The account. Every one of these returns the whole `AuthState` rather than a fragment, so
	 * the renderer never has to merge two sources of truth — and every one of them can be
	 * ignored entirely: the app works signed out.
	 */
	"auth:state": [void, AuthState];
	"auth:register": [Credentials, AuthState];
	"auth:login": [Credentials, AuthState];
	"auth:logout": [void, AuthState];
	"auth:deleteAccount": [void, AuthState];
	/** Points the client at a different backend. Signs out, because a token is server-scoped. */
	"auth:setServer": [{ url: string }, AuthState];

	/** Where sync has got to. Never blocks anything — the app works with it stuck at offline. */
	"sync:status": [void, SyncStatus];
	/** Sync now, for the button in the account panel. Resolves when the round trip is done. */
	"sync:now": [void, SyncStatus];

	/** Always external, never inside the app window (§6). */
	"link:open": [{ url: string }, void];
	"startup:get": [void, boolean];
	"startup:set": [{ enabled: boolean }, boolean];

	"data:repair": [void, RepairReport];
	"data:export": [void, { path: string } | null];
	"data:reveal": [void, void];

	"window:mainReady": [void, void];
	/** The floating calendar. Same idea as the HUD: a week you can leave open next to your work. */
	"calendarWidget:toggle": [void, boolean];
	"calendarWidget:close": [void, void];
	/** What the widget renders with — its own scope, persisted so it reopens as you left it. */
	"calendarWidget:scope": [{ scope: CalendarScope }, void];

	"hud:show": [void, void];
	"hud:reset": [void, void];
	"hud:hide": [void, void];
	"celebration:done": [void, void];
}

/** main → renderer broadcasts. */
export interface Events {
	"session:tick": SessionTick;
	"session:changed": SessionState | null;
	"threads:changed": Thread[];
	"day:changed": Day;
	"analytics:changed": void;
	"settings:changed": Settings;
	"celebration:play": CelebrationCue;
	"celebration:stop": void;
	"session:recovery": RecoveryOffer;
	"storage:banner": StorageBanner;
	"hud:toast": { text: string };
	"micro:tick": { variant: number };
	"stage:changed": StageState | null;
	"stage:tick": StageTick;
	/** A stage just ended: pop, glow, shake, chime. */
	"hud:attention": { stage: "focus" | "break" };
	/** A todo or blocker changed on some other day — the carried-forward lists need a refetch. */
	"carry:changed": void;
	/** A goal was added, edited, ticked or moved. Carries the affected week's whole list. */
	"goals:changed": { weekKey: string; goals: Goal[] };
	/** A plan was generated or thrown away. Null means the day no longer has one. */
	"planner:changed": { localDate: string; plan: DayPlan | null };
	/** A whole week was planned. Carries every day of it, so no view has to refetch. */
	"planner:weekChanged": { weekKey: string; week: WeekPlan | null; days: DayPlan[] };
	/**
	 * A run ended. `error` is null when it worked — the plan itself arrives on
	 * `planner:weekChanged`, because it comes in through sync like any other record.
	 */
	"planner:runFinished": { weekKey: string; error: string | null };
	/** Signed in, signed out, or the boot-time token check came back. */
	"auth:changed": AuthState;
	/** Sync started, finished, went offline or failed. */
	"sync:changed": SyncStatus;
}

export type RequestChannel = keyof Requests;
export type EventChannel = keyof Events;

export const REQUEST_CHANNELS = [
	"threads:list",
	"threads:get",
	"threads:create",
	"threads:update",
	"threads:setStatus",
	"threads:remove",
	"threads:done",
	"threads:reorder",
	"steps:add",
	"steps:toggle",
	"steps:update",
	"steps:remove",
	"steps:reorder",
	"day:get",
	"day:today",
	"day:list",
	"day:setIntent",
	"day:setNote",
	"day:setNow",
	"carry:list",
	"blocker:add",
	"blocker:resolve",
	"blocker:remove",
	"log:add",
	"log:remove",
	"todo:add",
	"todo:toggle",
	"todo:update",
	"todo:remove",
	"todo:reorder",
	"todo:promote",
	"thought:add",
	"thought:remove",
	"thought:note",
	"park:all",
	"thought:process",
	"session:start",
	"session:pause",
	"session:resume",
	"session:end",
	"session:switch",
	"session:distraction",
	"session:state",
	"session:forThread",
	"session:resolveRecovery",
	"session:park",
	"stage:state",
	"stage:resume",
	"stage:skip",
	"stage:stop",
	"goals:list",
	"goals:weeks",
	"goals:add",
	"goals:update",
	"goals:toggle",
	"goals:remove",
	"goals:reorder",
	"goals:carryOver",
	"planner:state",
	"planner:get",
	"planner:week",
	"planner:generate",
	"planner:clear",
	"planner:promoteBlock",
	"calendar:get",
	"calendar:refresh",
	"analytics:scope",
	"analytics:rebuild",
	"settings:get",
	"settings:update",
	"auth:state",
	"auth:register",
	"auth:login",
	"auth:logout",
	"auth:deleteAccount",
	"auth:setServer",
	"sync:status",
	"sync:now",
	"link:open",
	"startup:get",
	"startup:set",
	"data:repair",
	"data:export",
	"data:reveal",
	"window:mainReady",
	"calendarWidget:toggle",
	"calendarWidget:close",
	"calendarWidget:scope",
	"hud:show",
	"hud:reset",
	"hud:hide",
	"celebration:done",
] as const satisfies readonly RequestChannel[];

export const EVENT_CHANNELS = [
	"session:tick",
	"session:changed",
	"threads:changed",
	"day:changed",
	"analytics:changed",
	"settings:changed",
	"celebration:play",
	"celebration:stop",
	"session:recovery",
	"storage:banner",
	"hud:toast",
	"micro:tick",
	"stage:changed",
	"stage:tick",
	"hud:attention",
	"carry:changed",
	"goals:changed",
	"planner:changed",
	"planner:weekChanged",
	"planner:runFinished",
	"auth:changed",
	"sync:changed",
] as const satisfies readonly EventChannel[];

type MissingRequestChannels = Exclude<
	RequestChannel,
	(typeof REQUEST_CHANNELS)[number]
>;
type MissingEventChannels = Exclude<
	EventChannel,
	(typeof EVENT_CHANNELS)[number]
>;

/**
 * Fails to compile if a channel is declared in `Requests`/`Events` but left out of the arrays
 * above — which is what keeps preload's bridge in step with the type map.
 */
export const CHANNELS_ARE_EXHAUSTIVE: [
	MissingRequestChannels,
	MissingEventChannels,
] extends [never, never]
	? true
	: never = true;
