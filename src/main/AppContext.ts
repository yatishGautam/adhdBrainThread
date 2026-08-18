/**
 * The main process is the single owner of all state and the only process that touches disk.
 * AppContext wires storage → services → windows → IPC broadcasts, and is the one object every
 * IPC handler closes over.
 */
import { BrowserWindow, Notification, app, nativeTheme } from "electron";
import type { Thread, Day } from "@shared/domain.js";
import type { Settings } from "@shared/domain.js";
import { formatDuration } from "@shared/format.js";
import type {
	Events,
	RecoveryOffer,
	StorageBanner,
} from "@shared/ipc/channels.js";
import { Database } from "./storage/Database.js";
import { AnalyticsService } from "./services/AnalyticsService.js";
import { AuthService } from "./services/AuthService.js";
import { SessionService } from "./services/SessionService.js";
import { StageController } from "./services/StageController.js";
import { CelebrationOrchestrator } from "./services/CelebrationOrchestrator.js";
import { CelebrationOverlay } from "./windows/celebrationWindow.js";
import { createHudWindow, defaultHudPosition } from "./windows/hudWindow.js";
import { createMainWindow } from "./windows/mainWindow.js";
import {
	createTray,
	updateTray,
	markQuitting,
	type TrayState,
} from "./windows/tray.js";

let microTickVariant = 0;

export class AppContext {
	db!: Database;
	sessions!: SessionService;
	stages!: StageController;
	analytics!: AnalyticsService;
	celebrations!: CelebrationOrchestrator;
	auth!: AuthService;
	main: BrowserWindow | null = null;
	hud: BrowserWindow | null = null;
	private overlay!: CelebrationOverlay;
	private tray: ReturnType<typeof createTray> | null = null;
	private mainReady = false;
	private pendingRecovery: RecoveryOffer | null = null;

