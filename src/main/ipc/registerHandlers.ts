/**
 * Every `ipcMain.handle` the app has, in one file, keyed by the channel names in
 * `@shared/ipc/channels.ts`. If a channel is missing here, `preload`'s typed `invoke` still
 * compiles — this is the one place a mismatch would only show up at runtime, so channel names
 * are typed against `Requests` to catch typos early.
 */
import { app, ipcMain, shell } from "electron";
import path from "node:path";
import type { Requests } from "@shared/ipc/channels.js";
import { ACTIVE_THREAD_CAP } from "@shared/constants.js";
import { MIN_PASSWORD_LENGTH } from "@shared/auth.js";
import type { AppContext } from "../AppContext.js";
import { openLink } from "../services/openLink.js";
import { launchesAtStartup, setLaunchAtStartup } from "../services/startup.js";
import type { PlanShell } from "../storage/repositories/planRepo.js";
import type { Settings } from "@shared/domain.js";
import { applyShift } from "@shared/dayRun.js";

/** The wall clock in the user's timezone, as minutes from midnight. */
function minutesNow(timezone: string): number {
	const formatted = new Intl.DateTimeFormat("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
		timeZone: timezone,
	}).format(new Date());
	const [hour = 0, minute = 0] = formatted.split(":").map(Number);
	return hour * 60 + minute;
}

/** The day frame a hand-made plan starts from, when the day was never planned at all. */
function planShell(settings: Settings): PlanShell {
	return {
		wakeTime: settings.wakeTime,
		startTime: settings.dayStartTime,
		endTime: settings.dayEndTime,
	};
}

type Handler<K extends keyof Requests> = (
	ctx: AppContext,
	payload: Requests[K][0],
) => Promise<Requests[K][1]> | Requests[K][1];

function on<K extends keyof Requests>(
	channel: K,
	handler: Handler<K>,
	ctx: AppContext,
): void {
	ipcMain.handle(channel, (_event, payload: Requests[K][0]) =>
		handler(ctx, payload),
	);
}

