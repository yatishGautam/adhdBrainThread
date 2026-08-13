/**
 * Link opening (§6). Everything leaves the app: a link opened inside an Electron window is a
 * browser you did not ask for and cannot log into.
 *
 * Notion links try the desktop app first by rewriting the scheme, then fall back to the browser.
 * `shell.openExternal` resolves even when no handler is registered on some platforms, so the
 * fallback is also armed on a short timer rather than only on rejection.
 */
import { shell } from 'electron';
import { classifyLink, normaliseLink, notionDesktopUrl } from '@shared/links.js';

const DESKTOP_HANDOFF_MS = 1200;

export async function openLink(raw: string): Promise<void> {
  const url = normaliseLink(raw);
  if (!url) return;
  if (classifyLink(url) === 'invalid') return;

  const desktop = notionDesktopUrl(url);
  if (!desktop) {
    await shell.openExternal(url);
    return;
  }

  try {
    await Promise.race([
      shell.openExternal(desktop),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('notion handoff timed out')), DESKTOP_HANDOFF_MS),
      ),
    ]);
  } catch {
    // No Notion desktop app, or it refused the scheme. The web link always works.
    if (desktop !== url) await shell.openExternal(url);
  }
}
