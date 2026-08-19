/**
 * These talk to a real backend, and skip themselves when none is reachable — so the suite still
 * passes on a laptop with nothing running.
 *
 *   cd ../adhd-webapp && npm run dev:up && npm run dev     # postgres on 55432, API on 8099
 *   cd ../focusbar-pomodoro && ADHD_TEST_API=http://localhost:8099 npm test
 *
 * They exist because every other test in this repo proves the client agrees with itself. A
 * hand-written fixture of a 409 body decodes perfectly forever, including when the server never
 * sends that shape.
 *
 * Registration is rate limited to five per hour, and this file spends two of them, so a tight
 * loop of reruns will start seeing 429s. Restart the API — the limiter counts in memory.
 */
import { describe, expect, it } from 'vitest';
import { ApiClient, ApiError, NetworkError, normaliseUrl } from './ApiClient.js';

const API = process.env.ADHD_TEST_API;
const PASSWORD = 'correct-horse-battery';

function uniqueEmail(): string {
  return `desktop-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

describe('normaliseUrl', () => {
  it('drops trailing slashes, which would otherwise produce //auth/login', () => {
    expect(normaliseUrl('https://api.example.com/')).toBe('https://api.example.com');
    expect(normaliseUrl('  https://api.example.com///  ')).toBe('https://api.example.com');
  });
});

describe('a server that is not there', () => {
  it('is a NetworkError, never an ApiError — nothing about the session is known', async () => {
    // Port 1 is reserved and nothing listens on it, so this fails at connect.
    const client = new ApiClient('http://127.0.0.1:1');
    await expect(client.login('someone@example.com', PASSWORD)).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('health', () => {
  it('fails as a NetworkError when nothing is listening, so the light can go red without signing anyone out', async () => {
    const client = new ApiClient('http://127.0.0.1:1');
    await expect(client.health()).rejects.toBeInstanceOf(NetworkError);
  });
});

describe.skipIf(!API)('against a real backend', () => {
  const client = new ApiClient(API as string);

  it('registers, identifies, signs in again, and deletes', async () => {
    const email = uniqueEmail();

    const registered = await client.register(email, PASSWORD, 'Europe/London');
    expect(registered.token).toBeTruthy();
    expect(registered.user.email).toBe(email);

    const me = await client.me(registered.token);
    expect(me.email).toBe(email);
    expect(me.timezone).toBe('Europe/London');

    // A second sign-in is a second session, not a replacement for the first.
    const signedIn = await client.login(email, PASSWORD);
    expect(signedIn.token).toBeTruthy();
    expect(signedIn.user.id).toBe(registered.user.id);

    await client.deleteAccount(signedIn.token);
    await expect(client.me(signedIn.token)).rejects.toMatchObject({ status: 401 });
  });

  it('refuses an email that already has an account, and says which case it is', async () => {
    const email = uniqueEmail();
    const first = await client.register(email, PASSWORD, 'Europe/London');
    try {
      await expect(client.register(email, PASSWORD, 'Europe/London')).rejects.toMatchObject({
        status: 409,
        message: 'That email already has an account. Sign in instead.',
      });
    } finally {
      await client.deleteAccount(first.token);
    }
  });

  it('gives one message for a wrong password, saying nothing about which half was wrong', async () => {
    await expect(client.login(uniqueEmail(), 'not-the-password')).rejects.toMatchObject({
      status: 401,
      message: 'Email or password is wrong.',
    });
  });

  it('answers /health without a token — being signed out is not the same as being offline', async () => {
    const health = await client.health();
    expect(health.ok).toBe(true);
  });

  it('treats a token the server does not know as expired, and only that as signed out', async () => {
    const error = await client.me('not-a-real-token').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isUnauthorized).toBe(true);
  });

  it('rejects a password under the server minimum before creating anything', async () => {
    await expect(client.register(uniqueEmail(), 'short', 'Europe/London')).rejects.toMatchObject({
      status: 400,
    });
  });
});
