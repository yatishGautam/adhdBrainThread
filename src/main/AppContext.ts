/**
 * The main process is the single owner of all state and the only process that touches disk.
 * AppContext wires storage → services → windows → IPC broadcasts, and is the one object every
 * IPC handler closes over.
 */
import { BrowserWindow, nativeTheme } from 'electron';
import type { Thread, Day } from '@shared/domain.js';
import type { Settings } from '@shared/domain.js';
import type { Events, RecoveryOffer, StorageBanner } from '@shared/ipc/channels.js';
import { Database } from './storage/Database.js';
import { AnalyticsService } from './services/AnalyticsService.js';
import { SessionService } from './services/SessionService.js';
import { CelebrationOrchestrator } from './services/CelebrationOrchestrator.js';
import { CelebrationOverlay } from './windows/celebrationWindow.js';
import { createHudWindow, type HudPosition } from './windows/hudWindow.js';
import { createMainWindow } from './windows/mainWindow.js';
import { createTray, updateTray, markQuitting, type TrayState } from './windows/tray.js';

let microTickVariant = 0;

export class AppContext {
  db!: Database;
  sessions!: SessionService;
  analytics!: AnalyticsService;
  celebrations!: CelebrationOrchestrator;
  main: BrowserWindow | null = null;
  hud: BrowserWindow | null = null;
  private overlay!: CelebrationOverlay;
  private tray: ReturnType<typeof createTray> | null = null;
  private mainReady = false;
  private pendingRecovery: RecoveryOffer | null = null;

  static async create(root: string): Promise<AppContext> {
    const ctx = new AppContext();
    ctx.db = await Database.open(root, {
      onQuarantine: (file, movedTo) => {
        ctx.broadcast('storage:banner', {
          message: `A data file could not be read and was set aside: ${file}`,
          files: [movedTo],
        } satisfies StorageBanner);
      },
      onWarning: (message) => console.warn('[storage]', message),
    });

    ctx.analytics = new AnalyticsService(ctx.db, () => ctx.broadcast('analytics:changed', undefined));
    await ctx.analytics.load();

    ctx.sessions = new SessionService(ctx.db, {
      onTick: (tick) => ctx.broadcast('session:tick', tick),
      onChanged: (state) => {
        ctx.broadcast('session:changed', state);
        ctx.refreshTray();
      },
      onToast: (text) => ctx.broadcast('hud:toast', { text }),
      onDaysTouched: (dates) => void ctx.analytics.touchDays(dates),
    });

    ctx.overlay = new CelebrationOverlay(() => ctx.hud);
    ctx.celebrations = new CelebrationOrchestrator(
      ctx.db,
      ctx.overlay,
      () => ctx.analytics.summary('day', ctx.db.clock.today()),
      () => nativeTheme.shouldUseHighContrastColors || preferReducedMotion(),
    );

    await ctx.db.threads.archiveStale();
    return ctx;
  }

  // -------------------------------------------------------------- windows

  openMainWindow(): void {
    if (this.main && !this.main.isDestroyed()) {
      this.main.show();
      return;
    }
    this.main = createMainWindow({
      onHide: () => this.refreshTray(),
      onBlur: () => void this.db.store.flush(),
    });
    this.main.on('closed', () => {
      this.main = null;
    });
  }

  openHud(): void {
    if (this.hud && !this.hud.isDestroyed()) return;
    const saved = this.db.settings.get().hudBounds;
    this.hud = createHudWindow(saved, (position) => {
      void this.db.settings.update({ hudBounds: position });
    });
    this.hud.on('closed', () => {
      this.hud = null;
    });
  }

  closeHud(): void {
    if (this.hud && !this.hud.isDestroyed()) this.hud.close();
    this.hud = null;
  }

  setupTray(onQuit: () => void): void {
    this.tray = createTray({
      onShow: () => this.openMainWindow(),
      onPauseResume: () => {
        void (async () => {
          const state = await this.sessions.state();
          if (!state) return;
          if (state.paused) await this.sessions.resume();
          else await this.sessions.pause();
        })();
      },
      onEnd: () => void this.sessions.end(),
      onQuit: () => {
        markQuitting();
        onQuit();
      },
    });
    this.refreshTray();
  }

  private async refreshTray(): Promise<void> {
    if (!this.tray || this.tray.isDestroyed()) return;
    const state = await this.sessions.state();
    const trayState: TrayState = {
      running: state !== null,
      paused: state?.paused ?? false,
      threadTitle: state?.threadTitle ?? null,
      remainingMs: state?.remainingMs ?? 0,
    };
    updateTray(this.tray, trayState, {
      onShow: () => this.openMainWindow(),
      onPauseResume: () => {
        void (async () => {
          const current = await this.sessions.state();
          if (!current) return;
          if (current.paused) await this.sessions.resume();
          else await this.sessions.pause();
        })();
      },
      onEnd: () => void this.sessions.end(),
      onQuit: () => {
        markQuitting();
        this.main?.close();
      },
    });
  }

  // -------------------------------------------------------------- lifecycle

  onMainReady(): void {
    this.mainReady = true;
    if (this.pendingRecovery) this.broadcast('session:recovery', this.pendingRecovery);
  }

  async checkRecovery(): Promise<void> {
    const open = await this.sessions.findRecoverable();
    if (!open) return;
    const thread = await this.db.threads.get(open.threadId);
    const offer: RecoveryOffer = {
      sessionId: open.id,
      threadTitle: thread?.title ?? 'Untitled',
      activeMs: open.activeMs,
    };
    this.pendingRecovery = offer;
    if (this.mainReady) this.broadcast('session:recovery', offer);
  }

  async shutdown(): Promise<void> {
    if (this.sessions.isRunning()) await this.sessions.end('ended_early');
    await this.analytics.flush();
    await this.db.close();
    this.overlay.destroy();
  }

  microTick(): void {
    microTickVariant = (microTickVariant + 1) % 3;
    this.broadcast('micro:tick', { variant: microTickVariant });
  }

  // --------------------------------------------------------------- broadcast

  broadcastThreads(): void {
    void this.db.threads.list().then((threads: Thread[]) => this.broadcast('threads:changed', threads));
  }

  broadcastDay(day: Day): void {
    this.broadcast('day:changed', day);
  }

  broadcastSettings(settings: Settings): void {
    this.broadcast('settings:changed', settings);
  }

  broadcast<K extends keyof Events>(channel: K, payload: Events[K]): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue;
      window.webContents.send(channel, payload);
    }
  }
}

function preferReducedMotion(): boolean {
  // nativeTheme has no direct reduced-motion flag on every platform; renderers also check
  // `prefers-reduced-motion` themselves and this is only used to pick the initial pack pool.
  return false;
}
