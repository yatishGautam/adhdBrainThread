import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, nativeImage } from 'electron';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * assets/ sits next to out/ in dev and inside the app bundle in production, so the path is
 * resolved relative to the compiled main bundle either way.
 */
export function appIconPath(): string {
  return path.join(here, '../../assets/icon.png');
}

export function appIcon(): Electron.NativeImage {
  return nativeImage.createFromPath(appIconPath());
}

/**
 * Packaged builds get their icon from electron-builder; this is what makes `npm run dev` show
 * the real icon in the dock instead of the generic Electron one.
 */
export function applyDockIcon(): void {
  if (process.platform !== 'darwin' || !app.dock) return;
  const image = appIcon();
  if (!image.isEmpty()) app.dock.setIcon(image);
}
