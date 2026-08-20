/**
 * The account, and the only place the session token is ever held.
 *
 * Two rules shape this file:
 *
 *  1. **The token is encrypted with the OS keychain, never written in plain text.** Electron's
 *     `safeStorage` is Keychain on macOS, DPAPI on Windows and the desktop keyring on Linux. If
 *     encryption is not available (a Linux box with no keyring), the token is kept in memory for
 *     this run only and simply not persisted — a plain-text fallback would be worse than asking
 *     the user to sign in again tomorrow.
 *
 *  2. **Nothing here blocks the app.** Signing in is the only thing that waits on a network
 *     call. Boot revalidates the token in the background, and a server that cannot be reached
 *     leaves you signed in and offline, not signed out. Only a 401 clears the token, because
 *     only a 401 means it is actually dead.
 */
import { safeStorage } from "electron";
import path from "node:path";
import type { Account, AuthState, EmailStartResult, EmailVerifyResult } from "@shared/auth.js";
import type { ServerHealth } from "@shared/ipc/channels.js";
import { DEFAULT_SERVER_URL } from "@shared/auth.js";
import { systemTimezone } from "@shared/time.js";
import { atomicWriteFile, readFileIfExists } from "../storage/atomicWrite.js";
import { ApiClient, ApiError, hostOf, normaliseUrl } from "./ApiClient.js";

interface StoredAccount {
	version: 1;
	serverUrl: string;
	account: Account | null;
	/** base64 of the keychain-encrypted token. Absent when there is no session to remember. */
	token?: string;
}

export class AuthService {
	private account: Account | null = null;
	private token: string | null = null;
	private offline = false;
	private busy = false;
	/** The engine pushes and pulls with the same client, so it stays pointed at the same host. */
	api: ApiClient;

	constructor(
		private readonly root: string,
		private readonly onChanged: (state: AuthState) => void,
	) {
		// An env override is what makes `npm run dev` against a local server possible without
		// editing anything; the stored value wins once the user has set one.
		this.api = new ApiClient(normaliseUrl(process.env.ADHD_API_URL || DEFAULT_SERVER_URL));
	}

	private get file(): string {
		return path.join(this.root, "account.json");
	}

	state(): AuthState {
		return {
			account: this.account,
			serverUrl: this.api.url,
			offline: this.offline,
			busy: this.busy,
		};
	}

	/** For the sync engine. Null means there is nothing to push with. */
	currentToken(): string | null {
		return this.token;
	}

	/**
	 * The token was rejected mid-sync. Signing out is the honest response — the alternative is
	 * an app that looks signed in and quietly syncs nothing.
	 */
	async handleUnauthorized(): Promise<void> {
		if (!this.token) return;
		await this.clear();
		this.emit();
	}

	// ------------------------------------------------------------------- boot

	async load(): Promise<void> {
		const raw = await readFileIfExists(this.file);
		if (raw === null) return;

		let stored: StoredAccount;
		try {
			stored = JSON.parse(raw) as StoredAccount;
		} catch {
			// A corrupt account file means signing in again, not a boot failure.
			console.warn("[auth] account.json unreadable — starting signed out");
			return;
		}

		if (stored.serverUrl && !process.env.ADHD_API_URL) {
			this.api.setBaseUrl(stored.serverUrl);
		}
		this.account = stored.account ?? null;
		this.token = stored.token ? decrypt(stored.token) : null;
		if (this.account && !this.token) {
			// The keychain refused — we know who you were, but not how to prove it.
			this.account = null;
		}
	}

	/**
	 * Confirms the stored token is still good, and refreshes the profile. Fire-and-forget from
	 * boot: it must never be awaited on the path to a visible window.
	 */
	async revalidate(): Promise<void> {
		if (!this.token) return;
		try {
			this.account = await this.api.me(this.token);
			this.offline = false;
			await this.persist();
		} catch (error: unknown) {
			if (error instanceof ApiError && error.isUnauthorized) {
				await this.clear();
			} else {
				this.offline = true;
			}
		}
		this.emit();
	}

	// ---------------------------------------------------------------- actions

	async register(email: string, password: string, displayName?: string): Promise<AuthState> {
		const name = displayName?.trim() || null;
		const state = await this.authenticate(
			() => this.api.register(email.trim(), password, systemTimezone()),
			name,
		);
		// The name is a profile field, and the profile only moves through /sync — there is no
		// endpoint that sets it at registration. Best effort on purpose: an account that exists
		// with no name yet is a far better outcome than a sign-up that fails at the last step.
		if (name && this.token) {
			try {
				await this.api.push(this.token, {
					profile: {
						displayName: name,
						timezone: systemTimezone(),
						updatedAt: new Date().toISOString(),
					},
				});
			} catch (error: unknown) {
				console.warn("[auth] the display name will sync on the next round trip", error);
			}
		}
		return state;
	}

	async login(email: string, password: string): Promise<AuthState> {
		return this.authenticate(() => this.api.login(email.trim(), password));
	}

	// ------------------------------------------------- signing up by email code

	/**
	 * Asks the server to mail a code. Signing up and recovering a forgotten password are the
	 * same call: the server looks the address up and decides which mail to send, and tells the
	 * person in their inbox rather than telling us here.
	 *
	 * Nothing about the account changes, so this does not emit a new `AuthState` — it is the one
	 * account call whose answer is not who you are.
	 */
	async emailStart(email: string): Promise<EmailStartResult> {
		this.setBusy(true);
		try {
			return await this.api.emailStart(email.trim());
		} finally {
			this.setBusy(false);
		}
	}

