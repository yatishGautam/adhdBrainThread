const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  Tray,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SETTINGS = Object.freeze({
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 20,
  sessionsBeforeLongBreak: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
  alwaysOnTop: true,
  sound: true,
});

let mainWindow = null;
let tray = null;
let isQuitting = false;
let tickHandle = null;
let lastBroadcastSecond = null;
let settings = { ...DEFAULT_SETTINGS };

let timerState = {
  mode: "focus",
  status: "idle",
  remainingMs: DEFAULT_SETTINGS.focusMinutes * 60_000,
  endsAt: null,
  completedFocusSessions: 0,
  todayCompleted: 0,
  todayKey: localDateKey(),
  task: "",
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function stateFilePath() {
  return path.join(app.getPath("userData"), "focusbar-state.json");
}

function sanitizeNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function sanitizeSettings(input = {}) {
  return {
    focusMinutes: sanitizeNumber(input.focusMinutes, DEFAULT_SETTINGS.focusMinutes, 1, 180),
    shortBreakMinutes: sanitizeNumber(input.shortBreakMinutes, DEFAULT_SETTINGS.shortBreakMinutes, 1, 60),
    longBreakMinutes: sanitizeNumber(input.longBreakMinutes, DEFAULT_SETTINGS.longBreakMinutes, 1, 120),
    sessionsBeforeLongBreak: sanitizeNumber(
      input.sessionsBeforeLongBreak,
      DEFAULT_SETTINGS.sessionsBeforeLongBreak,
      1,
      12,
    ),
    autoStartBreaks: Boolean(input.autoStartBreaks),
    autoStartFocus: Boolean(input.autoStartFocus),
    alwaysOnTop: input.alwaysOnTop !== false,
    sound: input.sound !== false,
  };
}

function durationForMode(mode) {
  const minutes = {
    focus: settings.focusMinutes,
    shortBreak: settings.shortBreakMinutes,
    longBreak: settings.longBreakMinutes,
  }[mode] ?? settings.focusMinutes;

  return minutes * 60_000;
}

function resetDailyCounterIfNeeded() {
  const today = localDateKey();
  if (timerState.todayKey !== today) {
    timerState.todayKey = today;
    timerState.todayCompleted = 0;
  }
}

function loadState() {
  try {
    const raw = fs.readFileSync(stateFilePath(), "utf8");
    const persisted = JSON.parse(raw);

    settings = sanitizeSettings(persisted.settings);

    const mode = ["focus", "shortBreak", "longBreak"].includes(persisted.timerState?.mode)
      ? persisted.timerState.mode
      : "focus";

    const status = ["idle", "paused", "running"].includes(persisted.timerState?.status)
      ? persisted.timerState.status
      : "idle";

    timerState = {
      mode,
      status,
      remainingMs: Number.isFinite(persisted.timerState?.remainingMs)
        ? Math.max(0, persisted.timerState.remainingMs)
        : durationForMode(mode),
      endsAt: Number.isFinite(persisted.timerState?.endsAt)
        ? persisted.timerState.endsAt
        : null,
      completedFocusSessions: Math.max(
        0,
        Number(persisted.timerState?.completedFocusSessions) || 0,
      ),
      todayCompleted: Math.max(0, Number(persisted.timerState?.todayCompleted) || 0),
      todayKey: persisted.timerState?.todayKey || localDateKey(),
      task: String(persisted.timerState?.task || "").slice(0, 120),
    };

    resetDailyCounterIfNeeded();

    if (timerState.status === "running" && timerState.endsAt) {
      timerState.remainingMs = Math.max(0, timerState.endsAt - Date.now());

      if (timerState.remainingMs <= 0) {
        // Do not silently run through multiple cycles while the app was closed.
        finishCurrentInterval({ notify: false });
      }
    } else {
      timerState.endsAt = null;
    }
  } catch {
    settings = { ...DEFAULT_SETTINGS };
    timerState.remainingMs = durationForMode("focus");
  }
}

function saveState() {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(
      stateFilePath(),
      JSON.stringify({ settings, timerState }, null, 2),
      "utf8",
    );
  } catch (error) {
    console.error("Unable to save FocusBar state:", error);
  }
}

