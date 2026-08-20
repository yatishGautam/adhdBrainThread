/**
 * The HTTP half of the account. Nothing here touches disk or Electron — it is a thin, typed
 * wrapper over the endpoints in the backend's API.md, so it can be pointed at a local server
 * in development and unit tested without a browser window.
 *
 * Every message it throws is written to be shown to a user unedited. The renderer does not get
 * to interpret status codes; by the time an error reaches it, it is a sentence.
 */
import type { Account } from "@shared/auth.js";
import type { Calendar, CalendarDetail } from "@shared/calendar.js";
import type { DayPlanRequest, PlanRunState, WeekPlanAccepted, WeekPlanRequest } from "@shared/planner.js";
import type { PullResponse, PushResponse, WireOut } from "../sync/wire.js";

/** A response the server actually sent. `status` is the HTTP code. */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}

	/** The token is gone or expired — the only condition that signs a user out. */
	get isUnauthorized(): boolean {
		return this.status === 401;
	}
}

/** No response at all: no network, DNS failure, TLS failure, timeout. Never signs anyone out. */
export class NetworkError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NetworkError";
	}
}

export interface AuthResult {
	user: { id: string; email: string };
	token: string;
}

const TIMEOUT_MS = 15_000;
/** A first sync moves years of records, not a login form. */
const SYNC_TIMEOUT_MS = 60_000;
/**
 * Planning is two short requests now, not one long one: start the run, then poll. The old
 * 4-minute timeout is gone with the connection it was holding open.
 */
const PLAN_TIMEOUT_MS = 20_000;
/** Bigger than a form post, smaller than a first sync. Nothing on screen waits for it. */
const CALENDAR_TIMEOUT_MS = 30_000;
/**
 * Someone is watching this one. A health check that takes fifteen seconds to give up has
 * already answered the question it was asked, so it gives up sooner than anything else here.
 */
const HEALTH_TIMEOUT_MS = 5_000;

export class ApiClient {
	constructor(private baseUrl: string) {}

	setBaseUrl(url: string): void {
		this.baseUrl = normaliseUrl(url);
	}

	get url(): string {
		return this.baseUrl;
	}

	register(
		email: string,
		password: string,
		timezone: string,
	): Promise<AuthResult> {
		return this.request<AuthResult>("POST", "/auth/register", {
			body: { email, password, timezone },
		});
	}

	login(email: string, password: string): Promise<AuthResult> {
		return this.request<AuthResult>("POST", "/auth/login", {
			body: { email, password },
		});
	}

	logout(token: string): Promise<void> {
		return this.request<void>("POST", "/auth/logout", { token });
	}

	me(token: string): Promise<Account> {
		return this.request<Account>("GET", "/auth/me", { token });
	}

	deleteAccount(token: string): Promise<void> {
		return this.request<void>("DELETE", "/auth/account", { token });
	}

	// ------------------------------------------------------------------- sync

	/** Everything past the cursor, tombstones included. `since=0` is a full first sync. */
	pull(token: string, since: number): Promise<PullResponse> {
		return this.request<PullResponse>("GET", `/sync?since=${since}`, { token });
	}

	push(token: string, body: WireOut): Promise<PushResponse> {
		return this.request<PushResponse>("POST", "/sync", { token, body });
	}

	// ---------------------------------------------------------------- planner

	/**
	 * Ask the server to start planning the rest of the week.
	 *
	 * The key lives there, not here — one key, one bill, one prompt, and a phone that cannot hold
	 * a key at all. This returns as soon as the run starts; the plan itself arrives through sync,
	 * on every signed-in device rather than only this one. Poll `planStatus` to know when to stop
	 * saying "planning…".
	 */
	planWeek(token: string, body: WeekPlanRequest): Promise<WeekPlanAccepted> {
		return this.request<WeekPlanAccepted>("POST", "/plan/week", { token, body });
	}

	/** Replan the rest of today, from `fromTime`. Same 202-then-sync contract as the week. */
	planDay(token: string, body: DayPlanRequest): Promise<WeekPlanAccepted> {
		return this.request<WeekPlanAccepted>("POST", "/plan/day", { token, body });
	}

	/** The coach. Same 202-then-sync contract; poll `planStatus` like any other run. */
	insight(
		token: string,
		body: { localDate: string; scope: "day" | "week" },
	): Promise<{ periodKey: string; startedAt: string }> {
		return this.request<{ periodKey: string; startedAt: string }>("POST", "/insight", {
			token,
			body,
		});
	}

	planStatus(token: string): Promise<PlanRunState> {
		return this.request<PlanRunState>("GET", "/plan/status", { token });
	}

