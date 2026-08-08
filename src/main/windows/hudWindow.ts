/**
 * The floating timer. Frameless, transparent, always above everything including full-screen
 * apps, and present on every desktop — a HUD you have to go looking for is not a HUD.
 */
import { BrowserWindow, screen } from 'electron';
import { loadRenderer, preloadPath } from './urls.js';

/**
 * Wider than the 360px in the original spec: the control buttons carry text labels rather than
 * bare glyphs, and a button whose meaning you have to remember is a button you stop using.
 */
export const HUD_WIDTH = 340;
export const HUD_HEIGHT = 86;

export interface HudPosition {
  x: number;
  y: number;
}

export function defaultHudPosition(): HudPosition {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.round(workArea.x + workArea.width - HUD_WIDTH - 24),
    y: Math.round(workArea.y + 24),
  };
}

export function createHudWindow(saved: HudPosition | undefined, onMoved: (at: HudPosition) => void): BrowserWindow {
  const position = saved ?? defaultPosition();

  const window = new BrowserWindow({
    width: HUD_WIDTH,
    height: HUD_HEIGHT,
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

  window.setAlwaysOnTop(true, 'floating');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.once('ready-to-show', () => window.show());

  // Position is persisted per run so the HUD reappears where the user parked it.
  window.on('moved', () => {
    const [x, y] = window.getPosition();
    if (typeof x === 'number' && typeof y === 'number') onMoved({ x, y });
  });

  loadRenderer(window, 'hud');
  return window;
}

function defaultPosition(): HudPosition {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.round(workArea.x + workArea.width - HUD_WIDTH - 24),
    y: Math.round(workArea.y + 24),
  };
}

/** The display the HUD is currently on — the celebration overlay follows it, not the primary. */
export function displayContainingHud(hud: BrowserWindow | null): Electron.Display {
  if (!hud || hud.isDestroyed()) return screen.getPrimaryDisplay();
  const [x, y] = hud.getPosition();
  return screen.getDisplayNearestPoint({ x: x ?? 0, y: y ?? 0 });
}
