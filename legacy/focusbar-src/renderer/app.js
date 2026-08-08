const ui = {
  timeDisplay: document.querySelector("#timeDisplay"),
  statusDisplay: document.querySelector("#statusDisplay"),
  taskInput: document.querySelector("#taskInput"),
  startButton: document.querySelector("#startButton"),
  resetButton: document.querySelector("#resetButton"),
  skipButton: document.querySelector("#skipButton"),
  todayCount: document.querySelector("#todayCount"),
  cycleCount: document.querySelector("#cycleCount"),
  cycleDots: document.querySelector("#cycleDots"),
  ringProgress: document.querySelector(".ring-progress"),
  modeTabs: [...document.querySelectorAll(".mode-tab")],
  settingsButton: document.querySelector("#settingsButton"),
  settingsPanel: document.querySelector("#settingsPanel"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  hideButton: document.querySelector("#hideButton"),
  settingsInputs: {
    focusMinutes: document.querySelector("#focusMinutes"),
    shortBreakMinutes: document.querySelector("#shortBreakMinutes"),
    longBreakMinutes: document.querySelector("#longBreakMinutes"),
    sessionsBeforeLongBreak: document.querySelector("#sessionsBeforeLongBreak"),
    alwaysOnTop: document.querySelector("#alwaysOnTop"),
    autoStartBreaks: document.querySelector("#autoStartBreaks"),
    autoStartFocus: document.querySelector("#autoStartFocus"),
    sound: document.querySelector("#sound"),
  },
};

const circumference = 2 * Math.PI * 96;
let currentState = null;
let taskSaveHandle = null;
let settingsAreHydrated = false;

function formatTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function modeName(mode) {
  if (mode === "focus") return "focus";
  if (mode === "longBreak") return "long break";
  return "short break";
}

function statusLabel(state) {
  if (state.status === "running") return state.mode === "focus" ? "FOCUSING" : "RECHARGING";
  if (state.status === "paused") return "PAUSED";
  return "READY";
}

function setCycleDots(completed, total) {
  const progress = completed % total;
  ui.cycleDots.innerHTML = "";

  for (let index = 0; index < total; index += 1) {
    const dot = document.createElement("span");
    dot.className = `cycle-dot${index < progress ? " filled" : ""}`;
    ui.cycleDots.append(dot);
  }
}

function hydrateSettings(settings) {
  for (const [key, input] of Object.entries(ui.settingsInputs)) {
    if (input.type === "checkbox") {
      input.checked = Boolean(settings[key]);
    } else {
      input.value = settings[key];
    }
  }
  settingsAreHydrated = true;
}

function render(state) {
  currentState = state;
  document.body.dataset.mode = state.mode;

  ui.timeDisplay.textContent = formatTime(state.remainingMs);
  ui.statusDisplay.textContent = statusLabel(state);
  document.title = `${formatTime(state.remainingMs)} — FocusBar`;

  const progress =
    state.durationMs > 0 ? Math.min(1, Math.max(0, state.remainingMs / state.durationMs)) : 0;
  ui.ringProgress.style.strokeDasharray = String(circumference);
  ui.ringProgress.style.strokeDashoffset = String(circumference * (1 - progress));

  ui.startButton.textContent =
    state.status === "running"
      ? "Pause"
      : state.status === "paused"
        ? `Resume ${modeName(state.mode)}`
        : `Start ${modeName(state.mode)}`;

  ui.modeTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });

  if (document.activeElement !== ui.taskInput) {
    ui.taskInput.value = state.task || "";
  }

  ui.todayCount.textContent = state.todayCompleted;
  const cycleTotal = state.settings.sessionsBeforeLongBreak;
  const cycleProgress = state.completedFocusSessions % cycleTotal;
  ui.cycleCount.textContent = `${cycleProgress}/${cycleTotal}`;
  setCycleDots(state.completedFocusSessions, cycleTotal);

  if (!settingsAreHydrated || !ui.settingsPanel.classList.contains("open")) {
    hydrateSettings(state.settings);
  }
}

async function sendCommand(action) {
  try {
    render(await window.focusBar.command(action));
  } catch (error) {
    console.error(`Timer command failed: ${action}`, error);
  }
}

function openSettings() {
  if (currentState) hydrateSettings(currentState.settings);
  ui.settingsPanel.classList.add("open");
  ui.settingsPanel.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  ui.settingsPanel.classList.remove("open");
  ui.settingsPanel.setAttribute("aria-hidden", "true");
}

async function saveSettings() {
  if (!settingsAreHydrated) return;

  const patch = {};
  for (const [key, input] of Object.entries(ui.settingsInputs)) {
    patch[key] = input.type === "checkbox" ? input.checked : Number(input.value);
  }

  try {
    render(await window.focusBar.updateSettings(patch));
  } catch (error) {
    console.error("Unable to save settings", error);
  }
}

ui.startButton.addEventListener("click", () => {
  sendCommand(currentState?.status === "running" ? "pause" : "start");
});
ui.resetButton.addEventListener("click", () => sendCommand("reset"));
ui.skipButton.addEventListener("click", () => sendCommand("skip"));

ui.modeTabs.forEach((button) => {
  button.addEventListener("click", () => sendCommand(button.dataset.mode));
});

ui.settingsButton.addEventListener("click", openSettings);
ui.closeSettingsButton.addEventListener("click", closeSettings);
ui.hideButton.addEventListener("click", () => window.focusBar.hideWindow());

ui.taskInput.addEventListener("input", () => {
  clearTimeout(taskSaveHandle);
  taskSaveHandle = setTimeout(() => {
    window.focusBar.setTask(ui.taskInput.value);
  }, 350);
});

ui.taskInput.addEventListener("blur", () => {
  clearTimeout(taskSaveHandle);
  window.focusBar.setTask(ui.taskInput.value);
});

Object.values(ui.settingsInputs).forEach((input) => {
  input.addEventListener("change", saveSettings);
});

document.addEventListener("keydown", (event) => {
  const typing =
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target.isContentEditable;

  if (event.key === "Escape" && ui.settingsPanel.classList.contains("open")) {
    closeSettings();
    return;
  }

  if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.code === "Space") {
    event.preventDefault();
    sendCommand(currentState?.status === "running" ? "pause" : "start");
  } else if (event.key.toLowerCase() === "r") {
    sendCommand("reset");
  } else if (event.key.toLowerCase() === "s") {
    sendCommand("skip");
  }
});

window.focusBar.onState(render);
window.focusBar.getState().then(render).catch(console.error);
