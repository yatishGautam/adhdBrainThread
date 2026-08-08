import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Menu, Tray, nativeImage, app } from 'electron';
import { formatClock } from '@shared/format.js';

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
  const image = nativeImage.createFromPath(path.join(here, '../../assets/trayTemplate.png'));
  image.setTemplateImage(true);
  const tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('Thread');
  tray.on('click', hooks.onShow);
  return tray;
}

/** The tray reflects the session, so the timer is legible without opening anything. */
export function updateTray(tray: Tray, state: TrayState, hooks: TrayHooks): void {
  const title = state.running ? `${state.paused ? '❙❙' : '●'} ${formatClock(state.remainingMs)}` : '';
  if (process.platform === 'darwin') tray.setTitle(title);
  tray.setToolTip(state.threadTitle ? `Thread — ${state.threadTitle}` : 'Thread');

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: state.threadTitle ?? 'Nothing running', enabled: false },
      { type: 'separator' },
      { label: 'Open Thread', click: hooks.onShow },
      {
        label: state.paused ? 'Resume' : 'Pause',
        enabled: state.running,
        click: hooks.onPauseResume,
      },
      { label: 'End session', enabled: state.running, click: hooks.onEnd },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'Command+Q', click: hooks.onQuit },
    ]),
  );
}

export function markQuitting(): void {
  (globalThis as { __threadQuitting?: boolean }).__threadQuitting = true;
}

export function isQuitting(): boolean {
  return Boolean((globalThis as { __threadQuitting?: boolean }).__threadQuitting);
}

export function appDataRoot(): string {
  return path.join(app.getPath('userData'), 'data');
}
