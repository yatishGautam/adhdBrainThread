/**
 * The floating calendar. The same idea as the HUD, for a different question.
 *
 * The HUD answers "how long is left on this block". This answers "what was I supposed to be
 * doing, and what is next" — the question you ask by alt-tabbing to a calendar app, losing the
 * thread, and arriving somewhere else twenty minutes later. Keeping it on screen beside the work
 * is the entire point; a calendar you have to go and look at is one you stop checking.
 *
 * Three deliberate differences from the HUD:
 *
 * **Resizable, and its size is remembered.** The HUD is one fixed shape because it shows one
 * countdown. This shows a day, a week or a month, and those want genuinely different room — a
 * month grid at the HUD's height is unreadable.
 *
 * **Above normal windows, but not above full screen.** `floating` rather than the HUD's
 * always-on-every-desktop treatment. A timer you can't lose is worth interrupting a full-screen
 * app for. A calendar is not, and one that hovers over a presentation is one you close.
 *
 * **Closable, and it stays closed.** It is opened by a deliberate press and remembers nothing but
 * where it was and what shape it was in.
 */
import { BrowserWindow, screen } from "electron";
import { loadRenderer, preloadPath } from "./urls.js";

/**
 * Big enough for a week's columns to hold a block title without truncating to one word, which is
 * the width below which the whole thing stops being worth having open.
 */
export const CALENDAR_WIDTH = 560;
export const CALENDAR_HEIGHT = 420;
const MIN_WIDTH = 380;
const MIN_HEIGHT = 260;

export interface CalendarBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function defaultCalendarBounds(): CalendarBounds {
	// Top-right, under where the menu bar extras sit, rather than the HUD's bottom-right — the
	// two are commonly open together and should not land on top of each other.
	const { workArea } = screen.getPrimaryDisplay();
	return {
		x: Math.round(workArea.x + workArea.width - CALENDAR_WIDTH - 24),
		y: Math.round(workArea.y + 24),
		width: CALENDAR_WIDTH,
		height: CALENDAR_HEIGHT,
	};
}

export function createCalendarWindow(
	saved: CalendarBounds | undefined,
	onMoved: (at: CalendarBounds) => void,
): BrowserWindow {
	const bounds = onScreen(saved) ?? defaultCalendarBounds();

	const window = new BrowserWindow({
		...bounds,
		minWidth: MIN_WIDTH,
		minHeight: MIN_HEIGHT,
		frame: false,
		transparent: true,
		resizable: true,
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

	// `floating` only. Deliberately not `setVisibleOnAllWorkspaces` with `visibleOnFullScreen`,
	// which is what the HUD does — see the header.
	window.setAlwaysOnTop(true, "floating");
	window.once("ready-to-show", () => window.show());

	const remember = (): void => {
		if (window.isDestroyed()) return;
		const at = window.getBounds();
		onMoved({ x: at.x, y: at.y, width: at.width, height: at.height });
	};
	window.on("moved", remember);
	window.on("resized", remember);

	loadRenderer(window, "calendar");
	return window;
}

/**
 * Saved bounds, but only if that patch of screen still exists.
 *
 * Unplugging the external monitor a window was parked on otherwise reopens it at coordinates no
 * display covers — the window is created, is reported as visible, and cannot be found. Checked
 * against the work areas rather than `getDisplayNearestPoint`, which always answers with
 * *something* and so can never say no.
 */
function onScreen(bounds: CalendarBounds | undefined): CalendarBounds | undefined {
	if (!bounds) return undefined;
	const visible = screen.getAllDisplays().some(({ workArea }) => {
		// A generous overlap: the title strip being reachable is enough to drag it back.
		const overlapX =
			bounds.x < workArea.x + workArea.width && bounds.x + bounds.width > workArea.x;
		const overlapY =
			bounds.y < workArea.y + workArea.height && bounds.y + 40 > workArea.y;
		return overlapX && overlapY;
	});
	return visible ? bounds : undefined;
}