function publicState() {
  resetDailyCounterIfNeeded();

  const durationMs = durationForMode(timerState.mode);
  return {
    ...timerState,
    remainingMs: Math.max(0, timerState.remainingMs),
    durationMs,
    settings: { ...settings },
  };
}

function formatTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function modeSymbol(mode) {
  if (mode === "focus") return "●";
  if (mode === "longBreak") return "◆";
  return "○";
}

function modeName(mode) {
  if (mode === "focus") return "Focus";
  if (mode === "longBreak") return "Long break";
  return "Short break";
}

function updateTrayTitle() {
  if (!tray) return;

  const time = formatTime(timerState.remainingMs);
  if (process.platform === "darwin") {
    tray.setTitle(`${modeSymbol(timerState.mode)} ${time}`);
  }

  const status = timerState.status === "running" ? "running" : timerState.status;
  tray.setToolTip(`FocusBar — ${modeName(timerState.mode)} ${time} (${status})`);
}

function buildTrayMenu() {
  if (!tray) return;

  const isRunning = timerState.status === "running";
  const template = [
    {
      label: mainWindow?.isVisible() ? "Hide Timer" : "Show Timer",
      click: () => toggleWindow(),
    },
    {
      label: isRunning ? "Pause" : "Start",
      click: () => command(isRunning ? "pause" : "start"),
    },
    { label: "Reset Current Interval", click: () => command("reset") },
    { label: "Skip Interval", click: () => command("skip") },
    { type: "separator" },
    {
      label: "Keep Window on Top",
      type: "checkbox",
      checked: settings.alwaysOnTop,
      click: (item) => updateSettings({ alwaysOnTop: item.checked }),
    },
    { type: "separator" },
    { label: `Completed today: ${timerState.todayCompleted}`, enabled: false },
    { type: "separator" },
    { label: "Quit FocusBar", role: "quit" },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function broadcastState({ rebuildMenu = false } = {}) {
  const snapshot = publicState();
  mainWindow?.webContents.send("pomodoro:state", snapshot);
  updateTrayTitle();
  if (rebuildMenu) buildTrayMenu();
}

function showNotification(title, body) {
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title,
    body,
    silent: !settings.sound,
  });

  notification.on("click", () => showWindow());
  notification.show();
}

function nextModeAfter(mode, { completedFocus = false } = {}) {
  if (mode !== "focus") return "focus";

  // Skipping a focus interval does not earn a long break.
  if (!completedFocus) return "shortBreak";

  const cycle = settings.sessionsBeforeLongBreak;
  return timerState.completedFocusSessions > 0 &&
    timerState.completedFocusSessions % cycle === 0
    ? "longBreak"
    : "shortBreak";
}

function switchToMode(nextMode, shouldRun) {
  timerState.mode = nextMode;
  timerState.remainingMs = durationForMode(nextMode);
  timerState.status = shouldRun ? "running" : "idle";
  timerState.endsAt = shouldRun ? Date.now() + timerState.remainingMs : null;
}

function finishCurrentInterval({ notify = true } = {}) {
  const completedMode = timerState.mode;

  if (completedMode === "focus") {
    resetDailyCounterIfNeeded();
    timerState.completedFocusSessions += 1;
    timerState.todayCompleted += 1;
  }

  const nextMode = nextModeAfter(completedMode, {
    completedFocus: completedMode === "focus",
  });
  const shouldAutoStart =
    completedMode === "focus" ? settings.autoStartBreaks : settings.autoStartFocus;

  switchToMode(nextMode, shouldAutoStart);

  if (notify) {
    if (completedMode === "focus") {
      showNotification(
        "Focus session complete",
        nextMode === "longBreak"
          ? "Great work. Take a proper long break."
          : "Good work. Step away for a short break.",
      );
    } else {
      showNotification("Break complete", "Your next focus session is ready.");
    }
  }

  saveState();
  broadcastState({ rebuildMenu: true });
}

