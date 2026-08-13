/**
 * The celebration overlay. Click-through always, on every monitor, and hard-capped at 6 seconds
 * regardless of what the pack reports — a stuck full-screen overlay is the worst bug this app
 * can ship.
 *
 * One window per display (§7): a celebration that only lands on the primary monitor is invisible
 * to anyone whose work actually happens on the second one.
 */
import { BrowserWindow, screen } from 'electron';
import { CELEBRATION_HARD_TIMEOUT_MS } from '@shared/constants.js';
import type { CelebrationCue } from '@shared/ipc/channels.js';
import { loadRenderer, preloadPath } from './urls.js';

export class CelebrationOverlay {
  private windows = new Map<number, BrowserWindow>();
  private timeout: ReturnType<typeof setTimeout> | null = null;
  /** Dedupe guard: overlapping triggers must not stack overlays (§7). */
  private playing = false;

  private ensure(display: Electron.Display): BrowserWindow {
    const existing = this.windows.get(display.id);
    if (existing && !existing.isDestroyed()) return existing;

    const window = new BrowserWindow({
      transparent: true,
      frame: false,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      focusable: false,
      fullscreenable: false,
      show: false,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    window.setIgnoreMouseEvents(true);
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    loadRenderer(window, 'celebration');

    this.windows.set(display.id, window);
    return window;
  }

  play(cue: CelebrationCue): void {
    // A thread completed by finishing its last session fires twice within a tick; show one.
    if (this.playing) return;
    this.playing = true;

    for (const display of screen.getAllDisplays()) {
      const window = this.ensure(display);
      window.setBounds(display.bounds);
      // Re-asserted on every play: a renderer crash must never leave input blocked.
      window.setIgnoreMouseEvents(true);
      window.showInactive();
      window.webContents.send('celebration:play', cue);
    }

    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.stop(), CELEBRATION_HARD_TIMEOUT_MS);
  }

  stop(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.playing = false;
    for (const window of this.windows.values()) {
      if (window.isDestroyed()) continue;
      window.webContents.send('celebration:stop');
      window.hide();
    }
  }

  destroy(): void {
    this.stop();
    for (const window of this.windows.values()) {
      if (!window.isDestroyed()) window.destroy();
    }
    this.windows.clear();
  }
}

/** The display the HUD is currently on. Kept for callers that want to follow it. */
export function hudDisplay(hud: BrowserWindow | null): Electron.Display {
  if (!hud || hud.isDestroyed()) return screen.getPrimaryDisplay();
  const [x, y] = hud.getPosition();
  return screen.getDisplayNearestPoint({ x: x ?? 0, y: y ?? 0 });
}
