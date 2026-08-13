/**
 * The 25/5 cycle's manual advance (§4).
 *
 * A stage never auto-starts. When a focus block finishes, the timer parks on the next stage —
 * showing "Break, 5:00, Resume" — and waits. Same when the break runs out: it parks on the next
 * focus block. Auto-starting the next stage is how a Pomodoro app quietly becomes a thing that
 * runs without you, and then a thing you stop trusting.
 *
 * A break is deliberately *not* a Session record. Nothing here reaches analytics: breaks are not
 * focus, and the dashboard must never learn about them.
 */
import { BREAK_MS, HUD_TICK_MS } from '@shared/constants.js';
import type { StageState, StageTick } from '@shared/ipc/channels.js';

export interface StageEvents {
  onChanged: (state: StageState | null) => void;
  onTick: (tick: StageTick) => void;
  /** A stage just ran out: pop the HUD, chime, notify. */
  onStageEnded: (finished: 'focus' | 'break', next: 'focus' | 'break') => void;
  /** Resuming a focus stage starts a real session — that path stays in SessionService. */
  onStartFocus: (threadId: string) => Promise<void>;
}

export class StageController {
  private state: StageState | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly events: StageEvents,
    private readonly focusMs: () => number,
  ) {}

  current(): StageState | null {
    return this.state ? { ...this.state } : null;
  }

  /** Called when a focus block completes: park on the break, paused, waiting for Resume. */
  awaitBreak(threadId: string, threadTitle: string): void {
    this.park({ kind: 'break', threadId, threadTitle, plannedMs: BREAK_MS });
    this.events.onStageEnded('focus', 'break');
  }

  /** Any new session starting supersedes whatever the cycle was waiting on. */
  clear(): void {
    this.stopTicker();
    if (!this.state) return;
    this.state = null;
    this.events.onChanged(null);
  }

  async resume(): Promise<StageState | null> {
    const state = this.state;
    if (!state) return null;

    if (state.kind === 'focus') {
      // The focus stage has no clock of its own — resuming it *is* starting the session.
      const { threadId } = state;
      this.clear();
      await this.events.onStartFocus(threadId);
      return null;
    }

    this.state = { ...state, running: true };
    this.startTicker();
    this.events.onChanged(this.current());
    return this.current();
  }

  /** Skip the break and go straight to the next focus block, still waiting for Resume. */
  async skip(): Promise<StageState | null> {
    const state = this.state;
    if (!state) return null;
    if (state.kind === 'focus') return this.resume();
    this.finishBreak();
    return this.current();
  }

  stop(): void {
    this.clear();
  }

  /** Park during a break: the same two minutes back, applied to the break's clock. */
  grant(ms: number): boolean {
    const state = this.state;
    if (!state || state.kind !== 'break') return false;
    this.state = {
      ...state,
      plannedMs: state.plannedMs + ms,
      remainingMs: state.remainingMs + ms,
    };
    this.events.onChanged(this.current());
    return true;
  }

  destroy(): void {
    this.stopTicker();
    this.state = null;
  }

  // ---------------------------------------------------------------- internals

  private park(next: Omit<StageState, 'remainingMs' | 'running'>): void {
    this.stopTicker();
    this.state = { ...next, remainingMs: next.plannedMs, running: false };
    this.events.onChanged(this.current());
  }

  private finishBreak(): void {
    const state = this.state;
    if (!state) return;
    this.park({
      kind: 'focus',
      threadId: state.threadId,
      threadTitle: state.threadTitle,
      plannedMs: this.focusMs(),
    });
    this.events.onStageEnded('break', 'focus');
  }

  private startTicker(): void {
    this.stopTicker();
    this.ticker = setInterval(() => this.tick(), HUD_TICK_MS);
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  private tick(): void {
    const state = this.state;
    if (!state || !state.running) return;

    const remainingMs = Math.max(0, state.remainingMs - HUD_TICK_MS);
    this.state = { ...state, remainingMs };
    this.events.onTick({
      remainingMs,
      progress: state.plannedMs > 0 ? 1 - remainingMs / state.plannedMs : 1,
    });

    if (remainingMs <= 0) this.finishBreak();
  }
}
