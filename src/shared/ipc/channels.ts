/**
 * The single source of truth for every IPC channel name and payload type.
 * Imported by main, preload and renderer alike — a channel added on one side and not the
 * other is a type error, not a runtime surprise.
 */
import type { MomentumScope, ScopeSummary } from '../analytics.js';
import type {
  Day,
  Distraction,
  DistractionKind,
  Session,
  SessionOutcome,
  Settings,
  Thread,
  ThreadStatus,
} from '../domain.js';

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
  manifestRebuilt: boolean;
  rollupsRebuilt: boolean;
  shardsScanned: number;
  quarantined: string[];
  compactedFrom: number;
  compactedTo: number;
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

export type ThoughtAction = 'thread' | 'todo' | 'dismiss';

/** [request, response] for every `invoke` channel. */
export interface Requests {
  'threads:list': [void, Thread[]];
  'threads:get': [{ id: string }, Thread | null];
  'threads:create': [{ title: string; notes?: string }, Thread];
  'threads:update': [{ id: string; patch: Partial<Pick<Thread, 'title' | 'notes'>> }, Thread];
  'threads:setStatus': [{ id: string; status: ThreadStatus; waitingOn?: string }, Thread];
  'threads:remove': [{ id: string }, void];
  'threads:done': [DoneQuery, DonePage];

  'steps:add': [{ threadId: string; text: string; afterStepId?: string }, Thread];
  'steps:toggle': [{ threadId: string; stepId: string }, Thread];
  'steps:update': [{ threadId: string; stepId: string; text: string }, Thread];
  'steps:remove': [{ threadId: string; stepId: string }, Thread];
  'steps:reorder': [{ threadId: string; stepId: string; toIndex: number }, Thread];

  'day:get': [{ localDate: string }, Day | null];
  'day:today': [void, Day | null];
  'day:list': [void, string[]];
  'day:setIntent': [{ threadIds: string[] }, Day];
  'day:setNote': [{ localDate: string; note: string }, Day];

  'todo:add': [{ text: string }, Day];
  'todo:toggle': [{ localDate: string; todoId: string }, Day];
  'todo:update': [{ localDate: string; todoId: string; text: string }, Day];
  'todo:remove': [{ localDate: string; todoId: string }, Day];
  'todo:reorder': [{ localDate: string; todoId: string; toIndex: number }, Day];
  'todo:promote': [{ localDate: string; todoId: string }, { day: Day; thread: Thread }];

  'thought:add': [{ text: string }, Day];
  'thought:remove': [{ localDate: string; thoughtId: string }, Day];
  'thought:process': [
    { localDate: string; thoughtId: string; action: ThoughtAction },
    { day: Day; thread: Thread | null },
  ];

  'session:start': [{ threadId: string; plannedMs?: number }, SessionState];
  'session:pause': [void, SessionState | null];
  'session:resume': [void, SessionState | null];
  'session:end': [{ outcome?: SessionOutcome }, null];
  'session:switch': [{ threadId: string }, SessionState];
  'session:distraction': [{ kind?: DistractionKind; note?: string }, Distraction];
  'session:state': [void, SessionState | null];
  'session:forThread': [{ threadId: string }, Session[]];
  'session:resolveRecovery': [{ sessionId: string; keep: boolean }, void];

  'analytics:scope': [{ scope: MomentumScope; anchor: string }, ScopeSummary];
  'analytics:rebuild': [void, void];

  'settings:get': [void, Settings];
  'settings:update': [{ patch: Partial<Settings> }, Settings];

  'data:repair': [void, RepairReport];
  'data:export': [void, { path: string } | null];
  'data:reveal': [void, void];

  'window:mainReady': [void, void];
  'hud:hide': [void, void];
  'celebration:done': [void, void];
}

/** main → renderer broadcasts. */
export interface Events {
  'session:tick': SessionTick;
  'session:changed': SessionState | null;
  'threads:changed': Thread[];
  'day:changed': Day;
  'analytics:changed': void;
  'settings:changed': Settings;
  'celebration:play': CelebrationCue;
  'celebration:stop': void;
  'session:recovery': RecoveryOffer;
  'storage:banner': StorageBanner;
  'hud:toast': { text: string };
  'micro:tick': { variant: number };
}

export type RequestChannel = keyof Requests;
export type EventChannel = keyof Events;

export const REQUEST_CHANNELS = [
  'threads:list',
  'threads:get',
  'threads:create',
  'threads:update',
  'threads:setStatus',
  'threads:remove',
  'threads:done',
  'steps:add',
  'steps:toggle',
  'steps:update',
  'steps:remove',
  'steps:reorder',
  'day:get',
  'day:today',
  'day:list',
  'day:setIntent',
  'day:setNote',
  'todo:add',
  'todo:toggle',
  'todo:update',
  'todo:remove',
  'todo:reorder',
  'todo:promote',
  'thought:add',
  'thought:remove',
  'thought:process',
  'session:start',
  'session:pause',
  'session:resume',
  'session:end',
  'session:switch',
  'session:distraction',
  'session:state',
  'session:forThread',
  'session:resolveRecovery',
  'analytics:scope',
  'analytics:rebuild',
  'settings:get',
  'settings:update',
  'data:repair',
  'data:export',
  'data:reveal',
  'window:mainReady',
  'hud:hide',
  'celebration:done',
] as const satisfies readonly RequestChannel[];

export const EVENT_CHANNELS = [
  'session:tick',
  'session:changed',
  'threads:changed',
  'day:changed',
  'analytics:changed',
  'settings:changed',
  'celebration:play',
  'celebration:stop',
  'session:recovery',
  'storage:banner',
  'hud:toast',
  'micro:tick',
] as const satisfies readonly EventChannel[];

type MissingRequestChannels = Exclude<RequestChannel, (typeof REQUEST_CHANNELS)[number]>;
type MissingEventChannels = Exclude<EventChannel, (typeof EVENT_CHANNELS)[number]>;

/**
 * Fails to compile if a channel is declared in `Requests`/`Events` but left out of the arrays
 * above — which is what keeps preload's bridge in step with the type map.
 */
export const CHANNELS_ARE_EXHAUSTIVE: [MissingRequestChannels, MissingEventChannels] extends [
  never,
  never,
]
  ? true
  : never = true;
