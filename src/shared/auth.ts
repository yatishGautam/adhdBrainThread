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
	/**
	 * Whether the server this account lives on can generate plans — that is, whether it has an
	 * API key configured. A property of the deployment, not of the account, and absent entirely
	 * from a backend deployed before the week planner existed.
	 */
	plannerAvailable?: boolean;
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
	/**
	 * Only used when creating an account. It is stored as the profile's display name and synced
	 * to the other devices, so the phone greets you by the same name this app does.
	 */
	displayName?: string;
}

/**
 * Which flow a mailed code turned out to belong to. The server decides this by looking the
 * address up, and only tells us once the code comes back — so knowing it means the mailbox was
 * read, and there is nothing to leak by acting on it.
 */
export type EmailPurpose = "signup" | "reset";

/**
 * What `/auth/email/start` answers, and it answers exactly this whatever happened: address
 * registered or not, hourly cap hit or not, mail sent or not. Do not branch the UI on it and do
 * not report "no account with that address" — the endpoint does not know, deliberately.
 */
export interface EmailStartResult {
	ok: true;
	/** `"log"` on a backend with no mail configured, where the code goes to the server log. */
	delivery: "email" | "log";
}

/** A correct code, traded for one password write. */
export interface EmailVerifyResult {
	ticket: string;
	purpose: EmailPurpose;
}

/** Six digits. Spaces and dashes are stripped server-side, so paste-from-notification works. */
export const CODE_LENGTH = 6;

/** The server's own rule, repeated here so the form can say so before making the round trip. */
export const MIN_PASSWORD_LENGTH = 10;

export const DEFAULT_SERVER_URL = "https://api.adhd.yatishgautam.com";
