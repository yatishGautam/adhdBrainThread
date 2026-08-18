import { app, powerMonitor } from 'electron';
import { AppContext } from './AppContext.js';
import { registerHandlers } from './ipc/registerHandlers.js';
import { claimSingleInstance, clearLockFile, writeLockFile } from './services/SingleInstance.js';
import { applyDockIcon } from './windows/appIcon.js';
import { appDataRoot, markQuitting } from './windows/tray.js';

const gotLock = claimSingleInstance(() => {
  // A second instance launched: focus the first one's window instead of opening a duplicate.
  ctx?.openMainWindow();
});

if (!gotLock) {
  app.quit();
}

let ctx: AppContext | null = null;

async function bootstrap(): Promise<void> {
  applyDockIcon();
  const root = appDataRoot();
  await writeLockFile(root);

  ctx = await AppContext.create(root);
  registerHandlers(ctx);

  ctx.setupTray(() => app.quit());
  ctx.openMainWindow();
  ctx.openHud();

  await ctx.checkRecovery();

  // Deliberately not awaited: a signed-in user with no network must still get a window.
  void ctx.auth.revalidate();
  ctx.sync.start();
  ctx.syncNow();

  // Flush points beyond the debounce: window blur is already wired in mainWindow, this covers
  // the OS asking the app to sleep or the session locking.
  powerMonitor.on('suspend', () => void ctx?.db.store.flush());
  powerMonitor.on('lock-screen', () => void ctx?.db.store.flush());
}

app.on('ready', () => {
  if (!gotLock) return;
  void bootstrap();
});

app.on('window-all-closed', () => {
  // The HUD or main window closing is not "all closed" in the usual sense on macOS — the app
  // stays resident as long as a session could still be running. Quitting is explicit only.
});

app.on('before-quit', () => {
  markQuitting();
});

let shuttingDown: Promise<void> | null = null;

app.on('will-quit', (event) => {
  if (!ctx) return;
  if (shuttingDown) return;
  // Quitting the app ends the running session with outcome `ended_early` and flushes storage —
  // give that async work a chance to finish before Electron tears the process down.
  event.preventDefault();
  shuttingDown = ctx
    .shutdown()
    .then(() => clearLockFile(appDataRoot()))
    .catch((error: unknown) => console.error('[shutdown]', error))
    .finally(() => app.exit(0));
});
