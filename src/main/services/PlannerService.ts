/**
 * The week planner, as this app now sees it: a button that calls the server and stores what
 * comes back.
 *
 * Everything that used to be here — the prompt, the Anthropic client, the reply schema, the id
 * validation, the pricing table — moved to the backend repo (`src/planner/`). The reason is the
 * phone. Three clients each holding their own key means three keys to rotate, three prompts to
 * keep in step and a bill nobody can total; and iOS cannot hold an API key safely at all. So
 * there is one key, in one process, and every device asks it the same question.
 *
 * What survives the move is the rule that mattered most: **it never runs on its own.** No
 * schedule, no on-open generation, no regeneration when the board changes. Every call is a
 * button press, guarded here against re-entry and again on the server.
 *
 * A third rule, learned the hard way: **push before asking.** The server plans from the records
 * it holds, not from this disk, so anything unsynced is invisible to it.
 *
 * The other rule is newer, and it is about the phone: **the plan never travels down the request
 * that asked for it.** Generating takes the better part of a minute, and a connection held open
 * that long is one iOS kills in the background as ordinary behaviour. So the server answers 202
 * and writes the plan; this polls a cheap status endpoint, and syncs when it is told the run has
 * finished. Quitting mid-run loses nothing — the plan is already written and arrives on the next
 * sync, here and on every other device.
 */
import type {
  DayPlanRequest,
  PlanRunState,
  WeekPlanAccepted,
  WeekPlanRequest,
} from '@shared/planner.js';
import { weekKeyOf } from '@shared/week.js';
import type { Database } from '../storage/Database.js';
import type { SyncEngine } from '../sync/SyncEngine.js';
import { ApiError, NetworkError } from './ApiClient.js';
import type { AuthService } from './AuthService.js';

/** How often to ask whether the run has finished. */
const POLL_MS = 3_000;
/**
 * When to stop asking. Comfortably longer than any real run — past this the honest thing is to
 * say so rather than spin forever, and the plan still lands by sync if it was only slow.
 */
const POLL_TIMEOUT_MS = 5 * 60_000;

export interface GeneratePlanRequest {
  /** Defaults to this device's today. Present so a test can pin it. */
  localDate?: string;
  wakeTime?: string;
  startTime?: string;
  endTime?: string;
  /** Free text about this week only. Never stored — it is about one week, not a preference. */
  note?: string;
}

/** Raised with a message written to be shown to the user unedited. */
export class PlannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlannerError';
  }
}

export class PlannerService {
  /**
   * Guards against a double-tapped button. The server refuses a concurrent run too, but a
   * request that never leaves is cheaper than one that comes back 409.
   */
  private running = false;

  constructor(
    private readonly db: Database,
    private readonly auth: AuthService,
    /** Set after construction: the engine needs the planner's database, so it is built second. */
    private sync: SyncEngine | null = null,
  ) {}

