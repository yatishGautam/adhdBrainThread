/**
 * The authoritative session clock. It lives here, in the main process, driven by monotonic
 * deltas — the renderer never owns the countdown, and the wall clock is metadata only, because
 * a clock that moves backwards must not produce a negative duration (§4.6 #14).
 */
import { performance } from 'node:perf_hooks';
import { HUD_TICK_MS, SESSION_CHECKPOINT_MS } from '@shared/constants.js';
import type { Distraction, DistractionKind, Session, SessionOutcome } from '@shared/domain.js';
import type { SessionState, SessionTick } from '@shared/ipc/channels.js';
import { ulid } from '@shared/ids.js';
import { nextAction } from '../storage/stepOrder.js';
import type { Database } from '../storage/Database.js';

export interface SessionServiceEvents {
  onTick: (tick: SessionTick) => void;
  onChanged: (state: SessionState | null) => void;
  onToast: (text: string) => void;
  /** Fires with the local dates whose rollups need recomputing. */
  onDaysTouched: (localDates: string[]) => void;
  /** A focus block ran to the end. Drives the 25/5 hand-off and the short celebration. */
  onCompleted: (session: Session, threadTitle: string) => void;
  /** A session began — anything the cycle was waiting on is now stale. */
  onStarted: (session: Session) => void;
}

interface RunningSession {
  session: Session;
  /** performance.now() at the last resume. */
  markedAt: number;
  paused: boolean;
}

export class SessionService {
  private running: RunningSession | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private sinceCheckpoint = 0;

  constructor(
    private readonly db: Database,
    private readonly events: SessionServiceEvents,
  ) {}

  isRunning(): boolean {
    return this.running !== null;
  }

  currentThreadId(): string | null {
    return this.running?.session.threadId ?? null;
  }

  async state(): Promise<SessionState | null> {
    if (!this.running) return null;
    return this.describe(this.running);
  }

  async start(threadId: string, plannedMs?: number): Promise<SessionState> {
    if (this.running) await this.end('switched');

    const thread = await this.db.threads.get(threadId);
    if (!thread) throw new Error(`thread not found: ${threadId}`);

    const session: Session = {
      id: ulid(),
      threadId,
      startedAt: this.db.clock.now(),
      localDate: this.db.clock.today(),
      plannedMs: plannedMs ?? this.db.settings.get().defaultSessionMs,
      activeMs: 0,
      grantedMs: 0,
      outcome: 'ended_early',
      distractions: [],
      pauses: [],
    };

    this.running = { session, markedAt: performance.now(), paused: false };
    await this.db.sessions.save(session);
    // Starting a thread is the act that makes it in progress; no separate step for the user.
    if (thread.status !== 'in_progress') {
      await this.db.threads.setStatus(threadId, 'in_progress');
    }
    await this.db.settings.update({ lastOpenSessionId: session.id });

    this.startTicker();
    const state = await this.describe(this.running);
    this.events.onStarted(session);
    this.events.onChanged(state);
    this.events.onDaysTouched([session.localDate]);
    return state;
  }

  async pause(): Promise<SessionState | null> {
    const running = this.running;
    if (!running || running.paused) return this.state();
    this.accumulate(running);
    running.paused = true;
    running.session.pauses.push({ at: this.db.clock.now() });
    await this.persist();
    const state = await this.describe(running);
    this.events.onChanged(state);
    return state;
  }

  async resume(): Promise<SessionState | null> {
    const running = this.running;
    if (!running || !running.paused) return this.state();
    const open = running.session.pauses[running.session.pauses.length - 1];
    if (open && !open.resumedAt) open.resumedAt = this.db.clock.now();
    running.paused = false;
    running.markedAt = performance.now();
    await this.persist();
    const state = await this.describe(running);
    this.events.onChanged(state);
    return state;
  }

  /**
   * One tap, no dialog. Adds grace time to the clock and costs exactly nothing — logging a
   * distraction must never lower a number the user can see.
   */
  async logDistraction(kind: DistractionKind = 'unspecified', note?: string): Promise<Distraction> {
    const running = this.running;
    if (!running) throw new Error('no session running');

    const grantedMs = this.db.settings.get().distractionGraceMs;
    const distraction: Distraction = {
      id: ulid(),
      at: this.db.clock.now(),
      kind,
      grantedMs,
      ...(note ? { note } : {}),
    };
    running.session.distractions.push(distraction);
    running.session.grantedMs += grantedMs;

    const thread = await this.db.threads.get(running.session.threadId);
    if (thread) await this.db.threads.save({ ...thread, distractionCount: thread.distractionCount + 1 });

    await this.persist();
    const minutes = Math.round(grantedMs / 60_000);
    this.events.onToast(
      minutes > 0 ? `Parked. ${minutes === 1 ? 'A minute' : `${minutes} minutes`} back.` : 'Parked.',
    );
    this.events.onChanged(await this.describe(running));
    this.events.onDaysTouched([running.session.localDate]);
    return distraction;
  }

