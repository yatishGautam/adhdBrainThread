import type { ScopeDetail } from "@shared/analytics.js";
import { formatDuration, formatHourOfDay } from "@shared/format.js";
import { StatTile } from "./StatTile.js";

/**
 * Plain counts, sitting under the momentum block rather than replacing it. None of this feeds
 * the rolling score — it is the "what did this week actually look like" half of the page, so
 * there is something to learn from even on a week the momentum ring is quiet about.
 */
export function DetailSection({
	detail,
	scopeLabel,
}: {
	detail: ScopeDetail;
	scopeLabel: string;
}): React.JSX.Element {
	const busiest = detail.peakStartHour;

	return (
		<div style={{ marginBottom: 24 }}>
			<SectionLabel>This {scopeLabel}</SectionLabel>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(4, 1fr)",
					gap: 12,
					marginBottom: 20,
				}}
			>
				<StatTile label="Steps completed" value={String(detail.stepsCompleted)} />
				<StatTile
					label="Average block"
					value={detail.avgSessionMs > 0 ? formatDuration(detail.avgSessionMs) : "—"}
				/>
				<StatTile
					label="Longest block"
					value={detail.longestSessionMs > 0 ? formatDuration(detail.longestSessionMs) : "—"}
				/>
				<StatTile
					label="You start around"
					value={busiest === null ? "—" : formatHourOfDay(busiest)}
				/>
			</div>

			{detail.hourStarts.some((count) => count > 0) ? (
				<>
					<SectionLabel>When you start</SectionLabel>
					<HourStrip hours={detail.hourStarts} peak={busiest} />
				</>
			) : null}

			<SectionLabel>All time</SectionLabel>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(4, 1fr)",
					gap: 12,
				}}
			>
				<StatTile label="Days worked" value={String(detail.allTime.daysWorked)} />
				<StatTile label="Focus logged" value={formatDuration(detail.allTime.focusMs)} />
				<StatTile
					label="Threads finished"
					value={String(detail.allTime.threadsCompleted)}
				/>
				<StatTile
					label="Best single day"
					value={
						detail.allTime.bestDayFocusMs > 0
							? formatDuration(detail.allTime.bestDayFocusMs)
							: "—"
					}
				/>
			</div>
		</div>
	);
}

/** 24 bars, one per local hour. Shows the shape of your day without needing an axis. */
function HourStrip({
	hours,
	peak,
}: {
	hours: number[];
	peak: number | null;
}): React.JSX.Element {
	const max = Math.max(...hours, 1);
	return (
		<div style={{ marginBottom: 20 }}>
			<div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 56 }}>
				{hours.map((count, hour) => (
					<div
						key={hour}
						title={`${formatHourOfDay(hour)} — ${count} start${count === 1 ? "" : "s"}`}
						style={{
							flex: 1,
							height: `${Math.max(2, (count / max) * 100)}%`,
							borderRadius: 2,
							background: hour === peak ? "var(--grad-ember)" : "var(--slate)",
							boxShadow: hour === peak ? "0 0 8px rgba(242, 138, 78, 0.45)" : "none",
							opacity: count === 0 ? 0.25 : 1,
						}}
					/>
				))}
			</div>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					fontSize: 10,
					color: "var(--text-faint)",
					marginTop: 4,
				}}
			>
				<span>12am</span>
				<span>6am</span>
				<span>12pm</span>
				<span>6pm</span>
				<span>11pm</span>
			</div>
		</div>
	);
}

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
	return (
		<div
			style={{
				fontSize: 11,
				color: "var(--text-faint)",
				textTransform: "uppercase",
				letterSpacing: "0.05em",
				marginBottom: 10,
			}}
		>
			{children}
		</div>
	);
}
