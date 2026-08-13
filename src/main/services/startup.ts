/**
 * Launch at startup (§8), toggled from the sidebar. The OS owns this setting, not settings.json
 * — reading it back from `getLoginItemSettings` is what keeps the toggle honest if the user
 * turns it off in System Settings or Task Manager instead.
 */
import { app } from 'electron';

export function launchesAtStartup(): boolean {
  if (!app.isPackaged) return false;
  return app.getLoginItemSettings().openAtLogin;
}

export function setLaunchAtStartup(enabled: boolean): boolean {
  // In development the executable is Electron itself; registering that would be wrong.
  if (!app.isPackaged) return false;
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
  return launchesAtStartup();
}