export function registerHandlers(ctx: AppContext): void {
	const { db, sessions, analytics, celebrations } = ctx;

	// ------------------------------------------------------------------ threads

	on("threads:list", async () => db.threads.list(), ctx);
	on("threads:get", async (_c, { id }) => db.threads.get(id), ctx);
	on(
		"threads:create",
		async (_c, { title, notes }) => {
			const board = await db.threads.activeList();
			if (board.length >= ACTIVE_THREAD_CAP) {
				throw new Error(
					`At most ${ACTIVE_THREAD_CAP} active threads. Finish one, or move one to the dormant zone.`,
				);
			}
			const thread = await db.threads.create(title, notes);
			ctx.broadcastThreads();
			return thread;
		},
		ctx,
	);
	on(
		"threads:update",
		async (_c, { id, patch }) => {
			const thread = await ctx.db.threads.get(id);
			if (!thread) throw new Error("thread not found");
			const saved = await db.threads.save({ ...thread, ...patch });
			ctx.broadcastThreads();
			return saved;
		},
		ctx,
	);
	on(
		"threads:setStatus",
		async (_c, { id, status, waitingOn }) => {
			// The cap is on the active list, not on "in progress" specifically (§2): done and
			// dormant threads are free.
			if (status !== "done" && status !== "dormant") {
				const board = await db.threads.activeList();
				if (board.length >= ACTIVE_THREAD_CAP && !board.some((t) => t.id === id)) {
					throw new Error(
						`At most ${ACTIVE_THREAD_CAP} active threads. Finish one, or move one to the dormant zone.`,
					);
				}
			}
			const thread = await db.threads.setStatus(id, status, waitingOn);
			if (status === "done") {
				await onThreadCompleted(ctx, thread.id);
			} else if (sessions.currentThreadId() === id) {
				await sessions.end("ended_early");
			}
			ctx.broadcastThreads();
			return thread;
		},
		ctx,
	);
	on(
		"threads:remove",
		async (_c, { id }) => {
			if (sessions.currentThreadId() === id) await sessions.end("ended_early");
			await db.threads.remove(id);
			ctx.broadcastThreads();
		},
		ctx,
	);
	on("threads:done", async (_c, query) => db.threads.donePage(query), ctx);
	on(
		"threads:reorder",
		async (_c, { id, toIndex, status }) => {
			// Dragging out of the dormant zone counts against the cap just like a status change.
			if (status && status !== "dormant") {
				const board = await db.threads.activeList();
				if (board.length >= ACTIVE_THREAD_CAP && !board.some((t) => t.id === id)) {
					throw new Error(
						`At most ${ACTIVE_THREAD_CAP} active threads. Finish one, or move one to the dormant zone.`,
					);
				}
			}
			const written = await db.threads.reorderOnBoard(id, toIndex, status);
			ctx.broadcastThreads();
			return written;
		},
		ctx,
	);

	// -------------------------------------------------------------------- goals

	on("goals:list", async (_c, { weekKey }) => db.goals.list(weekKey), ctx);
	on("goals:weeks", async () => db.goals.weeks(), ctx);
	on(
		"goals:add",
		async (_c, { title, weekKey }) => {
			const trimmed = title.trim();
			if (!trimmed) throw new Error("A goal needs a name.");
			const goal = await db.goals.add(trimmed, weekKey);
			return ctx.broadcastGoals(goal.weekKey);
		},
		ctx,
	);
	on(
		"goals:update",
		async (_c, { id, patch }) => {
			const goal = await db.goals.update(id, patch);
			return ctx.broadcastGoals(goal.weekKey);
		},
		ctx,
	);
	on(
		"goals:toggle",
		async (_c, { id }) => {
			const goal = await db.goals.toggle(id);
			return ctx.broadcastGoals(goal.weekKey);
		},
		ctx,
	);
	on(
		"goals:remove",
		async (_c, { id }) => {
			const goal = await db.goals.get(id);
			await db.goals.remove(id);
			return ctx.broadcastGoals(goal?.weekKey ?? db.goals.currentWeek());
		},
		ctx,
	);
	on(
		"goals:reorder",
		async (_c, { id, toIndex }) => {
			const goal = await db.goals.get(id);
			await db.goals.reorder(id, toIndex);
			return ctx.broadcastGoals(goal?.weekKey ?? db.goals.currentWeek());
		},
		ctx,
	);
	on(
		"goals:carryOver",
		async (_c, { id, toWeek }) => {
			const before = await db.goals.get(id);
			const goal = await db.goals.carryOver(id, toWeek);
			// Both weeks changed: the goal left one list and joined another, and a renderer
			// looking at the week it left has to hear about it too.
			if (before && before.weekKey !== goal.weekKey) await ctx.broadcastGoals(before.weekKey);
			return ctx.broadcastGoals(goal.weekKey);
		},
		ctx,
	);

	// ------------------------------------------------------------------ planner

	on("planner:state", async () => ctx.plannerState(), ctx);
	on("planner:get", async (_c, { localDate }) => db.plans.get(localDate), ctx);
	on(
		"planner:week",
		async (_c, { weekKey }) => ({
			week: await db.plans.getWeek(weekKey),
			days: await db.plans.listWeekDays(weekKey),
		}),
		ctx,
	);
	on("planner:generate", async (_c, request) => ctx.planner.generate(request), ctx);
	on(
		"planner:promoteBlock",
		async (_c, { localDate, blockId }) => {
			const plan = await db.plans.get(localDate);
			if (!plan) throw new Error("There is no plan for that day.");
			const block = plan.blocks.find((candidate) => candidate.id === blockId);
			if (!block) throw new Error("That block is no longer in the plan.");

			// Already linked: hand back what exists rather than creating a duplicate thread for
			// a block the user double-clicked.
			if (block.threadId) {
				const existing = await db.threads.get(block.threadId);
				if (existing) return { plan, thread: existing };
			}

			// The cap is enforced here rather than in the repository, so the message the user
			// sees is the same one the board gives them.
			const board = await db.threads.activeList();
			if (board.length >= ACTIVE_THREAD_CAP) {
				throw new Error(
					`At most ${ACTIVE_THREAD_CAP} active threads. Finish one, or move one to the dormant zone.`,
				);
			}

			// The block's reason becomes the thread's notes — it is the one sentence explaining
			// why this is worth doing, and losing it at exactly the moment the work becomes real
			// would be the wrong trade.
			const thread = await db.threads.create(block.title, block.why ?? "");
			const linked = await db.plans.linkBlock(localDate, blockId, thread.id);

			ctx.broadcast("planner:changed", { localDate, plan: linked });
			ctx.broadcastThreads();
			return { plan: linked, thread };
		},
		ctx,
	);
	on(
		"planner:clear",
		async (_c, { localDate }) => {
			await db.plans.remove(localDate);
			ctx.broadcast("planner:changed", { localDate, plan: null });
		},
		ctx,
	);
	on(
		"planner:editBlock",
		async (_c, { localDate, block }) => {
			const plan = await db.plans.editBlock(localDate, block, planShell(db.settings.get()));
			ctx.broadcast("planner:changed", { localDate, plan });
			return plan;
		},
		ctx,
	);
	on(
		"planner:deleteBlock",
		async (_c, { localDate, blockId }) => {
			const plan = await db.plans.deleteBlock(localDate, blockId);
			ctx.broadcast("planner:changed", { localDate, plan });
			return plan;
		},
		ctx,
	);
	on(
		"planner:moveBlock",
		async (_c, { fromDate, toDate, blockId }) => {
			const moved = await db.plans.moveBlock(
				fromDate,
				toDate,
				blockId,
				planShell(db.settings.get()),
			);
			// Both days changed; a renderer looking at either has to hear about it.
			ctx.broadcast("planner:changed", { localDate: fromDate, plan: moved.from });
			ctx.broadcast("planner:changed", { localDate: toDate, plan: moved.to });
			return moved;
		},
		ctx,
	);
	on("planner:generateDay", async (_c, request) => ctx.planner.generateDay(request), ctx);
	on("insight:get", async (_c, { periodKey }) => db.insights.get(periodKey), ctx);
	on("insight:generate", async (_c, { scope }) => ctx.planner.generateInsight(scope), ctx);

	// ------------------------------------------------------------------ day run

	on("dayrun:get", async (_c, { localDate }) => db.dayRuns.get(localDate), ctx);
	on(
		"dayrun:start",
		async (_c, { localDate }) => {
			const run = await db.dayRuns.start(localDate);
			ctx.broadcast("dayrun:changed", { localDate, run });
			return run;
		},
		ctx,
	);
	on(
		"dayrun:shift",
		async (_c, { localDate, deltaMs }) => {
			const plan = await db.plans.get(localDate);
			if (!plan) throw new Error("There is no plan to shift.");
			const run = await db.dayRuns.get(localDate);
			if (!run) throw new Error("The day has not been started.");
			const shifted = await db.dayRuns.save(
				applyShift(plan, run, deltaMs, minutesNow(db.settings.get().timezone)),
			);
			ctx.broadcast("dayrun:changed", { localDate, run: shifted });
			return shifted;
		},
		ctx,
	);
	on(
		"dayrun:skip",
		async (_c, { localDate, blockId }) => {
			const run = await db.dayRuns.skip(localDate, blockId);
			ctx.broadcast("dayrun:changed", { localDate, run });
			return run;
		},
		ctx,
	);
	on(
		"dayrun:end",
		async (_c, { localDate }) => {
			const run = await db.dayRuns.end(localDate);
			ctx.broadcast("dayrun:changed", { localDate, run });
			return run;
		},
		ctx,
	);

	// -------------------------------------------------------------------- steps

	on(
		"steps:add",
		async (_c, { threadId, text, afterStepId }) => {
			const thread = await db.threads.addStep(threadId, text, afterStepId);
			ctx.broadcastThreads();
			return thread;
		},
		ctx,
	);
	on(
		"steps:toggle",
		async (_c, { threadId, stepId }) => {
			const thread = await db.threads.toggleStep(threadId, stepId);
			await analytics.touchDays([db.clock.today()]);
			ctx.broadcastThreads();
			ctx.microTick();
			return thread;
		},
		ctx,
	);
	on(
		"steps:update",
		async (_c, { threadId, stepId, text }) => {
			const thread = await db.threads.updateStep(threadId, stepId, text);
			ctx.broadcastThreads();
			return thread;
		},
		ctx,
	);
	on(
		"steps:remove",
		async (_c, { threadId, stepId }) => {
			const thread = await db.threads.removeStep(threadId, stepId);
			ctx.broadcastThreads();
			return thread;
		},
		ctx,
	);
	on(
		"steps:reorder",
		async (_c, { threadId, stepId, toIndex }) => {
			const thread = await db.threads.reorderStep(threadId, stepId, toIndex);
			ctx.broadcastThreads();
			return thread;
		},
		ctx,
	);

	// --------------------------------------------------------------------- day

	on("day:get", async (_c, { localDate }) => db.days.get(localDate), ctx);
	on("day:today", async () => db.days.today(), ctx);
	on("day:list", async () => db.days.listDates(), ctx);
	on(
		"day:setIntent",
		async (_c, { threadIds }) => {
			const day = await db.days.setIntent(threadIds);
			ctx.broadcastDay(day);
			return day;
		},
		ctx,
	);
	on(
		"day:setNote",
		async (_c, { localDate, note }) => {
			const day = await db.days.setNote(localDate, note);
			ctx.broadcastDay(day);
			return day;
		},
		ctx,
	);
	on(
		"day:setNow",
		async (_c, { now, localDate }) => {
			const day = await db.days.setNow(now, localDate);
			ctx.broadcastDay(day);
			return day;
		},
		ctx,
	);

	// ---------------------------------------------------- global carry-forward

	on("carry:list", async () => db.days.carryForward(), ctx);

	on(
		"blocker:add",
		async (_c, { text, localDate }) => {
			const day = await db.days.addBlocker(text, localDate);
			ctx.broadcastDay(day);
			ctx.broadcast("carry:changed", undefined);
			return day;
		},
		ctx,
	);
	on(
		"blocker:resolve",
		async (_c, { localDate, blockerId }) => {
			const blocker = await db.days.findBlocker(localDate, blockerId);
			const day = await db.days.resolveBlocker(localDate, blockerId);
			// Resolving one is worth a line in today's log; un-resolving is a correction, not news.
			if (blocker && !blocker.resolved) {
				ctx.broadcastDay(await db.days.addLogEntry(`Unblocked: ${blocker.text}`, "manual"));
			}
			ctx.broadcastDay(day);
			ctx.broadcast("carry:changed", undefined);
			ctx.microTick();
			return day;
		},
		ctx,
	);
	on(
		"blocker:remove",
		async (_c, { localDate, blockerId }) => {
			const day = await db.days.removeBlocker(localDate, blockerId);
			ctx.broadcastDay(day);
			ctx.broadcast("carry:changed", undefined);
			return day;
		},
		ctx,
	);

	// --------------------------------------------------------------------- log

	on(
		"log:add",
		async (_c, { text, localDate }) => {
			const day = await db.days.addLogEntry(text, "manual", localDate);
			ctx.broadcastDay(day);
			return day;
		},
		ctx,
	);
	on(
		"log:remove",
		async (_c, { localDate, entryId }) => {
			const day = await db.days.removeLogEntry(localDate, entryId);
			ctx.broadcastDay(day);
			return day;
		},
		ctx,
	);

	// -------------------------------------------------------------------- todo

	on(
		"todo:add",
		async (_c, { text, localDate }) => {
			const day = await db.days.addTodo(text, localDate);
			ctx.broadcastDay(day);
			ctx.broadcast("carry:changed", undefined);
			return day;
		},
		ctx,
	);
	on(
		"todo:toggle",
		async (_c, { localDate, todoId }) => {
			const before = await db.days.findTodo(localDate, todoId);
			const day = await db.days.toggleTodo(localDate, todoId);
			// Completing a carried-forward todo drops it off the list and lands in *today's* log,
			// not the log of whichever day happened to raise it (§5).
			if (before && !before.done) {
				ctx.broadcastDay(await db.days.addLogEntry(before.text, "todo"));
			}
			ctx.broadcastDay(day);
			ctx.broadcast("carry:changed", undefined);
			ctx.microTick();
			return day;
		},
		ctx,
	);
	on(
		"todo:update",
		async (_c, { localDate, todoId, text }) => {
			const day = await db.days.updateTodo(localDate, todoId, text);
			ctx.broadcastDay(day);
			return day;
		},
		ctx,
	);
	on(
		"todo:remove",
		async (_c, { localDate, todoId }) => {
			const day = await db.days.removeTodo(localDate, todoId);
			ctx.broadcastDay(day);
			ctx.broadcast("carry:changed", undefined);
			return day;
		},
		ctx,
	);
	on(
		"todo:reorder",
		async (_c, { localDate, todoId, toIndex }) => {
			const day = await db.days.reorderTodo(localDate, todoId, toIndex);
			ctx.broadcastDay(day);
			return day;
		},
		ctx,
	);
	on(
		"todo:promote",
		async (_c, { localDate, todoId }) => {
			const todo = await db.days.findTodo(localDate, todoId);
			if (!todo) throw new Error("todo not found");
			// The todo is never deleted — only linked — so the history stays honest.
			const thread = await db.threads.create(todo.text);
			const day = await db.days.linkPromotedTodo(localDate, todoId, thread.id);
			ctx.broadcastDay(day);
			ctx.broadcastThreads();
			ctx.broadcast("carry:changed", undefined);
			return { day, thread };
		},
		ctx,
	);

	// ----------------------------------------------------------------- thought

	on(
		"thought:add",
		async (_c, { text, localDate }) => {
			const day = await db.days.addThought(text, localDate);
			ctx.broadcastDay(day);
			return day;
		},
		ctx,
	);
	on(
		"thought:remove",
		async (_c, { localDate, thoughtId }) => {
			const day = await db.days.removeThought(localDate, thoughtId);
			ctx.broadcastDay(day);
			return day;
		},
		ctx,
	);
	on(
		"thought:note",
		async (_c, { localDate, thoughtId, note }) => {
			const day = await db.days.noteThought(localDate, thoughtId, note);
			ctx.broadcastDay(day);
			return day;
		},
		ctx,
	);
	on("park:all", async () => db.days.allThoughts(), ctx);
	on(
		"thought:process",
		async (_c, { localDate, thoughtId, action }) => {
			const thought = await db.days.findThought(localDate, thoughtId);
			if (!thought) throw new Error("thought not found");
			let thread = null;
			if (action === "thread") thread = await db.threads.create(thought.text);
			else if (action === "todo") await db.days.addTodo(thought.text);
			const day = await db.days.markThoughtProcessed(
				localDate,
				thoughtId,
				action,
			);
			ctx.broadcastDay(day);
			if (thread) ctx.broadcastThreads();
			return { day, thread };
		},
		ctx,
	);

	// ----------------------------------------------------------------- session

	on(
		"session:start",
		async (_c, { threadId, plannedMs }) => sessions.start(threadId, plannedMs),
		ctx,
	);
	on("session:pause", async () => sessions.pause(), ctx);
	on("session:resume", async () => sessions.resume(), ctx);
	on(
		"session:end",
		async (_c, { outcome }) => {
			await sessions.end(outcome);
			return null;
		},
		ctx,
	);
	on(
		"session:switch",
		async (_c, { threadId }) => sessions.switchTo(threadId),
		ctx,
	);
	on(
		"session:distraction",
		async (_c, { kind, note }) => sessions.logDistraction(kind, note),
		ctx,
	);
	on("session:state", async () => sessions.state(), ctx);
	on(
		"session:forThread",
		async (_c, { threadId }) => db.sessions.forThread(threadId),
		ctx,
	);
	on(
		"session:resolveRecovery",
		async (_c, { sessionId, keep }) => {
			await sessions.resolveRecovery(sessionId, keep);
		},
		ctx,
	);
	/**
	 * Park (§4): one tap, no dialog. A line goes to today's Park list and the grace time goes
	 * back on whichever clock is running. Nothing is ever subtracted — the moment self-reporting
	 * costs something, people stop doing it and the data becomes worthless.
	 */
	on(
		"session:park",
		async (_c, { kind, note }) => {
			const grantMs = db.settings.get().distractionGraceMs;
			const text = note?.trim() || "Distracted";

			if (sessions.isRunning()) {
				await sessions.logDistraction(kind, note);
			} else if (ctx.stages.grant(grantMs)) {
				ctx.broadcast("hud:toast", { text: parkToast(grantMs) });
			} else {
				ctx.broadcast("hud:toast", { text: "Parked." });
			}

			const day = await db.days.addThought(text);
			ctx.broadcastDay(day);
		},
		ctx,
	);

	// ----------------------------------------------------------------- stages

	on("stage:state", async () => ctx.stages.current(), ctx);
	on("stage:resume", async () => ctx.stages.resume(), ctx);
	on("stage:skip", async () => ctx.stages.skip(), ctx);
	on(
		"stage:stop",
		async () => {
			ctx.stages.stop();
			return null;
		},
		ctx,
	);

	// ---------------------------------------------------------------- calendar

	// Local first, and it never touches the network — this is what the view paints with.
	on("calendar:get", async (c, request) => ({
		calendar: await c.calendar.local(request),
		source: "local" as const,
	}), ctx);
	// The server's copy, or null. Null is an ordinary answer: signed out, offline, anything.
	// The view already has a complete calendar, so there is nothing here to report as an error.
	on("calendar:refresh", async (c, request) => c.calendar.remote(request), ctx);

	// ------------------------------------------------------------------ server

	// A button press, never a poll. Unauthenticated, so it answers signed out too.
	on("server:health", async () => ctx.auth.checkHealth(), ctx);

	// --------------------------------------------------------------- analytics

	on(
		"analytics:scope",
		async (_c, { scope, anchor }) => analytics.summary(scope, anchor),
		ctx,
	);
	on(
		"analytics:rebuild",
		async () => {
			await analytics.rebuild();
		},
		ctx,
	);

	// ---------------------------------------------------------------- settings

	on("settings:get", async () => db.settings.get(), ctx);
	on(
		"settings:update",
		async (_c, { patch }) => {
			const settings = await db.settings.update(patch);
			// Any key the server's planner reads has to reach the profile, or the "always true"
			// context becomes a textarea that talks to nobody.
			const profileKeys = [
				"timezone",
				"wakeTime",
				"dayStartTime",
				"dayEndTime",
				"plannerContext",
				"plannerModel",
				"plannerEffort",
			] as const;
			if (profileKeys.some((key) => patch[key] !== undefined)) {
				ctx.syncState.markProfile();
				ctx.sync?.schedule();
			}
			ctx.broadcastSettings(settings);
			return settings;
		},
		ctx,
	);

	// ----------------------------------------------------------------- account

	/**
	 * Signing in is the one place the app waits on the network, and it waits in the form, not
	 * in the way of anything else. Errors are thrown so the renderer gets them as a rejected
	 * promise it can print next to the button that caused them — `ApiClient` has already turned
	 * every status code into a sentence meant for a person.
	 */
	on("auth:state", async () => ctx.auth.state(), ctx);
	on(
		"auth:register",
		async (_c, { email, password, displayName }) => {
			// Checked here as well as on the server so the common mistake costs no round trip
			// and, more to the point, no slice of the five-per-hour registration limit.
			if (!email.includes("@")) throw new Error("That does not look like an email address.");
			if (password.length < MIN_PASSWORD_LENGTH) {
				throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters — a short phrase beats a clever word.`);
			}
			return ctx.auth.register(email, password, displayName);
		},
		ctx,
	);
	on("auth:login", async (_c, { email, password }) => ctx.auth.login(email, password), ctx);
	on("auth:logout", async () => ctx.auth.logout(), ctx);
	on("auth:deleteAccount", async () => ctx.auth.deleteAccount(), ctx);
	on("auth:setServer", async (_c, { url }) => ctx.auth.setServerUrl(url), ctx);

	// -------------------------------------------------------------------- sync

	on("sync:status", async () => ctx.syncStatus(), ctx);
	on(
		"sync:now",
		async () => {
			const outcome = await ctx.sync.sync();
			ctx.afterSync(outcome);
			return ctx.syncStatus();
		},
		ctx,
	);

	// -------------------------------------------------------------------- links

	on("link:open", async (_c, { url }) => openLink(url), ctx);
	on("startup:get", async () => launchesAtStartup(), ctx);
	on("startup:set", async (_c, { enabled }) => setLaunchAtStartup(enabled), ctx);

	// -------------------------------------------------------------------- data

	/**
	 * "Repair" is now just: write everything pending, re-read it from disk, and recompute the
	 * analytics cache from the raw records. There is no index to rebuild and no journal to
	 * replay, because there is no index and no journal.
	 */
	on(
		"data:repair",
		async () => {
			await db.store.reload();
			await analytics.rebuild();
			return { filesRead: db.store.fileCount, rollupsRebuilt: true };
		},
		ctx,
	);
	on(
		"data:export",
		async () => {
			const target = path.join(
				app.getPath("documents"),
				`adhd-superpower-export-${Date.now()}.json`,
			);
			await db.store.exportTo(target);
			return { path: target };
		},
		ctx,
	);
	on(
		"data:reveal",
		async () => {
			shell.showItemInFolder(db.root);
		},
		ctx,
	);

	// ------------------------------------------------------------------ window

	on(
		"window:mainReady",
		async () => {
			ctx.onMainReady();
		},
		ctx,
	);
	on(
		"calendarWidget:toggle",
		async () => ctx.toggleCalendarWidget(),
		ctx,
	);
	on(
		"calendarWidget:close",
		async () => {
			ctx.closeCalendarWidget();
		},
		ctx,
	);
	on(
		"calendarWidget:scope",
		async (c, { scope }) => {
			await c.db.settings.update({ calendarWidgetScope: scope });
		},
		ctx,
	);
	on(
		"hud:show",
		async () => {
			ctx.openHud();
		},
		ctx,
	);
	on(
		"hud:reset",
		async () => {
			ctx.resetHud();
		},
		ctx,
	);
	on(
		"hud:hide",
		async () => {
			ctx.hud?.hide();
		},
		ctx,
	);
	on(
		"celebration:done",
		async () => {
			celebrations.stop();
		},
		ctx,
	);
}

/** "Parked. Two minutes back." — the exact wording matters less than it never sounding like a cost. */
function parkToast(grantMs: number): string {
	const minutes = Math.round(grantMs / 60_000);
	if (minutes <= 0) return "Parked.";
	return `Parked. ${minutes === 1 ? "A minute" : `${minutes} minutes`} back.`;
}

/**
 * Completion flow (§5.2): logs the thread to today, ends any running session on it, then
 * triggers the celebration. Order matters — the session must end before we compute the payload
 * so the totals it reads are final.
 */
async function onThreadCompleted(
	ctx: AppContext,
	threadId: string,
): Promise<void> {
	const { db, sessions, analytics, celebrations } = ctx;
	if (sessions.currentThreadId() === threadId) await sessions.end("completed");

	await db.days.logThread(threadId);
	await analytics.touchDays([db.clock.today()]);

	const thread = await db.threads.get(threadId);
	if (!thread) return;
	ctx.broadcastDay(await db.days.addLogEntry(`Finished ${thread.title}`, "thread"));
	await celebrations.celebrate(thread);
}

export { onThreadCompleted };