	/**
	 * Is the server up? The one call here that carries no token and needs no account — being
	 * signed out is not the same as being offline, and the answer is the same either way.
	 */
	health(): Promise<{ ok: boolean; at?: string }> {
		return this.request<{ ok: boolean; at?: string }>("GET", "/health");
	}

	// --------------------------------------------------------------- calendar

	/**
	 * The server's copy of a stretch of calendar.
	 *
	 * A read, and one nothing on screen waits for — `CalendarService` renders the local build
	 * first and lets this replace it when it arrives. That is why it is safe for this to be the
	 * one call that can quietly do nothing.
	 *
	 * `detail=summary` drops the per-day entry lists and keeps the counts, which is what a month
	 * grid renders. Asking for `full` over a month is a 400 from the server rather than a slow
	 * success, so the caller clamps the range before it gets here.
	 */
	calendar(
		token: string,
		from: string,
		to: string,
		detail: CalendarDetail = "full",
	): Promise<Calendar> {
		const query = new URLSearchParams({ from, to, detail });
		return this.request<Calendar>("GET", `/calendar?${query.toString()}`, { token });
	}

	private async request<T>(
		method: string,
		path: string,
		options: { body?: unknown; token?: string } = {},
	): Promise<T> {
		const headers: Record<string, string> = {};
		if (options.body !== undefined) headers["content-type"] = "application/json";
		if (options.token) headers.authorization = `Bearer ${options.token}`;

		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}${path}`, {
				method,
				headers,
				body: options.body === undefined ? undefined : JSON.stringify(options.body),
				signal: AbortSignal.timeout(timeoutFor(path)),
			});
		} catch (error: unknown) {
			throw new NetworkError(unreachable(this.baseUrl, error));
		}

		if (!response.ok) {
			throw new ApiError(response.status, await describe(response, path));
		}

		// 204s and the endpoints whose body we ignore.
		const text = await response.text();
		if (!text) return undefined as T;
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new ApiError(response.status, "The server sent a reply this app could not read.");
		}
	}
}

function timeoutFor(path: string): number {
	if (path.startsWith("/plan")) return PLAN_TIMEOUT_MS;
	if (path.startsWith("/sync")) return SYNC_TIMEOUT_MS;
	// A month of calendar is a bigger read than a login and a smaller one than a first sync.
	// It gets its own budget rather than the 15s default because nothing waits on it anyway —
	// a slow answer that eventually lands still beats a timeout the user never learns about.
	if (path.startsWith("/health")) return HEALTH_TIMEOUT_MS;
	if (path.startsWith("/calendar")) return CALENDAR_TIMEOUT_MS;
	return TIMEOUT_MS;
}

/**
 * A trailing slash here produces `//auth/login`, which some proxies answer with a redirect the
 * bearer header does not survive. Cheaper to fix once, here.
 */
export function normaliseUrl(url: string): string {
	return url.trim().replace(/\/+$/, "");
}

function unreachable(baseUrl: string, error: unknown): string {
	const timedOut = error instanceof Error && error.name === "TimeoutError";
	const host = hostOf(baseUrl);
	return timedOut
		? `${host} did not answer in time. Your work is saved locally either way.`
		: `Could not reach ${host}. Check your connection — your work is saved locally either way.`;
}

export function hostOf(baseUrl: string): string {
	try {
		return new URL(baseUrl).host;
	} catch {
		return baseUrl;
	}
}

/**
 * Status → sentence. The login 401 says nothing about which half was wrong, on purpose: the
 * server does not know either, and guessing would be a hint to whoever is guessing passwords.
 */
async function describe(response: Response, path: string): Promise<string> {
	const fromServer = await serverMessage(response);
	switch (response.status) {
		case 400:
			return fromServer ?? "That does not look right — check the email and password.";
		case 401:
			return path === "/auth/login"
				? "Email or password is wrong."
				: "Your session has expired. Sign in again.";
		case 409:
			return "That email already has an account. Sign in instead.";
		case 413:
			return "That batch was too large for the server. It will be sent in smaller pieces.";
		case 429:
			return "Too many attempts. Wait a few minutes and try again.";
		default:
			if (response.status >= 500) {
				return "The server is having trouble. Nothing was lost — try again shortly.";
			}
			return fromServer ?? `The server refused that (${response.status}).`;
	}
}

async function serverMessage(response: Response): Promise<string | null> {
	try {
		const body = (await response.json()) as { error?: unknown };
		if (typeof body.error !== "string" || !body.error) return null;
		return body.error.charAt(0).toUpperCase() + body.error.slice(1);
	} catch {
		return null;
	}
}
