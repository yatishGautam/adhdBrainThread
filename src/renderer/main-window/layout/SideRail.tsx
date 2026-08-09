import { useMemo } from "react";
import {
	formatCollapsedDate,
	formatCollapsedMonth,
	formatDayNumber,
	formatLocalDate,
	formatMonth,
} from "@shared/format.js";
import { useDayStore, loadDay } from "../stores/dayStore.js";
import { useUiStore } from "../stores/uiStore.js";

/** Grouped by year → month → day. A day that does not exist is not shown — there is no "start a new day" button. */
export function SideRail(): React.JSX.Element {
	const dates = useDayStore((s) => s.dates);
	const viewedDate = useDayStore((s) => s.viewedDate);
	const todayDate = useDayStore((s) => s.todayDate);
	const goToday = useDayStore((s) => s.goToday);
	const collapsed = useUiStore((s) => s.railCollapsed);
	const toggleRail = useUiStore((s) => s.toggleRail);
	const setTab = useUiStore((s) => s.setTab);

	// Today's own row is never mixed into the past-days list — it always shows, even before a
	// Day record exists, and it's what "back to today" navigates to.
	const months = useMemo(
		() => groupByMonth(dates.filter((date) => date !== todayDate)),
		[dates, todayDate],
	);
	const collapsedWidth = 108;
	const onToday = viewedDate === null || viewedDate === todayDate;

	return (
		<div
			style={{
				width: collapsed ? collapsedWidth : 220,
				flexShrink: 0,
				background: "var(--surface)",
				borderRight: "1px solid var(--line)",
				display: "flex",
				flexDirection: "column",
				transition: "width var(--motion-slow) var(--ease-out)",
				overflow: "hidden",
			}}
		>
			<div style={{ display: "flex", justifyContent: "flex-end", padding: 12 }}>
				<button
					onClick={toggleRail}
					title={collapsed ? "Expand" : "Collapse"}
					style={{
						background: "none",
						border: "none",
						color: "var(--text-faint)",
						cursor: "pointer",
						fontSize: 14,
					}}
				>
					{collapsed ? "»" : "«"}
				</button>
			</div>

			<button
				onClick={() => {
					setTab("today");
					goToday();
				}}
				title={formatLocalDate(todayDate)}
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: collapsed ? "center" : "flex-start",
					margin: "0 12px 12px",
					padding: "8px 10px",
					borderRadius: 8,
					border: "1px solid var(--line)",
					background: onToday ? "var(--surface-raised)" : "transparent",
					color: "var(--amber)",
					textAlign: "left",
					cursor: "pointer",
					fontSize: 13,
				}}
			>
				{collapsed ? "•" : "Today"}
				{!collapsed ? (
					<span
						style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1 }}
					>
						{formatLocalDate(todayDate)}
					</span>
				) : null}
			</button>

			<div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
				{!collapsed && months.length === 0 ? (
					<p
						style={{
							fontSize: 11,
							color: "var(--text-faint)",
							padding: "0 8px",
							lineHeight: 1.5,
						}}
					>
						Past days appear here once you&rsquo;ve used them. Days you
						didn&rsquo;t work are never created.
					</p>
				) : null}
				{months.map((month) => (
					<div key={month.key} style={{ marginBottom: 12 }}>
						{!collapsed ? (
							<div
								style={{
									padding: "4px 8px",
									fontSize: 11,
									color: "var(--text-faint)",
									textTransform: "uppercase",
									letterSpacing: "0.04em",
								}}
							>
								{formatMonth(month.key)}
							</div>
						) : (
							<div
								style={{
									padding: "4px 8px",
									fontSize: 11,
									color: "var(--text-faint)",
									textTransform: "uppercase",
									letterSpacing: "0.04em",
									textAlign: "center",
								}}
							>
								{formatCollapsedMonth(month.key)}
							</div>
						)}
						{month.days.map((date) => {
							// Every entry left in this list is, by construction, before today.
							const isPastDate = date < todayDate;
							return (
								<button
									key={date}
									onClick={() => {
										setTab("today");
										void loadDay(date);
									}}
									title={date}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 8,
										width: "100%",
										padding: collapsed ? "8px 6px" : "6px 8px",
										justifyContent: collapsed ? "center" : "flex-start",
										borderRadius: 8,
										border: "none",
										background:
											viewedDate === date
												? "var(--surface-raised)"
												: "transparent",
										color: isPastDate
											? "var(--text-faint)"
											: "var(--text-muted)",
										cursor: "pointer",
										fontSize: 13,
										textAlign: collapsed ? "center" : "left",
									}}
								>
									{!collapsed ? (
										<>
											<span
												className="mono"
												style={{
													width: 24,
													textAlign: "right",
													color: "var(--text-faint)",
												}}
											>
												{formatDayNumber(date)}
											</span>
											<span style={{ whiteSpace: "nowrap" }}>
												{formatLocalDate(date)}
											</span>
										</>
									) : (
										<span style={{ whiteSpace: "nowrap" }}>
											{formatCollapsedDate(date)}
										</span>
									)}
								</button>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}

function groupByMonth(dates: string[]): { key: string; days: string[] }[] {
	const groups = new Map<string, string[]>();
	for (const date of [...dates].sort().reverse()) {
		const key = date.slice(0, 7);
		const list = groups.get(key);
		if (list) list.push(date);
		else groups.set(key, [date]);
	}
	return [...groups.entries()].map(([key, days]) => ({
		key: `${key}-01`,
		days,
	}));
}
