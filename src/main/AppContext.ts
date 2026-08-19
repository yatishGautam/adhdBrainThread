/**
 * The main process is the single owner of all state and the only process that touches disk.
 * AppContext wires storage → services → windows → IPC broadcasts, and is the one object every
 * IPC handler closes over.
 */
import { BrowserWindow, Notification, app, nativeTheme } from "electron";
import type { Thread, Day, Goal } from "@shared/domain.js";
import type { Settings } from "@shared/domain.js";
import { formatDuration } from "@shared/format.js";
import type {
	Events,
	RecoveryOffer,
	StorageBanner,
} from "@shared/ipc/channels.js";
import type { PlannerState } from "@shared/ipc/channels.js";
import { Database } from "./storage/Database.js";
import { AnalyticsService } from "./services/AnalyticsService.js";
import { ApiKeyStore } from "./services/ApiKeyStore.js";
import { PlannerService } from "./services/PlannerService.js";
import { AuthService } from "./services/AuthService.js";
import { SyncEngine, type SyncStatus } from "./sync/SyncEngine.js";
import { SyncState } from "./sync/SyncState.js";
import { SessionService } from "./services/SessionService.js";
import { StageController } from "./services/StageController.js";
import { CelebrationOrchestrator } from "./services/CelebrationOrchestrator.js";
import { CelebrationOverlay } from "./windows/celebrationWindow.js";
import { createHudWindow, defaultHudPosition } from "./windows/hudWindow.js";
import { createMainWindow } from "./windows/mainWindow.js";
import {
	createTray,
	updateTray,
	updateTrayCountdown,
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
	planner!: PlannerService;
	apiKeys!: ApiKeyStore;
	sync!: SyncEngine;
	syncState!: SyncState;
	main: BrowserWindow | null = null;
	hud: BrowserWindow | null = null;
	private overlay!: CelebrationOverlay;
	private tray: ReturnType<typeof createTray> | null = null;
	private mainReady = false;
	private pendingRecovery: RecoveryOffer | null = null;

	/**
	 * `projectRoot` is only ever set in development, and only so a `.env` next to the source
	 * tree is picked up — a packaged app has no source tree and passes nothing.
	 */
	static async create(root: string, projectRoot?: string): Promise<AppContext> {
		const ctx = new AppContext();

		// Loaded before the store opens, because the store's very first write has to be able to
		// land in the queue — there is no "before sync was watching" window.
		ctx.syncState = new SyncState(root);
		await ctx.syncState.load();

		ctx.db = await Database.open(root, {
			onUnreadable: (file, reason) => {
				console.warn("[storage]", file, reason);
				ctx.broadcast("storage:banner", {
					message: `Part of a data file could not be read (${reason}). Everything else loaded normally.`,
					files: [file],
				} satisfies StorageBanner);
			},
			onWrite: (collection, key) => {
				ctx.syncState.mark(collection, key);
				ctx.sync?.schedule();
			},
		});

		ctx.analytics = new AnalyticsService(ctx.db, () =>
			ctx.broadcast("analytics:changed", undefined),
		);
		await ctx.analytics.load();

		// Reads the account file only. The token is checked with the server later, from
		// `revalidate()`, once there is a window to tell about the result.
		ctx.auth = new AuthService(root, (state) => {
			ctx.broadcast("auth:changed", state);
			// Signing in is the moment to go and find what the phone has been writing.
			if (state.account) void ctx.sync?.sync().then((outcome) => ctx.afterSync(outcome));
			else ctx.syncState.reset();
		});
		await ctx.auth.load();

		ctx.sync = new SyncEngine(ctx.db, ctx.auth, ctx.syncState, (status) =>
			ctx.broadcast("sync:changed", status),
		);

		ctx.sessions = new SessionService(ctx.db, {
			onTick: (tick) => {
				ctx.broadcast("session:tick", tick);
				// The menu bar used to be written only when the session *changed*, so it showed
				// whatever the clock said when you pressed start and then sat there, stale, for
				// twenty-five minutes.
				ctx.tickTray(tick.remainingMs, tick.paused);
			},
			onChanged: (state) => {
				ctx.broadcast("session:changed", state);
				ctx.refreshTray();
				if (state === null) {
					ctx.sync?.suspendPush(false);
					ctx.syncNow();
				}
			},
			onToast: (text) => ctx.broadcast("hud:toast", { text }),
			onDaysTouched: (dates) => void ctx.analytics.touchDays(dates),
			onStarted: () => {
				ctx.stages.clear();
				// A session ticks every second. Pushing each tick would hammer the API and the
				// battery for nothing — it goes up once, when it ends.
				ctx.sync?.suspendPush(true);
			},
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

		// The planner holds no state of its own and starts nothing: it is a service the user
		// invokes, so loading it is only finding out whether a key exists yet.
		ctx.apiKeys = new ApiKeyStore(root);
		await ctx.apiKeys.load(projectRoot);
		ctx.planner = new PlannerService(ctx.db, ctx.apiKeys);

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
			onFocus: () => this.syncNow(),
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

	/** The once-a-second path. Title only, and only when the minute has actually turned over. */
	private tickTray(remainingMs: number, paused: boolean): void {
		if (!this.tray || this.tray.isDestroyed()) return;
		updateTrayCountdown(this.tray, {
			running: true,
			paused,
			threadTitle: null,
			remainingMs,
		});
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

	/**
	 * A pull that changed anything has to reach the windows, or the board sits there showing
	 * what the laptop knew before the phone told it otherwise.
	 */
	afterSync(outcome: { pulled: number } | null): void {
		if (!outcome || outcome.pulled === 0) return;
		this.broadcastThreads();
		this.broadcast("carry:changed", undefined);
		this.broadcast("analytics:changed", undefined);
		void this.db.days.today().then((day) => {
			if (day) this.broadcastDay(day);
		});
		void this.analytics.rebuild();
	}

	/** Foreground, sign-in, session end: the three moments worth a round trip immediately. */
	syncNow(): void {
		void this.sync?.sync().then((outcome) => this.afterSync(outcome));
	}

	async shutdown(): Promise<void> {
		this.stages.destroy();
		this.sync.stop();
		await this.syncState.flush();
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

	/**
	 * Every goal write funnels through here, so the handler that made the change and every
	 * window that did not both end up looking at the same list.
	 */
	async broadcastGoals(weekKey: string): Promise<Goal[]> {
		const goals = await this.db.goals.list(weekKey);
		this.broadcast("goals:changed", { weekKey, goals });
		return goals;
	}

	async plannerState(): Promise<PlannerState> {
		const month = this.db.clock.today().slice(0, 7);
		return {
			key: this.planner.keyState(),
			spend: await this.db.plans.spend(month),
			model: this.db.settings.get().plannerModel,
		};
	}

	syncStatus(): SyncStatus {
		return this.sync.status();
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