function command(action) {
  switch (action) {
    case "start": {
      if (timerState.status === "running") break;
      if (timerState.remainingMs <= 0) {
        timerState.remainingMs = durationForMode(timerState.mode);
      }
      timerState.status = "running";
      timerState.endsAt = Date.now() + timerState.remainingMs;
      break;
    }

    case "pause": {
      if (timerState.status !== "running") break;
      timerState.remainingMs = Math.max(0, timerState.endsAt - Date.now());
      timerState.status = "paused";
      timerState.endsAt = null;
      break;
    }

    case "reset": {
      timerState.status = "idle";
      timerState.endsAt = null;
      timerState.remainingMs = durationForMode(timerState.mode);
      break;
    }

    case "skip": {
      const nextMode = nextModeAfter(timerState.mode);
      switchToMode(nextMode, false);
      break;
    }

    case "focus":
    case "shortBreak":
    case "longBreak": {
      switchToMode(action, false);
      break;
    }

    default:
      throw new Error(`Unknown timer command: ${action}`);
  }

  lastBroadcastSecond = null;
  saveState();
  broadcastState({ rebuildMenu: true });
  return publicState();
}

function updateSettings(patch) {
  const previousDuration = durationForMode(timerState.mode);
  const wasAtStart =
    timerState.status === "idle" &&
    Math.abs(timerState.remainingMs - previousDuration) < 1000;

  settings = sanitizeSettings({ ...settings, ...patch });

  if (wasAtStart) {
    timerState.remainingMs = durationForMode(timerState.mode);
  }

  if (mainWindow) {
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop, "floating");
  }

  saveState();
  broadcastState({ rebuildMenu: true });
  return publicState();
}

function tick() {
  resetDailyCounterIfNeeded();

  if (timerState.status === "running") {
    timerState.remainingMs = Math.max(0, timerState.endsAt - Date.now());

    if (timerState.remainingMs <= 0) {
      finishCurrentInterval();
      return;
    }
  }

  const currentSecond = Math.ceil(timerState.remainingMs / 1000);
  if (currentSecond !== lastBroadcastSecond) {
    lastBroadcastSecond = currentSecond;
    broadcastState();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 390,
    height: 550,
    minWidth: 360,
    minHeight: 500,
    maxWidth: 520,
    maxHeight: 720,
    resizable: true,
    show: false,
    backgroundColor: "#0f1117",
    title: "FocusBar",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 14, y: 14 },
    alwaysOnTop: settings.alwaysOnTop,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setAlwaysOnTop(settings.alwaysOnTop, "floating");

  if (process.platform === "darwin") {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    broadcastState({ rebuildMenu: true });
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      buildTrayMenu();
    }
  });

  mainWindow.on("show", buildTrayMenu);
  mainWindow.on("hide", buildTrayMenu);
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "assets", "trayTemplate.png");
  const image = nativeImage.createFromPath(iconPath);
  image.setTemplateImage(true);

  tray = new Tray(image);
  tray.on("click", toggleWindow);
  updateTrayTitle();
  buildTrayMenu();
}

function showWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

function registerIpc() {
  ipcMain.handle("pomodoro:get-state", () => publicState());
  ipcMain.handle("pomodoro:command", (_event, action) => command(action));
  ipcMain.handle("pomodoro:update-settings", (_event, patch) => updateSettings(patch));
  ipcMain.handle("pomodoro:set-task", (_event, task) => {
    timerState.task = String(task || "").trim().slice(0, 120);
    saveState();
    broadcastState();
    return publicState();
  });
  ipcMain.handle("window:hide", () => mainWindow?.hide());
}

app.whenReady().then(() => {
  loadState();
  registerIpc();
  createTray();
  createWindow();

  if (process.platform === "darwin") {
    app.dock.hide();
  }

  tickHandle = setInterval(tick, 250);

  app.on("activate", showWindow);
});

app.on("before-quit", () => {
  isQuitting = true;
  saveState();
});

app.on("window-all-closed", () => {
  // The menu-bar app remains alive until the user explicitly quits.
});

app.on("will-quit", () => {
  if (tickHandle) clearInterval(tickHandle);
});
