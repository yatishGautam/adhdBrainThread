/**
 * Notion and plain-URL handling (§6). Pure so both the chip (renderer) and the opener (main)
 * classify a link the same way — a chip that shows the Notion glyph must be a link that main
 * actually tries to hand to the Notion desktop app.
 */

export type LinkKind = 'notion' | 'url' | 'invalid';

export function classifyLink(raw: string): LinkKind {
  const value = raw.trim();
  if (!value) return 'invalid';
  if (value.startsWith('notion://')) return 'notion';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'url';
    const host = url.hostname.toLowerCase();
    if (host === 'notion.so' || host.endsWith('.notion.so') || host.endsWith('notion.site')) {
      return 'notion';
    }
    return 'url';
  } catch {
    return 'invalid';
  }
}

/**
 * The desktop-app attempt for a web Notion link: same URL, `notion://` scheme. Returns null
 * when there is nothing to try, in which case the caller just opens the original.
 */
export function notionDesktopUrl(raw: string): string | null {
  const value = raw.trim();
  if (value.startsWith('notion://')) return value;
  if (classifyLink(value) !== 'notion') return null;
  try {
    const url = new URL(value);
    return `notion://${url.host}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Bare "notion.so/…" or "example.com/x" typed without a scheme still has to open. */
export function normaliseLink(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value}`;
}

/** What the chip shows in place of the raw URL. */
export function linkLabel(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('notion://')) return 'Notion';
  try {
    const url = new URL(value);
    return classifyLink(value) === 'notion' ? 'Notion' : url.hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}
