/**
 * The celebration overlay. Click-through always, and hard-capped at 6 seconds regardless of
 * what the pack reports — a stuck full-screen overlay is the worst bug this app can ship.
 */
import { BrowserWindow } from 'electron';
import { CELEBRATION_HARD_TIMEOUT_MS } from '@shared/constants.js';
import type { CelebrationCue } from '@shared/ipc/channels.js';
import { displayContainingHud } from './hudWindow.js';
import { loadRenderer, preloadPath } from './urls.js';

export class CelebrationOverlay {
  private window: BrowserWindow | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly hud: () => BrowserWindow | null) {}

  /** Created lazily on the first celebration, then hidden and reused. */
  private ensure(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;

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

    this.window = window;
    return window;
  }

  play(cue: CelebrationCue): void {
    const window = this.ensure();
    window.setBounds(displayContainingHud(this.hud()).bounds);
    // Re-asserted on every play: a renderer crash must never leave input blocked.
    window.setIgnoreMouseEvents(true);
    window.showInactive();
    window.webContents.send('celebration:play', cue);

    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.stop(), CELEBRATION_HARD_TIMEOUT_MS);
  }

  stop(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('celebration:stop');
      this.window.hide();
    }
  }

  destroy(): void {
    this.stop();
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }
}
