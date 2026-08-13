import { useState } from "react";
import type { Day, LogEntry } from "@shared/domain.js";
import { formatTimeOfDay } from "@shared/format.js";
import { EmptyState } from "../../../shared/components/EmptyState.js";
import { Panel } from "./Panel.js";

/**
 * The victory list. Completed focus blocks, finished threads and ticked to-dos write
 * themselves in; anything else goes in by hand with Enter. Deliberately the warmest panel on
 * the page — this is the one you scroll at the end of a day to feel like it counted.
 */
export function LogSection({
	day,
	localDate,
}: {
	day: Day | null;
	localDate: string;
}): React.JSX.Element {
	const [text, setText] = useState("");
	const entries = [...(day?.log ?? [])].sort((a, b) => a.at.localeCompare(b.at));

	const add = async (): Promise<void> => {
		const trimmed = text.trim();
		setText("");
		if (trimmed) await window.thread.invoke["log:add"]({ text: trimmed, localDate });
	};

	return (
		<Panel
			title="Wins"
			subtitle="Everything you finished today. It writes itself — read it back when the day felt like nothing."
			warm
			right={
				entries.length > 0 ? (
					<span
						className="mono"
						style={{ fontSize: 12, fontWeight: 600, color: "var(--amber)", whiteSpace: "nowrap" }}
					>
						{entries.length} today
					</span>
				) : undefined
			}
		>
			{entries.length === 0 ? (
				<EmptyState
					title="No wins yet — the day is young."
					detail="Finish a focus block or tick something off and it lands here on its own."
				/>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
					{entries.map((entry) => (
						<Row key={entry.id} entry={entry} />
					))}
				</div>
			)}

			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
					marginTop: 8,
				}}
			>
					<span className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
						now
					</span>
					<input
						value={text}
						placeholder="Claim a win…"
						onChange={(e) => setText(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && void add()}
					style={{ flex: 1, fontSize: 13, padding: "4px 0" }}
				/>
			</div>
		</Panel>
	);
}

function Row({ entry }: { entry: LogEntry }): React.JSX.Element {
	const [hover, setHover] = useState(false);
	return (
		<div
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "4px 0" }}
		>
			<span
				className="mono"
				style={{ fontSize: 11, color: "var(--text-faint)", flexShrink: 0 }}
			>
				{formatTimeOfDay(entry.at)}
			</span>
			<span style={{ flex: 1, fontSize: 13 }}>{entry.text}</span>
			{hover ? (
				<button
					onClick={() =>
						void window.thread.invoke["log:remove"]({
							localDate: entry.localDate,
							entryId: entry.id,
						})
					}
					title="Remove this line"
					style={{
						background: "none",
						border: "none",
						color: "var(--text-faint)",
						cursor: "pointer",
						fontSize: 12,
					}}
				>
					✕
				</button>
			) : null}
		</div>
	);
}
