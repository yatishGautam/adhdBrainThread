/**
 * Deterministic JSON: sorted keys, 2-space indent, trailing newline.
 * Unstable key order makes git diffs unreadable, and this data directory is meant to be
 * committable and hand-repairable (§4.6 #13).
 */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      out[key] = sortValue(source[key]);
    }
    return out;
  }
  return value;
}

export function serialise(value: unknown): string {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

export function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}
