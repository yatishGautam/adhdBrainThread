import { useState } from "react";
import type { Blocker } from "@shared/domain.js";
import { formatSince } from "@shared/format.js";
import { useCarryStore } from "../../stores/carryStore.js";
import { Checkbox } from "../../../shared/components/Checkbox.js";
import { EmptyState } from "../../../shared/components/EmptyState.js";
import { Panel } from "./Panel.js";

/**
 * Blockers are global and carried forward, exactly like to-dos (§5). Resolving one drops it off
 * every daily page. Being blocked is usually not your fault and is the thing you can act on
 * least, so this list is clay rather than red — an alarm you cannot switch off stops being read.
 */
export function BlockerList({ localDate }: { localDate: string }): React.JSX.Element {
	const blockers = useCarryStore((s) => s.blockers);
	const [text, setText] = useState("");

	const add = async (): Promise<void> => {
		const trimmed = text.trim();
		setText("");
		if (trimmed) await window.thread.invoke["blocker:add"]({ text: trimmed, localDate });
	};

	return (
		<Panel
			title="Blockers"
			accent="var(--clay)"
			subtitle="What's in the way. Stays here until it's resolved, however many days that takes."
		>
			{blockers.length === 0 ? (
				<EmptyState title="Nothing blocked." />
			) : (
				blockers.map((blocker) => <BlockerItem key={blocker.id} blocker={blocker} />)
			)}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
					padding: "6px 0",
				}}
			>
				<span style={{ color: "var(--clay)", fontSize: 11, flexShrink: 0 }}>■</span>
				<input
					value={text}
					placeholder="Add a blocker…"
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && void add()}
					style={{ flex: 1, fontSize: 13, padding: "4px 0" }}
				/>
			</div>
		</Panel>
	);
}

function BlockerItem({ blocker }: { blocker: Blocker }): React.JSX.Element {
	const [hover, setHover] = useState(false);

	return (
		<div
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				padding: "6px 0",
			}}
		>
			<Checkbox
				checked={false}
				tone="var(--clay)"
				title="Resolved — this drops off the list"
				onChange={() =>
					void window.thread.invoke["blocker:resolve"]({
						localDate: blocker.localDate,
						blockerId: blocker.id,
					})
				}
			/>
			<span style={{ flex: 1, fontSize: 13 }}>{blocker.text}</span>
			<span
				style={{ fontSize: 10, color: "var(--text-faint)", flexShrink: 0 }}
				title={`Raised ${blocker.localDate}`}
			>
				{formatSince(blocker.localDate)}
			</span>
			{hover ? (
				<button
					onClick={() =>
						void window.thread.invoke["blocker:remove"]({
							localDate: blocker.localDate,
							blockerId: blocker.id,
						})
					}
					title="Delete blocker"
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
