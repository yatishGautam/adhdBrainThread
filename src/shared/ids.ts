/**
 * ULIDs, no dependency. 48-bit timestamp + 80 bits of randomness in Crockford base32,
 * which makes them sort lexicographically by creation time — the property shard key ranges
 * are built on. Monotonic within a millisecond so two ids minted in the same tick still order.
 */
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LEN = 10;
const RANDOM_LEN = 16;

let lastTime = -1;
let lastRandom: number[] = [];

function randomChars(): number[] {
  const bytes = new Uint8Array(RANDOM_LEN);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b % ENCODING.length);
}

function bumpRandom(chars: number[]): number[] {
  const next = chars.slice();
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const value = next[i] ?? 0;
    if (value < ENCODING.length - 1) {
      next[i] = value + 1;
      return next;
    }
    next[i] = 0;
  }
  return randomChars();
}

function encodeTime(time: number): string {
  let out = '';
  let remaining = time;
  for (let i = 0; i < TIME_LEN; i += 1) {
    out = ENCODING[remaining % ENCODING.length] + out;
    remaining = Math.floor(remaining / ENCODING.length);
  }
  return out;
}

export function ulid(now = Date.now()): string {
  if (now === lastTime) {
    lastRandom = bumpRandom(lastRandom);
  } else {
    lastTime = now;
    lastRandom = randomChars();
  }
  return encodeTime(now) + lastRandom.map((i) => ENCODING[i]).join('');
}

/** The creation timestamp encoded in a ULID, for "waiting since" style reads. */
export function ulidTime(id: string): number {
  return id
    .slice(0, TIME_LEN)
    .split('')
    .reduce((acc, ch) => acc * ENCODING.length + ENCODING.indexOf(ch), 0);
}
