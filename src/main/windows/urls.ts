import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserWindow } from 'electron';

const here = path.dirname(fileURLToPath(import.meta.url));

export const preloadPath = path.join(here, '../preload/index.mjs');

/** In dev the three renderers are pages on one Vite server; in production they are built files. */
export function loadRenderer(window: BrowserWindow, page: 'index' | 'hud' | 'celebration'): void {
  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (devServer) {
    void window.loadURL(`${devServer}/${page === 'index' ? '' : `${page}.html`}`);
  } else {
    void window.loadFile(path.join(here, `../renderer/${page}.html`));
  }
}
