/**
 * Account types, shared by main, preload and renderer.
 *
 * The account is deliberately not part of `Settings`: settings are a plain JSON file the user
 * can read, and a session token must never live there. It has its own file, encrypted with the
 * OS keychain — see `AuthService`.
 */

/** The public half of an account. Never carries the token. */
export interface Account {
	id: string;
	email: string;
	displayName: string | null;
	timezone: string;
}

/**
 * What the UI renders. `offline` is not the same as signed out: the token is still held and
 * still valid, the server just could not be reached at the last check. Only a 401 signs you out.
 */
export interface AuthState {
	account: Account | null;
	serverUrl: string;
	offline: boolean;
	/** True while a network call is in flight, so the form can disable itself. */
	busy: boolean;
}

export interface Credentials {
	email: string;
	password: string;
}

/** The server's own rule, repeated here so the form can say so before making the round trip. */
export const MIN_PASSWORD_LENGTH = 10;

export const DEFAULT_SERVER_URL = "https://api.adhd.yatishgautam.com";
