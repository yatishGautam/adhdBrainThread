/**
 * The calendar, from the server when it answers and from disk when it does not.
 *
 * ## Why both
 *
 * The projection — which blocks count as work, how a session gets matched to the block it paid
 * off, what a day's totals are — is a decision, and three clients making it separately is how the
 * same Tuesday ends up reading differently on the laptop and the phone. So the server composes
 * it (`GET /calendar`) and is the authority.
 *
 * But ARCHITECTURE.md §1 is not negotiable: this app draws its week with the network off. Every
 * record the endpoint reads already arrives here through sync, so `@shared/calendar.ts` builds
 * the identical projection from local files, ported rule for rule with the tests.
 *
 * **The local build is what the UI actually renders, and it is never skipped.** It is computed
 * first and returned first; the request goes out alongside and replaces it only if it comes back
 * different. That ordering is the whole design. Fetching first and falling back on failure sounds
 * equivalent and is not — it makes every calendar paint wait on a timeout when the wifi is
 * captive-portalled, which is precisely the case §1 exists for. Nothing on screen ever waits for
 * this service to reach a server.
 *
 * Signed out, the server half is skipped entirely and the local build is the whole answer. That
 * is not a degraded mode: the app works signed out, and so does the calendar.
 */
import {
  buildCalendar,
  detailFor,
  maxDaysFor,
  type Calendar,
  type CalendarDetail,
  type CalendarScope,
} from "@shared/calendar.js";
import { COLLECTION } from "../storage/Store.js";
import type { MindfulSession } from "@shared/domain.js";
import { addLocalDays, diffLocalDays } from "@shared/time.js";
import { weekKeyOf } from "@shared/week.js";
import type { Database } from "../storage/Database.js";
import { ApiError } from "./ApiClient.js";
import type { AuthService } from "./AuthService.js";

export interface CalendarRequest {
	from: string;
	to: string;
	/** Chooses the detail level. A month grid renders dots and does not need every block. */
	scope: CalendarScope;
}

/**
 * A calendar, and where it came from.
 *
 * `source` is not decoration. A week built from local files while signed out is complete and
 * correct; one built locally *because a request failed* may be missing what another device did
 * this morning. The UI says which, quietly, rather than pretending the two are the same.
 */
export interface CalendarResult {
	calendar: Calendar;
	source: "server" | "local";
	/** Set when the server was tried and could not answer. Written to be shown unedited. */
	note?: string;
}

export class CalendarService {
	constructor(
		private readonly db: Database,
		private readonly auth: AuthService,
	) {}

	/**
	 * The local answer, always available, never blocked on anything.
	 *
	 * This is what a view renders on first paint and what it keeps if the network is not there.
	 */
	async local(request: CalendarRequest): Promise<Calendar> {
		const { from, to } = clampRange(request);
		const detail = detailFor(request.scope);
		const settings = this.db.settings.get();

		// Week keys rather than a date range: `WeekPlan.fromDate` is the window a run planned, so
		// a Monday-to-Wednesday range would find no run for a week planned on the Thursday.
		const weekKeys = weekKeysBetween(from, to);

		const [plans, sessions, days, goals, threads, weekPlans, sits] = await Promise.all([
			this.db.plans.range(from, to),
			this.db.sessions.inLocalDateRange(from, to),
			this.db.days.range(from, to),
			this.db.goals.list(),
			this.db.threads.list(),
			this.db.plans.weeksFor(weekKeys),
			this.sits(from, to),
		]);

		return buildCalendar(
			{
				from,
				to,
				timezone: settings.timezone,
				plans,
				sessions,
				sits,
				days,
				weekPlans,
				goals: goals.filter((goal) => weekKeys.includes(goal.weekKey)),
				// Every thread, done ones included: a session on a finished thread still needs its
				// title, and `activeList()` would render it as a bare "Focus".
				threads: threads.map((thread) => ({ id: thread.id, title: thread.title })),
			},
			detail,
		);
	}

	/**
	 * The server's copy, or null.
	 *
	 * Null every time it cannot be had — signed out, offline, rate limited, anything. There is no
	 * error path here on purpose: the caller already holds a complete local answer, so a failure
	 * to reach the server is not a failure to produce a calendar, and treating it as one would
	 * put an error banner over a week that is perfectly readable.
	 */
	async remote(request: CalendarRequest): Promise<CalendarResult | null> {
		const token = this.auth.currentToken();
		if (!token) return null;

		const { from, to } = clampRange(request);
		try {
			const calendar = await this.auth.api.calendar(
				token,
				from,
				to,
				detailFor(request.scope),
			);
			return { calendar, source: "server" };
		} catch (error: unknown) {
			// A 401 still signs the app out — that is the one condition meaning the token is gone
			// rather than the network being unreliable, and `AuthService` owns that decision.
			// Everything else is swallowed: the caller already holds a complete local calendar.
			if (error instanceof ApiError && error.isUnauthorized) {
				await this.auth.handleUnauthorized();
			}
			return null;
		}
	}

	/**
	 * Sits, read straight off the collection.
	 *
	 * There is no `MindfulRepo`: sits are recorded on the phone and this app only ever receives
	 * them through sync, so nothing here has ever needed to write one. Reading them for the
	 * calendar does not change that, and inventing a repository for one filtered read would.
	 */
	private async sits(from: string, to: string): Promise<MindfulSession[]> {
		const all = await this.db.store
			.collection<MindfulSession>(COLLECTION.mindful)
			.all();
		return all.filter(
			(sit) => !sit.deletedAt && sit.localDate >= from && sit.localDate <= to,
		);
	}
}

/**
 * Every ISO week key the range touches.
 *
 * Walks by seven days rather than deriving keys from the endpoints, so a range spanning a year
 * boundary picks up `2026-W53` between `2026-W52` and `2027-W01` instead of skipping it — the
 * calendar year and the ISO week-numbering year disagree there. Mirrors `weekKeysBetween` on the
 * server, which exists for the same reason.
 */
export function weekKeysBetween(from: string, to: string): string[] {
	const keys: string[] = [];
	for (let date = from; date <= to; date = addLocalDays(date, 7)) {
		const key = weekKeyOf(date);
		if (!keys.includes(key)) keys.push(key);
	}
	const last = weekKeyOf(to);
	if (to >= from && !keys.includes(last)) keys.push(last);
	return keys;
}

/**
 * Hold the range inside what the server would accept.
 *
 * Clamped here rather than left to fail there, because the two halves must ask the same
 * question: a local build over 90 days next to a 400 from the API would leave the UI showing a
 * range it then could never refresh.
 */
function clampRange(request: CalendarRequest): { from: string; to: string; detail: CalendarDetail } {
	const detail = detailFor(request.scope);
	const limit = maxDaysFor(detail);
	const from = request.from <= request.to ? request.from : request.to;
	const to = request.from <= request.to ? request.to : request.from;
	const span = diffLocalDays(from, to) + 1;
	return { from, to: span > limit ? addLocalDays(from, limit - 1) : to, detail };
}
