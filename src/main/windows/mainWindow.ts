import { BrowserWindow, shell } from "electron";
import { appIconPath } from "./appIcon.js";
import { loadRenderer, preloadPath } from "./urls.js";

export interface MainWindowHooks {
	/** Closing the main window hides it to the tray; the session keeps running. */
	onHide: () => void;
	onBlur: () => void;
	/** Coming back to the window is the moment to find out what the phone did meanwhile. */
	onFocus: () => void;
}

export function createMainWindow(hooks: MainWindowHooks): BrowserWindow {
	const window = new BrowserWindow({
		width: 1180,
		height: 780,
		minWidth: 1024,
		minHeight: 700,
		show: false,
		backgroundColor: "#0F1115",
		icon: appIconPath(),
		title: "ADHD Superpower",
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
		webPreferences: {
			preload: preloadPath,
			sandbox: false,
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	window.once("ready-to-show", () => window.show());

	window.on("close", (event) => {
		// Only a real quit closes this window; otherwise it hides and the timer survives.
		if (!(globalThis as { __threadQuitting?: boolean }).__threadQuitting) {
			event.preventDefault();
			window.hide();
			hooks.onHide();
		}
	});

	// A flush point: whatever the user just typed is on disk before they switch away.
	window.on("blur", hooks.onBlur);
	window.on("focus", hooks.onFocus);

	window.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});

	loadRenderer(window, "index");
	return window;
}