	static async create(root: string): Promise<AppContext> {
		const ctx = new AppContext();
		ctx.db = await Database.open(root, {
			onUnreadable: (file, reason) => {
				console.warn("[storage]", file, reason);
				ctx.broadcast("storage:banner", {
					message: `Part of a data file could not be read (${reason}). Everything else loaded normally.`,
					files: [file],
				} satisfies StorageBanner);
			},
		});

		ctx.analytics = new AnalyticsService(ctx.db, () =>
			ctx.broadcast("analytics:changed", undefined),
		);
		await ctx.analytics.load();

		// Reads the account file only. The token is checked with the server later, from
		// `revalidate()`, once there is a window to tell about the result.
		ctx.auth = new AuthService(root, (state) => ctx.broadcast("auth:changed", state));
		await ctx.auth.load();

		ctx.sessions = new SessionService(ctx.db, {
			onTick: (tick) => ctx.broadcast("session:tick", tick),
			onChanged: (state) => {
				ctx.broadcast("session:changed", state);
				ctx.refreshTray();
			},
			onToast: (text) => ctx.broadcast("hud:toast", { text }),
			onDaysTouched: (dates) => void ctx.analytics.touchDays(dates),
			onStarted: () => ctx.stages.clear(),
			onCompleted: (session, threadTitle) => {
				// Fired from inside end(); a failure here must be visible, not an unhandled
				// rejection that silently strands the cycle.
				ctx.onFocusCompleted(
					session.threadId,
					threadTitle,
					session.activeMs,
				).catch((error: unknown) => console.error("[cycle]", error));
			},
		});

		ctx.stages = new StageController(
			{
				onChanged: (state) => ctx.broadcast("stage:changed", state),
				onTick: (tick) => ctx.broadcast("stage:tick", tick),
				onStageEnded: (finished, next) => ctx.announceStage(finished, next),
				onStartFocus: async (threadId) => {
					await ctx.sessions.start(threadId);
				},
			},
			() => ctx.db.settings.get().defaultSessionMs,
		);

		ctx.overlay = new CelebrationOverlay();
		ctx.celebrations = new CelebrationOrchestrator(
			ctx.db,
			ctx.overlay,
			() => ctx.analytics.summary("day", ctx.db.clock.today()),
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
		this.main.on("closed", () => {
			this.main = null;
		});
	}

	openHud(): void {
		if (this.hud && !this.hud.isDestroyed()) {
			this.hud.show();
			return;
		}
		const saved = this.db.settings.get().hudBounds;
		this.hud = createHudWindow(saved, (position) => {
			void this.db.settings.update({ hudBounds: position });
		});
		this.hud.on("closed", () => {
			this.hud = null;
		});
	}

	resetHud(): void {
		if (this.hud && !this.hud.isDestroyed()) {
			this.hud.close();
			this.hud = null;
		}
		this.hud = createHudWindow(defaultHudPosition(), (position) => {
			void this.db.settings.update({ hudBounds: position });
		});
		this.hud.on("closed", () => {
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
			// Quit must quit. Closing the main window here left the app resident forever: the
			// tray menu is rebuilt by every refresh, so this hook — not setupTray's — is the one
			// the user's Quit click actually ran.
			onQuit: () => {
				markQuitting();
				app.quit();
			},
		});
	}

	// ------------------------------------------------------------- the 25/5 cycle

	/**
	 * A focus block ran to the end: log it to today, mark it with the short celebration, then
	 * park on the break and wait. A thread that was completed *by* this session is skipped —
	 * it gets the full celebration instead, and there is nothing left to take a break from.
	 */
	private async onFocusCompleted(
		threadId: string,
		threadTitle: string,
		activeMs: number,
	): Promise<void> {
		const thread = await this.db.threads.get(threadId);
		if (thread?.status === "done") return;

		// The break is parked first, before anything that can be slow or fail. It is what the
		// user is staring at the HUD waiting for; a celebration that hangs must not be able to
		// swallow the next stage of the cycle.
		this.stages.awaitBreak(threadId, threadTitle);

		const day = await this.db.days.addLogEntry(
			`Focus block on ${threadTitle} — ${formatDuration(activeMs)}`,
			"focus",
		);
		this.broadcastDay(day);
		await this.celebrations.celebrateSession(threadTitle, activeMs);
	}

	/** Stage end: the HUD pops, glows and shakes, and the OS says so too (§4). */
	private announceStage(finished: "focus" | "break", next: "focus" | "break"): void {
		this.showHudNow();
		this.broadcast("hud:attention", { stage: finished });

		if (!Notification.isSupported()) return;
		const body =
			next === "break"
				? "Five minutes. Press Resume when you want to start it."
				: "Ready when you are — press Resume to start the next block.";
		new Notification({
			title: finished === "focus" ? "Focus block done" : "Break over",
			body,
			silent: true,
		}).show();
	}

	/** Brings the HUD back into view without stealing keyboard focus from what you were doing. */
	private showHudNow(): void {
		this.openHud();
		if (this.hud && !this.hud.isDestroyed()) this.hud.showInactive();
	}

	// -------------------------------------------------------------- lifecycle

	onMainReady(): void {
		this.mainReady = true;
		if (this.pendingRecovery)
			this.broadcast("session:recovery", this.pendingRecovery);
	}

	async checkRecovery(): Promise<void> {
		const open = await this.sessions.findRecoverable();
		if (!open) return;
		const thread = await this.db.threads.get(open.threadId);
		const offer: RecoveryOffer = {
			sessionId: open.id,
			threadTitle: thread?.title ?? "Untitled",
			activeMs: open.activeMs,
		};
		this.pendingRecovery = offer;
		if (this.mainReady) this.broadcast("session:recovery", offer);
	}

	async shutdown(): Promise<void> {
		this.stages.destroy();
		if (this.sessions.isRunning()) await this.sessions.end("ended_early");
		await this.analytics.flush();
		await this.db.close();
		this.overlay.destroy();
	}

	microTick(): void {
		microTickVariant = (microTickVariant + 1) % 3;
		this.broadcast("micro:tick", { variant: microTickVariant });
	}

	// --------------------------------------------------------------- broadcast

	broadcastThreads(): void {
		void this.db.threads
			.list()
			.then((threads: Thread[]) => this.broadcast("threads:changed", threads));
	}

	broadcastDay(day: Day): void {
		this.broadcast("day:changed", day);
	}

	broadcastSettings(settings: Settings): void {
		this.broadcast("settings:changed", settings);
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
