import { useEffect, useMemo, useState } from "react";
import {
	formatCollapsedDate,
	formatCollapsedMonth,
	formatDayNumber,
	formatLocalDate,
	formatMonth,
	isWeekend,
} from "@shared/format.js";
import { useDayStore, loadDay } from "../stores/dayStore.js";
import { useUiStore } from "../stores/uiStore.js";
import { useAuthStore } from "../stores/authStore.js";

/**
 * Grouped year → month → day (§1). A day that does not exist is not shown — there is no
 * "start a new day" button, because a day you didn't work must not exist to feel bad about.
 */
export function SideRail(): React.JSX.Element {
	const dates = useDayStore((s) => s.dates);
	const viewedDate = useDayStore((s) => s.viewedDate);
	const todayDate = useDayStore((s) => s.todayDate);
	const goToday = useDayStore((s) => s.goToday);
	const collapsed = useUiStore((s) => s.railCollapsed);
	const toggleRail = useUiStore((s) => s.toggleRail);
	const setTab = useUiStore((s) => s.setTab);

	// Today's own row is never mixed into the past-days list — it always shows, even before a
	// Day record exists, and it's what "Start Today" navigates to.
	const years = useMemo(
		() => groupByYear(dates.filter((date) => date !== todayDate)),
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
				className="btn-launch"
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: collapsed ? "center" : "flex-start",
					margin: "0 12px 12px",
					padding: "10px 12px",
					borderRadius: 10,
					textAlign: "left",
					cursor: "pointer",
					fontSize: 13,
					fontWeight: 700,
					// Dimmed but still itself when you're already on today — a lit button you
					// just pressed, not a different button.
					opacity: onToday ? 0.92 : 1,
				}}
			>
				{collapsed ? "⚡" : "⚡ Start Today"}
				{!collapsed ? (
					<span
						style={{
							fontSize: 11,
							fontWeight: 500,
							color: "rgba(36, 17, 3, 0.72)",
							marginTop: 1,
						}}
					>
						{formatLocalDate(todayDate)}
					</span>
				) : null}
			</button>

			<div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
				{!collapsed && years.length === 0 ? (
					<p
						style={{
							fontSize: 11,
							color: "var(--text-faint)",
							padding: "0 8px",
							lineHeight: 1.5,
						}}
					>
						Past pages appear here once you&rsquo;ve used them. Days you
						didn&rsquo;t work are never created.
					</p>
				) : null}
				{years.map((year) => (
					<div key={year.key} style={{ marginBottom: 6 }}>
						{!collapsed ? (
							<div
								style={{
									padding: "6px 8px 2px",
									fontSize: 11,
									fontWeight: 600,
									color: "var(--text-muted)",
									letterSpacing: "0.06em",
								}}
							>
								{year.key}
							</div>
						) : null}
						{year.months.map((month) => (
							<div key={month.key} style={{ marginBottom: 10 }}>
								<div
									style={{
										padding: "4px 8px",
										fontSize: 11,
										color: "var(--text-faint)",
										textTransform: "uppercase",
										letterSpacing: "0.04em",
										textAlign: collapsed ? "center" : "left",
									}}
								>
									{collapsed
										? formatCollapsedMonth(month.key)
										: formatMonth(month.key)}
								</div>
								{month.days.map((date) => (
									<DayRow
										key={date}
										date={date}
										collapsed={collapsed}
										selected={viewedDate === date}
										onOpen={() => {
											setTab("today");
											void loadDay(date);
										}}
									/>
								))}
							</div>
						))}
					</div>
				))}
			</div>

			<AccountRow collapsed={collapsed} />
			<StartupToggle collapsed={collapsed} />
		</div>
	);
}

