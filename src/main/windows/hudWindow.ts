/**
 * The floating timer. Frameless, transparent, always above everything including full-screen
 * apps, and present on every desktop — a HUD you have to go looking for is not a HUD.
 */
import { BrowserWindow, screen } from "electron";
import { loadRenderer, preloadPath } from "./urls.js";

/**
 * The size the HUD is *drawn* at. The control buttons carry text labels rather than bare glyphs
 * (a button whose meaning you have to remember is a button you stop using), and the thread
 * title gets a full row to itself instead of sharing space with the button strip.
 *
 * What actually reaches the screen is this multiplied by `hudScaleFor` — see below.
 */
export const HUD_BASE_WIDTH = 470;
export const HUD_BASE_HEIGHT = 106;

/** The screen the base layout was drawn for: a desk monitor, not a laptop lid. */
const REFERENCE_WIDTH = 1800;
/** Past this the button labels stop being readable, so the HUD stops shrinking. */
const MIN_SCALE = 0.8;
/** Breathing room between the HUD and the corner of the screen. */
const MARGIN = 24;

/**
 * A 13" laptop hands you about 1440 points of width; a desk monitor hands you 1920 or more.
 * The HUD used to ask for the same 470 of them either way, which is a third of a laptop screen
 * spent on a clock. So it takes a share of the screen rather than a fixed slab of it.
 */
export function hudScaleFor(display: Electron.Display): number {
	const fit = display.workArea.width / REFERENCE_WIDTH;
	return Math.round(Math.min(1, Math.max(MIN_SCALE, fit)) * 100) / 100;
}

export function hudSizeFor(display: Electron.Display): {
	scale: number;
	width: number;
	height: number;
} {
	const scale = hudScaleFor(display);
	return {
		scale,
		width: Math.round(HUD_BASE_WIDTH * scale),
		height: Math.round(HUD_BASE_HEIGHT * scale),
	};
}

export interface HudPosition {
	x: number;
	y: number;
}

export function defaultHudPosition(
	display: Electron.Display = screen.getPrimaryDisplay(),
): HudPosition {
	// Bottom-right (§4): the top-right corner is where notifications and menu-bar extras land.
	const { workArea } = display;
	const { width, height } = hudSizeFor(display);
	return {
		x: Math.round(workArea.x + workArea.width - width - MARGIN),
		y: Math.round(workArea.y + workArea.height - height - MARGIN),
	};
}

export function createHudWindow(
	saved: HudPosition | undefined,
	onMoved: (at: HudPosition) => void,
): BrowserWindow {
	const display = saved
		? screen.getDisplayNearestPoint(saved)
		: screen.getPrimaryDisplay();
	const { scale, width, height } = hudSizeFor(display);
	const position = clampToWorkArea(
		saved ?? defaultHudPosition(display),
		display,
		width,
		height,
	);

	const window = new BrowserWindow({
		width,
		height,
		x: position.x,
		y: position.y,
		frame: false,
		transparent: true,
		resizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		show: false,
		maximizable: false,
		minimizable: false,
		fullscreenable: false,
		webPreferences: {
			preload: preloadPath,
			sandbox: false,
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	window.setAlwaysOnTop(true, "floating");
	window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	window.once("ready-to-show", () => window.show());

	// Position is persisted per run so the HUD reappears where the user parked it.
	window.on("moved", () => {
		const [x, y] = window.getPosition();
		if (typeof x === "number" && typeof y === "number") onMoved({ x, y });
	});

	// The renderer keeps laying itself out at the base size and scales the whole page down by
	// this factor, so every proportion inside the HUD survives the trip to a smaller screen.
	loadRenderer(window, "hud", `scale=${scale}`);
	return window;
}

/**
 * A position saved on a monitor that has since been unplugged — or on a bigger screen than the
 * one you are on now — must not put the HUD somewhere you cannot reach it.
 */
function clampToWorkArea(
	at: HudPosition,
	display: Electron.Display,
	width: number,
	height: number,
): HudPosition {
	const { workArea } = display;
	const maxX = workArea.x + workArea.width - width;
	const maxY = workArea.y + workArea.height - height;
	return {
		x: Math.round(Math.min(Math.max(at.x, workArea.x), Math.max(workArea.x, maxX))),
		y: Math.round(Math.min(Math.max(at.y, workArea.y), Math.max(workArea.y, maxY))),
	};
}

/** The display the HUD is currently on — the celebration overlay follows it, not the primary. */
export function displayContainingHud(
	hud: BrowserWindow | null,
): Electron.Display {
	if (!hud || hud.isDestroyed()) return screen.getPrimaryDisplay();
	const [x, y] = hud.getPosition();
	return screen.getDisplayNearestPoint({ x: x ?? 0, y: y ?? 0 });
}
