/** Formatting shared by main (insight copy) and every renderer. */

export function formatClock(ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000));
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * The countdown as it appears in the macOS menu bar.
 *
 * Minutes, not `mm:ss`. The menu bar is a fixed, shared, and on a notched Mac a *small* amount
 * of space: a title that changes width every second makes the system re-flow the whole bar,
 * which is what pushes items in and out behind the overflow chevron. Minutes change sixty times
 * less often and are two or three characters instead of five.
 *
 * Rounded up, so it never reads "0m" while there is still time on the clock.
 */
export function formatTrayCountdown(ms: number): string {
	return `${Math.ceil(Math.max(0, ms) / 60_000)}m`;
}

/** "1h 20m" / "45m" / "2m". Never "0h 0m". */
export function formatDuration(ms: number): string {
	const minutes = Math.round(ms / 60_000);
	if (minutes < 1) return "under a minute";
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return `${rest}m`;
	if (rest === 0) return `${hours}h`;
	return `${hours}h ${rest}m`;
}

export function formatCount(
	value: number,
	singular: string,
	plural = `${singular}s`,
): string {
	return `${value} ${value === 1 ? singular : plural}`;
}

const WEEKDAYS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];
const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

function parts(localDate: string): {
	year: number;
	month: number;
	day: number;
	weekday: number;
} {
	const [year, month, day] = localDate.split("-").map(Number) as [
		number,
		number,
		number,
	];
	return {
		year,
		month,
		day,
		weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
	};
}

export function formatLocalDate(localDate: string): string {
	const { month, day, weekday } = parts(localDate);
	return `${WEEKDAYS[weekday]?.slice(0, 3)} ${day} ${MONTHS[month - 1]?.slice(0, 3)}`;
}

export function formatLongDate(localDate: string): string {
	const { year, month, day, weekday } = parts(localDate);
	return `${WEEKDAYS[weekday]}, ${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatMonth(localDate: string): string {
	const { year, month } = parts(localDate);
	return `${MONTHS[month - 1]} ${year}`;
}

export function formatCollapsedMonth(localDate: string): string {
	const { month } = parts(localDate);
	return MONTHS[month - 1] ?? "";
}

export function formatCollapsedDate(localDate: string): string {
	const { day, weekday } = parts(localDate);
	return `${ordinal(day)} ${WEEKDAYS[weekday]}`;
}

export function formatCalendarHeadline(localDate: string): string {
	const { year, month, day, weekday } = parts(localDate);
	return `${year} · ${MONTHS[month - 1]?.slice(0, 3) ?? ""} · ${ordinal(day)} ${WEEKDAYS[weekday]?.slice(0, 3) ?? ""}`;
}

export function formatDayNumber(localDate: string): string {
	return String(parts(localDate).day);
}

export function formatYear(localDate: string): string {
	return String(parts(localDate).year);
}

/** Weekends get a ★ in the navigator — a Saturday with work on it should read differently. */
export function isWeekend(localDate: string): boolean {
	const { weekday } = parts(localDate);
	return weekday === 0 || weekday === 6;
}

/** "since Aug 4" — how long a carried-forward todo or blocker has been open. */
export function formatSince(localDate: string): string {
	const { month, day } = parts(localDate);
	return `since ${MONTHS[month - 1]?.slice(0, 3)} ${day}`;
}

export function formatHourOfDay(hour: number): string {
	const wrapped = ((hour % 24) + 24) % 24;
	const suffix = wrapped < 12 ? "am" : "pm";
	const display = wrapped % 12 === 0 ? 12 : wrapped % 12;
	return `${display}${suffix}`;
}

function ordinal(value: number): string {
	const suffix = value % 100;
	if (suffix >= 11 && suffix <= 13) return `${value}th`;
	switch (value % 10) {
		case 1:
			return `${value}st`;
		case 2:
			return `${value}nd`;
		case 3:
			return `${value}rd`;
		default:
			return `${value}th`;
	}
}

export function formatTimeOfDay(iso: string): string {
	const date = new Date(iso);
	return date.toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});
}
