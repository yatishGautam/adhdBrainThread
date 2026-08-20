/**
 * The tap on the shoulder at each block's start.
 *
 * The plan already answers "what should I be doing right now" — this makes the answer arrive
 * on its own instead of waiting to be looked up. A minute-grained ticker watches today's plan,
 * and when a block's start crosses the clock it raises the HUD and posts a notification whose
 * click lands on the Daily page with that block in view.
 *
 * Two rules keep it a coach rather than a nag. Nothing fires while a session is running — an
 * interruption mid-focus costs more than any reminder is worth, and the block most likely to
 * be starting is the one already being worked. And a wake from sleep only fires blocks from
 * the last few minutes: a laptop opened at 15:00 announcing the 09:00, 10:30 and 13:00 blocks
 * in a burst would teach the user to dismiss all of them forever.
 */
import type { PlanBlock } from "@shared/domain.js";
import type { Database } from "../storage/Database.js";
import type { SessionService } from "./SessionService.js";

/** How far back a tick will look. Anything older is history, not a reminder. */
const STALE_MINUTES = 5;

export interface BlockNudge {
	localDate: string;
	block: PlanBlock;
}

export class NowService {
	private timer: ReturnType<typeof setInterval> | null = null;
	private lastMinute: number | null = null;

	constructor(
		private readonly db: Database,
		private readonly sessions: SessionService,
		private readonly onNudge: (nudge: BlockNudge) => void,
	) {}

	start(): void {
		if (this.timer) return;
		this.lastMinute = this.minuteOfDay();
		// 20s rather than 60s so a block start is announced within moments of its minute, not
		// up to a whole minute late. Ticks inside the same minute return immediately.
		this.timer = setInterval(() => void this.tick().catch(() => {}), 20_000);
		this.timer.unref?.();
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	private async tick(): Promise<void> {
		const settings = this.db.settings.get();
		if (!settings.nudgesEnabled) return;

		const now = this.minuteOfDay();
		let last = this.lastMinute ?? now;
		this.lastMinute = now;
		if (now === last) return;

		// A sleep gap longer than the stale window is clamped: catch the block that just
		// started, let the morning go.
		if (minutesBetween(last, now) > STALE_MINUTES) last = (now - STALE_MINUTES + 1440) % 1440;

		const plan = await this.db.plans.get(this.db.clock.today());
		if (!plan) return;

		// Mid-session, the answer to "what should you be doing" is: what you are doing.
		if (await this.sessions.state()) return;

		for (const block of plan.blocks) {
			if (block.kind === "buffer") continue;
			if (!crossed(last, now, toMinutes(block.start))) continue;
			this.onNudge({ localDate: plan.localDate, block });
		}
	}

	private minuteOfDay(): number {
		const formatted = new Intl.DateTimeFormat("en-GB", {
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
			timeZone: this.db.settings.get().timezone,
		}).format(new Date());
		return toMinutes(formatted);
	}
}

/** Whether `target` lies in the half-open window (last, now], with midnight wrap. */
function crossed(last: number, now: number, target: number): boolean {
	if (last === now) return false;
	if (last < now) return target > last && target <= now;
	return target > last || target <= now;
}

/** Forward distance from `last` to `now` on a 24h clock. */
function minutesBetween(last: number, now: number): number {
	return (now - last + 1440) % 1440;
}

function toMinutes(time: string): number {
	const [hour = 0, minute = 0] = time.split(":").map(Number);
	return hour * 60 + minute;
}
