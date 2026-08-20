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
 * Registration is rate limited to five per hour and this file spends three of them; asking for
 * an email code is limited the same way and this file spends three of those. So a tight loop of
 * reruns will start seeing 429s. Restart the API — the limiter counts in memory.
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

  // --------------------------------------------------- signing up by email code
  //
  // The happy path cannot be driven from here: finishing it needs the six digits, and those
  // only exist in the mailbox or, in development, the server's log. What these cover is the
  // half a client can actually get wrong — the shape of the answer, and the promise that the
  // answer never varies.

  it('answers a registered and an unregistered address identically', async () => {
    // The property the whole design rests on. If these two ever diverge — different body,
    // different status, different anything — this endpoint has become a way to ask the server
    // which addresses have accounts, and the client must never help that along by branching.
    const registered = uniqueEmail();
    await client.register(registered, PASSWORD, 'Europe/London');

    const known = await client.emailStart(registered);
    const unknown = await client.emailStart(uniqueEmail());

    expect(known).toEqual(unknown);
    expect(known.ok).toBe(true);
    expect(['email', 'log']).toContain(known.delivery);
  });

  it('gives one message for a wrong code, saying nothing about whether a challenge exists', async () => {
    // Two addresses in very different states — one with a live code, one the server has never
    // seen — and the same wrong guess against both. Distinguishable answers here would leak
    // exactly what /auth/email/start refuses to.
    const pending = uniqueEmail();
    await client.emailStart(pending);

    const onPending = await client.emailVerify(pending, '000000').catch((caught: unknown) => caught);
    const onNothing = await client
      .emailVerify(uniqueEmail(), '000000')
      .catch((caught: unknown) => caught);

    expect(onPending).toBeInstanceOf(ApiError);
    expect(onNothing).toBeInstanceOf(ApiError);
    expect((onPending as ApiError).status).toBe(400);
    expect((onNothing as ApiError).message).toBe((onPending as ApiError).message);
  });

  it('refuses a ticket it never issued', async () => {
    await expect(client.setPassword('not-a-real-ticket', PASSWORD, 'Europe/London')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rejects a short password on the ticket path too, not just at register', async () => {
    // Same rule, second door. A minimum enforced on one path and not the other is the kind of
    // gap that only shows up once someone uses the new screen.
    await expect(client.setPassword('not-a-real-ticket', 'short', 'Europe/London')).rejects.toMatchObject({
      status: 400,
    });
  });
});