	/** Trades six digits for a one-shot ticket. Still not a sign-in — no token exists yet. */
	async emailVerify(email: string, code: string): Promise<EmailVerifyResult> {
		this.setBusy(true);
		try {
			return await this.api.emailVerify(email.trim(), code);
		} finally {
			this.setBusy(false);
		}
	}

	/**
	 * Spends the ticket and signs in with what comes back. This is where an account is actually
	 * created, so the display-name push mirrors `register` exactly — best effort, because an
	 * account that exists without a name yet beats a sign-up that fails on its last step.
	 *
	 * On a reset there is no name to send and none is sent; the server has just ended every
	 * other session for the account, which is the point of resetting.
	 */
	async setPassword(ticket: string, password: string, displayName?: string): Promise<AuthState> {
		const name = displayName?.trim() || null;
		const state = await this.authenticate(
			() => this.api.setPassword(ticket, password, systemTimezone()),
			name,
		);
		if (name && this.token) {
			try {
				await this.api.push(this.token, {
					profile: {
						displayName: name,
						timezone: systemTimezone(),
						updatedAt: new Date().toISOString(),
					},
				});
			} catch (error: unknown) {
				console.warn("[auth] the display name will sync on the next round trip", error);
			}
		}
		return state;
	}

	/**
	 * Tells the server to burn the token, then forgets it locally either way. A logout that
	 * fails to reach the server must still log you out of this machine — that is the whole
	 * point of pressing it.
	 */
	async logout(): Promise<AuthState> {
		const token = this.token;
		await this.clear();
		this.emit();
		if (token) {
			try {
				await this.api.logout(token);
			} catch {
				/* the local half is what matters; the session expires server-side regardless */
			}
		}
		return this.state();
	}

	/** Irreversible, and the server does the cascade. Local data is untouched and still yours. */
	async deleteAccount(): Promise<AuthState> {
		if (!this.token) return this.state();
		this.setBusy(true);
		try {
			await this.api.deleteAccount(this.token);
			await this.clear();
			return this.state();
		} finally {
			this.setBusy(false);
		}
	}

	/**
	 * Ask the server whether it is there, and time how long it took to say so.
	 *
	 * Deliberately leaves `offline` alone. That flag is what the token check and sync found, and
	 * a probe of an unauthenticated endpoint proves nothing either way about a session — a green
	 * light here with an expired token is a true statement about the server, and quietly
	 * rewriting the account's state from a diagnostic button would make the two disagree.
	 */
	async checkHealth(): Promise<ServerHealth> {
		const host = hostOf(this.api.url);
		const started = Date.now();
		try {
			const body = await this.api.health();
			// A 200 from something that is not this backend is still a reachable host, but it is
			// not the server this app needs, so `ok: false` is taken at its word.
			const online = body?.ok !== false;
			return {
				online,
				host,
				latencyMs: Date.now() - started,
				message: online ? null : `${host} answered, but says it is not healthy.`,
			};
		} catch (error: unknown) {
			// Every message ApiClient throws is already a sentence written for a person.
			return {
				online: false,
				host,
				latencyMs: null,
				message: error instanceof Error ? error.message : `Could not reach ${host}.`,
			};
		}
	}

	async setServerUrl(url: string): Promise<AuthState> {
		const next = normaliseUrl(url) || DEFAULT_SERVER_URL;
		if (next === this.api.url) return this.state();
		// A token is only valid on the server that issued it, so changing servers signs you out.
		await this.clear();
		this.api.setBaseUrl(next);
		await this.persist();
		this.emit();
		return this.state();
	}

	// ---------------------------------------------------------------- private

	private async authenticate(
		call: () => Promise<{ user: { id: string; email: string }; token: string }>,
		displayName: string | null = null,
	): Promise<AuthState> {
		this.setBusy(true);
		try {
			const result = await call();
			this.token = result.token;
			this.account = {
				id: result.user.id,
				email: result.user.email,
				displayName,
				timezone: systemTimezone(),
			};
			this.offline = false;
			await this.persist();
			return this.state();
		} finally {
			this.setBusy(false);
		}
	}

	private async clear(): Promise<void> {
		this.account = null;
		this.token = null;
		this.offline = false;
		await this.persist();
	}

	private async persist(): Promise<void> {
		const encrypted = this.token ? encrypt(this.token) : null;
		const stored: StoredAccount = {
			version: 1,
			serverUrl: this.api.url,
			// Remembering who you are without being able to prove it just produces a signed-in
			// shell that cannot sync, so the pair is written together or not at all.
			account: encrypted ? this.account : null,
			...(encrypted ? { token: encrypted } : {}),
		};
		await atomicWriteFile(this.file, `${JSON.stringify(stored, null, 2)}\n`);
	}

	private setBusy(busy: boolean): void {
		this.busy = busy;
		this.emit();
	}

	private emit(): void {
		this.onChanged(this.state());
	}
}

function encrypt(token: string): string | null {
	if (!safeStorage.isEncryptionAvailable()) {
		console.warn("[auth] no OS keychain — the session will not survive a restart");
		return null;
	}
	return safeStorage.encryptString(token).toString("base64");
}

function decrypt(stored: string): string | null {
	if (!safeStorage.isEncryptionAvailable()) return null;
	try {
		return safeStorage.decryptString(Buffer.from(stored, "base64"));
	} catch {
		// Written by a different user account, or the keychain entry was revoked.
		console.warn("[auth] stored session could not be decrypted — signing out");
		return null;
	}
}