  /** Replaces "skip": ends the current session and starts the next one. No friction, no warning. */
  async switchTo(threadId: string): Promise<SessionState> {
    const previous = this.running;
    if (previous) previous.session.switchedToThreadId = threadId;
    await this.end('switched');
    return this.start(threadId);
  }

  async end(outcome?: SessionOutcome): Promise<void> {
    const running = this.running;
    if (!running) return;

    this.stopTicker();
    if (!running.paused) this.accumulate(running);
    this.running = null;

    const { session } = running;
    session.endedAt = this.db.clock.now();
    session.outcome = outcome ?? (this.remaining(session) <= 0 ? 'completed' : 'ended_early');

    await this.db.sessions.save(session);
    const thread = await this.db.threads.get(session.threadId);
    if (thread) {
      await this.db.threads.save({
        ...thread,
        totalFocusMs: thread.totalFocusMs + session.activeMs,
        sessionCount: thread.sessionCount + 1,
      });
    }
    await this.db.settings.update({ lastOpenSessionId: undefined });
    await this.db.store.flush();

    this.events.onChanged(null);
    this.events.onDaysTouched([session.localDate]);
    if (session.outcome === 'completed') {
      this.events.onCompleted(session, thread?.title ?? 'Untitled');
    }
  }

  /**
   * Crash recovery. Time that was actually spent is never silently discarded — the user is
   * asked, and the default framing is "count it".
   */
  async findRecoverable(): Promise<Session | null> {
    const open = await this.db.sessions.findOpen();
    if (!open) return null;
    return open;
  }

  async resolveRecovery(sessionId: string, keep: boolean): Promise<void> {
    const session = await this.db.sessions.get(sessionId);
    if (!session || session.endedAt) return;

    session.endedAt = this.db.clock.now();
    if (keep) {
      session.outcome = 'recovered';
      // activeMs was checkpointed to the journal; anything since then is unknowable, so we
      // keep what was recorded rather than inventing time.
      await this.db.sessions.save(session);
      const thread = await this.db.threads.get(session.threadId);
      if (thread) {
        await this.db.threads.save({
          ...thread,
          totalFocusMs: thread.totalFocusMs + session.activeMs,
          sessionCount: thread.sessionCount + 1,
        });
      }
      this.events.onDaysTouched([session.localDate]);
    } else {
      session.outcome = 'abandoned';
      session.activeMs = 0;
      await this.db.sessions.save(session);
    }
    await this.db.settings.update({ lastOpenSessionId: undefined });
    await this.db.store.flush();
  }

  // ---------------------------------------------------------------- internals

  private accumulate(running: RunningSession): void {
    const now = performance.now();
    running.session.activeMs += Math.max(0, now - running.markedAt);
    running.markedAt = now;
  }

  private remaining(session: Session): number {
    return session.plannedMs + session.grantedMs - session.activeMs;
  }

  private async describe(running: RunningSession): Promise<SessionState> {
    const thread = await this.db.threads.get(running.session.threadId);
    const next = thread ? nextAction(thread.steps) : null;
    return {
      session: { ...running.session },
      threadTitle: thread?.title ?? 'Untitled',
      nextAction: next?.text ?? null,
      remainingMs: Math.max(0, this.remaining(running.session)),
      paused: running.paused,
    };
  }

  private startTicker(): void {
    this.stopTicker();
    this.ticker = setInterval(() => void this.tick(), HUD_TICK_MS);
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    this.sinceCheckpoint = 0;
  }

  private async tick(): Promise<void> {
    const running = this.running;
    if (!running) return;
    if (!running.paused) this.accumulate(running);

    const { session } = running;
    const remainingMs = Math.max(0, this.remaining(session));
    const total = session.plannedMs + session.grantedMs;
    this.events.onTick({
      sessionId: session.id,
      remainingMs,
      activeMs: session.activeMs,
      paused: running.paused,
      progress: total > 0 ? Math.min(1, session.activeMs / total) : 0,
    });

    // Ticks go to the journal only; shards flush on debounce and lifecycle events, so a 512KB
    // shard is never rewritten once a second (§4.6 #7).
    this.sinceCheckpoint += HUD_TICK_MS;
    if (this.sinceCheckpoint >= SESSION_CHECKPOINT_MS) {
      this.sinceCheckpoint = 0;
      await this.persist();
    }

    if (remainingMs <= 0) await this.end('completed');
  }

  private async persist(): Promise<void> {
    if (!this.running) return;
    await this.db.sessions.save({ ...this.running.session });
  }
}
