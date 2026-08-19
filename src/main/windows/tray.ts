import path from "node:path";
import { fileURLToPath } from "node:url";
import { Menu, Tray, nativeImage, app } from "electron";
import { formatClock, formatTrayCountdown } from "@shared/format.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export interface TrayHooks {
	onShow: () => void;
	onPauseResume: () => void;
	onEnd: () => void;
	onQuit: () => void;
}

export interface TrayState {
	running: boolean;
	paused: boolean;
	threadTitle: string | null;
	remainingMs: number;
}

export function createTray(hooks: TrayHooks): Tray {
	const image = nativeImage.createFromPath(
		path.join(here, "../../assets/trayTemplate.png"),
	);
	image.setTemplateImage(true);
	const tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
	tray.setToolTip("ADHD Superpower");
	tray.on("click", hooks.onShow);
	return tray;
}

/**
 * The last title actually handed to macOS. Setting a title is not free — it re-lays out the
 * menu bar — so a title identical to the one already up there is not sent at all.
 */
let lastTitle: string | null = null;

function titleFor(state: TrayState): string {
	if (!state.running) return "";
	// No running dot: an icon is already sitting next to this, and every character costs width
	// that a crowded menu bar does not have. Paused is worth two characters, because a timer
	// that has silently stopped is the thing you need to be told about.
	return state.paused
		? `❙❙ ${formatTrayCountdown(state.remainingMs)}`
		: formatTrayCountdown(state.remainingMs);
}

/**
 * Called once a second while a session runs. Cheap by design: it touches the title and nothing
 * else — no tooltip, no rebuilt context menu — and usually does not touch even that.
 */
export function updateTrayCountdown(tray: Tray, state: TrayState): void {
	if (process.platform !== "darwin") return;
	const title = titleFor(state);
	if (title === lastTitle) return;
	lastTitle = title;
	tray.setTitle(title);
}

/** The tray reflects the session, so the timer is legible without opening anything. */
export function updateTray(
	tray: Tray,
	state: TrayState,
	hooks: TrayHooks,
): void {
	updateTrayCountdown(tray, state);
	// The exact second lives here, where reading it costs a hover rather than menu bar width.
	tray.setToolTip(
		[
			state.threadTitle ? `ADHD Superpower — ${state.threadTitle}` : "ADHD Superpower",
			state.running ? `${formatClock(state.remainingMs)} left` : null,
		]
			.filter(Boolean)
			.join("\n"),
	);

	tray.setContextMenu(
		Menu.buildFromTemplate([
			{ label: state.threadTitle ?? "Nothing running", enabled: false },
			{ type: "separator" },
			{ label: "Open ADHD Superpower", click: hooks.onShow },
			{
				label: state.paused ? "Resume" : "Pause",
				enabled: state.running,
				click: hooks.onPauseResume,
			},
			{ label: "End session", enabled: state.running, click: hooks.onEnd },
			{ type: "separator" },
			{ label: "Quit", accelerator: "Command+Q", click: hooks.onQuit },
		]),
	);
}

export function markQuitting(): void {
	(globalThis as { __threadQuitting?: boolean }).__threadQuitting = true;
}

export function isQuitting(): boolean {
	return Boolean(
		(globalThis as { __threadQuitting?: boolean }).__threadQuitting,
	);
}

export function appDataRoot(): string {
	return path.join(app.getPath("userData"), "data");
}
