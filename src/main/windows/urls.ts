import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserWindow } from 'electron';

const here = path.dirname(fileURLToPath(import.meta.url));

export const preloadPath = path.join(here, '../preload/index.mjs');

/**
 * In dev the four renderers are pages on one Vite server; in production they are built files.
 *
 * `search` is a query string the page reads back off `location`. It is how the HUD is told what
 * scale to draw itself at — deliberately not `webContents.setZoomFactor`, whose zoom is stored
 * per *origin* and would therefore shrink the dashboard along with the HUD.
 */
export function loadRenderer(
  window: BrowserWindow,
  page: 'index' | 'hud' | 'celebration' | 'calendar',
  search?: string,
): void {
  const query = search ? `?${search}` : '';
  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (devServer) {
    void window.loadURL(`${devServer}/${page === 'index' ? '' : `${page}.html`}${query}`);
  } else {
    void window.loadFile(path.join(here, `../renderer/${page}.html`), {
      ...(search ? { search } : {}),
    });
  }
}