  attachSync(engine: SyncEngine): void {
    this.sync = engine;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Plan the days that are left in this week.
   *
   * How many days that is falls out of the date: pressing this on Monday plans seven days,
   * pressing it on Friday plans three. The server does that arithmetic from `localDate`, because
   * only the client knows what day it is where the user is.
   */
  async generate(input: GeneratePlanRequest = {}): Promise<WeekPlanAccepted> {
    const token = this.requireToken();
    if (this.running) {
      throw new PlannerError('A plan is already being generated. Give it a moment.');
    }

    const settings = this.db.settings.get();
    const body: WeekPlanRequest = {
      localDate: input.localDate ?? this.db.clock.today(),
      wakeTime: input.wakeTime ?? settings.wakeTime,
      startTime: input.startTime ?? settings.dayStartTime,
      endTime: input.endTime ?? settings.dayEndTime,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      model: settings.plannerModel,
      effort: settings.plannerEffort,
    };

    this.running = true;
    try {
      // Push first. The server plans from what it *holds*, so a goal typed thirty seconds ago
      // and still sitting in the dirty queue is a goal the plan will never hear about — and the
      // plan comes back saying no goals were set this week, which is both wrong and expensive,
      // because it is a paid call that ignored the whole point of the press.
      await this.sync?.sync().catch(() => undefined);

      const accepted = await this.auth.api.planWeek(token, body);
      // Deliberately not awaited: the caller gets its acknowledgement now, and the wait happens
      // in the background. The plan is already the server's responsibility by this point.
      void this.awaitRun(accepted);
      return accepted;
    } catch (error: unknown) {
      this.running = false;
      throw new PlannerError(describe(error));
    }
  }

  /**
   * Replan the rest of today, from the clock's "now". The "life happened" button: what already
   * happened stays as it was, pinned blocks stay where they are, and only the hours still
   * ahead are reshaped. Same acknowledge-poll-sync flow as the week.
   */
  async generateDay(input: { localDate?: string; note?: string }): Promise<WeekPlanAccepted> {
    const token = this.requireToken();
    if (this.running) {
      throw new PlannerError('A plan is already being generated. Give it a moment.');
    }

    const settings = this.db.settings.get();
    const body: DayPlanRequest = {
      localDate: input.localDate ?? this.db.clock.today(),
      fromTime: clockNow(settings.timezone),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      model: settings.plannerModel,
      effort: settings.plannerEffort,
    };

    this.running = true;
    try {
      // Push first, same as the week: the server replans from what it holds.
      await this.sync?.sync().catch(() => undefined);

      const accepted = await this.auth.api.planDay(token, body);
      void this.awaitRun(accepted);
      return accepted;
    } catch (error: unknown) {
      this.running = false;
      throw new PlannerError(describe(error));
    }
  }

  /**
   * Ask the coach to read a day or a week. Lives on the planner service because it *is* the
   * same machine — one paid run at a time, sync first so the server reads what this device
   * just wrote, poll the shared status, and let the result arrive as a record.
   */
  async generateInsight(scope: 'day' | 'week'): Promise<{ periodKey: string; startedAt: string }> {
    const token = this.requireToken();
    if (this.running) {
      throw new PlannerError('Another generation is already running. Give it a moment.');
    }

    this.running = true;
    try {
      await this.sync?.sync().catch(() => undefined);
      const accepted = await this.auth.api.insight(token, {
        localDate: this.db.clock.today(),
        scope,
      });
      void this.awaitRun({ weekKey: accepted.periodKey, startedAt: accepted.startedAt, dates: [] });
      return accepted;
    } catch (error: unknown) {
      this.running = false;
      throw new PlannerError(describe(error));
    }
  }

  /**
   * Wait for the run, then sync so the result lands locally.
   *
   * Failure here is reported through `onFinished` rather than thrown: nobody is holding this
   * promise. The alternative — an unhandled rejection somewhere in the main process — would take
   * the error somewhere no user ever sees it.
   */
  private async awaitRun(accepted: WeekPlanAccepted): Promise<void> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    try {
      while (Date.now() < deadline) {
        await delay(POLL_MS);
        const token = this.auth.currentToken();
        if (!token) throw new PlannerError('Signed out while the plan was being generated.');

        let state: PlanRunState;
        try {
          state = await this.auth.api.planStatus(token);
        } catch {
          // A blip while polling is not a failed plan — the run is on the server, not on this
          // connection. Keep waiting; the deadline is what ends this loop.
          continue;
        }

        if (state.status === 'failed') {
          throw new PlannerError(state.error ?? 'The plan could not be generated.');
        }
        if (state.status !== 'running') {
          // Includes `idle`, which is what a restarted server reports for a run it has
          // forgotten. Syncing is the right response either way: if a plan was written, it
          // arrives; if not, nothing changes and the week simply has no plan.
          await this.sync?.sync();
          this.onFinished?.(null, accepted.weekKey);
          return;
        }
      }
      throw new PlannerError(
        'The plan is taking much longer than usual. It may still arrive — the next sync will bring it.',
      );
    } catch (error: unknown) {
      this.onFinished?.(error instanceof Error ? error.message : describe(error), accepted.weekKey);
    } finally {
      this.running = false;
    }
  }

  /** Set by AppContext, so a finished run can reach the windows. */
  onFinished: ((error: string | null, weekKey: string) => void) | null = null;

  private requireToken(): string {
    const token = this.auth.currentToken();
    if (!token) {
      throw new PlannerError(
        'Planning happens on the server, so this needs you signed in. Sign in from Settings and try again.',
      );
    }
    return token;
  }

}

/** The week a plan generated today would be filed under. Used by the button's label. */
export function weekKeyForToday(today: string): string {
  return weekKeyOf(today);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Status → sentence, in the same spirit as `ApiClient.describe`: by the time an error reaches
 * the renderer it is something a person can act on, not a status code.
 *
 * The server's own message is preferred where there is one — it knows whether the model refused,
 * ran out of tokens or was rate limited, and it is already written for a person to read.
 */
function describe(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Could not reach the server to plan. Nothing else in the app needs it — try again when you are back online.';
  }
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'Your session expired. Sign in again from Settings, then plan.';
    }
    if (error.status === 429) {
      return 'That is a lot of plans in one hour. Wait a little and try again.';
    }
    if (error.status === 503) {
      return 'This server has no planning key configured, so it cannot generate a plan.';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'The plan could not be generated.';
}

/** `HH:MM` → minutes since midnight. Still here because the plan views sort and lay out on it. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** The wall clock in the user's timezone, `HH:MM`. */
function clockNow(timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: timezone,
  }).format(new Date());
}