function DayRow({
	date,
	collapsed,
	selected,
	onOpen,
}: {
	date: string;
	collapsed: boolean;
	selected: boolean;
	onOpen: () => void;
}): React.JSX.Element {
	const weekend = isWeekend(date);
	return (
		<button
			onClick={onOpen}
			title={weekend ? `${date} · weekend` : date}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				width: "100%",
				padding: collapsed ? "8px 6px" : "6px 8px",
				justifyContent: collapsed ? "center" : "flex-start",
				borderRadius: 8,
				border: "none",
				background: selected ? "var(--surface-raised)" : "transparent",
				color: "var(--text-faint)",
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
					<span style={{ whiteSpace: "nowrap" }}>{formatLocalDate(date)}</span>
					{/* A Saturday with work on it should not read like a Tuesday. */}
					{weekend ? (
						<span style={{ color: "var(--amber)", fontSize: 11 }}>★</span>
					) : null}
				</>
			) : (
				<span style={{ whiteSpace: "nowrap" }}>
					{formatCollapsedDate(date)}
					{weekend ? " ★" : ""}
				</span>
			)}
		</button>
	);
}

/**
 * The account lives at the bottom of the rail, next to the other things you set once and forget.
 * Not a tab and not a modal on launch: signing in is optional, so it must not look like a step.
 */
function AccountRow({ collapsed }: { collapsed: boolean }): React.JSX.Element {
	const account = useAuthStore((s) => s.account);
	const offline = useAuthStore((s) => s.offline);
	const setTab = useUiStore((s) => s.setTab);

	return (
		<button
			onClick={() => setTab("account")}
			title={account ? `Signed in as ${account.email}` : "Sign in or create an account"}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				margin: "0 12px 8px",
				padding: "8px 10px",
				borderRadius: 8,
				border: "1px solid var(--line)",
				background: "transparent",
				color: "var(--text-faint)",
				cursor: "pointer",
				fontSize: 11,
				textAlign: "left",
				justifyContent: collapsed ? "center" : "flex-start",
				overflow: "hidden",
			}}
		>
			<span
				style={{
					width: 12,
					height: 12,
					borderRadius: 999,
					flexShrink: 0,
					border: `1px solid ${account ? "var(--emerald)" : "var(--line-strong)"}`,
					// Signed in but unreachable is its own state, and it is not a failure —
					// hollow rather than red.
					background: account && !offline ? "var(--emerald)" : "transparent",
				}}
			/>
			{collapsed ? null : (
				<span
					style={{
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{account ? (account.displayName?.trim() || account.email) : "Sign in"}
				</span>
			)}
		</button>
	);
}

/** Launch at startup (§8). Owned by the OS, so the state is read back rather than remembered. */
function StartupToggle({ collapsed }: { collapsed: boolean }): React.JSX.Element | null {
	const [enabled, setEnabled] = useState<boolean | null>(null);

	useEffect(() => {
		void window.thread.invoke["startup:get"](undefined).then(setEnabled);
	}, []);

	if (enabled === null || collapsed) return null;

	return (
		<button
			onClick={() =>
				void window.thread
					.invoke["startup:set"]({ enabled: !enabled })
					.then(setEnabled)
			}
			title="Open this app automatically when you log in"
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				margin: "0 12px 12px",
				padding: "8px 10px",
				borderRadius: 8,
				border: "1px solid var(--line)",
				background: "transparent",
				color: "var(--text-faint)",
				cursor: "pointer",
				fontSize: 11,
				textAlign: "left",
			}}
		>
			<span
				style={{
					width: 12,
					height: 12,
					borderRadius: 3,
					flexShrink: 0,
					border: `1px solid ${enabled ? "var(--emerald)" : "var(--line)"}`,
					background: enabled ? "var(--emerald)" : "transparent",
				}}
			/>
			Launch at startup
		</button>
	);
}

function groupByYear(
	dates: string[],
): { key: string; months: { key: string; days: string[] }[] }[] {
	const years = new Map<string, Map<string, string[]>>();
	for (const date of [...dates].sort().reverse()) {
		const year = date.slice(0, 4);
		const month = date.slice(0, 7);
		const months = years.get(year) ?? new Map<string, string[]>();
		const days = months.get(month) ?? [];
		days.push(date);
		months.set(month, days);
		years.set(year, months);
	}
	return [...years.entries()].map(([key, months]) => ({
		key,
		months: [...months.entries()].map(([month, days]) => ({
			key: `${month}-01`,
			days,
		})),
	}));
}
