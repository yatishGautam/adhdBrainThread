import { useMemo } from "react";
import type { Thread } from "@shared/domain.js";
import { useThreadStore } from "../../stores/threadStore.js";
import { useUiStore } from "../../stores/uiStore.js";
import { StatusChip } from "../../../shared/components/Chip.js";
import { Checkbox } from "../../../shared/components/Checkbox.js";
import { EmptyState } from "../../../shared/components/EmptyState.js";
import { boardOrder } from "../threads/ThreadsView.js";
import { Panel } from "./Panel.js";

/**
 * Auto-tracked mirror of the active threads (§3) — there is nothing to pick and nothing to
 * curate, because a plan you have to assemble every morning is a plan you stop assembling.
 * The checkbox is the same completion the board's status dropdown drives, so the two are
 * always in step: ticking marks Done and moves it to the done pile, unticking returns it to
 * In Progress.
 */
export function TodayThreads({ readOnly }: { readOnly: boolean }): React.JSX.Element {
	const threads = useThreadStore((s) => s.threads);
	const setTab = useUiStore((s) => s.setTab);

	const active = useMemo(
		() =>
			boardOrder(
				threads.filter((t) => t.status !== "done" && t.status !== "dormant"),
			),
		[threads],
	);
	const doneToday = useMemo(
		() => threads.filter((t) => t.status === "done"),
		[threads],
	);

	const setDone = async (thread: Thread, done: boolean): Promise<void> => {
		await window.thread.invoke["threads:setStatus"]({
			id: thread.id,
			status: done ? "done" : "in_progress",
		});
	};

	return (
		<Panel
			title="Today's threads"
			accent="var(--emerald)"
			subtitle="Everything active, tracked for you. Tick one off when it's finished."
		>
			{active.length === 0 && doneToday.length === 0 ? (
				<EmptyState
					title="No active threads."
					detail="Make one on the Threads tab and it shows up here on its own."
				/>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					{active.map((thread) => (
						<Row
							key={thread.id}
							thread={thread}
							done={false}
							readOnly={readOnly}
							onToggle={() => void setDone(thread, true)}
							onOpen={() => setTab("threads")}
						/>
					))}
					{doneToday.map((thread) => (
						<Row
							key={thread.id}
							thread={thread}
							done
							readOnly={readOnly}
							onToggle={() => void setDone(thread, false)}
							onOpen={() => setTab("threads")}
						/>
					))}
				</div>
			)}
		</Panel>
	);
}

function Row({
	thread,
	done,
	readOnly,
	onToggle,
	onOpen,
}: {
	thread: Thread;
	done: boolean;
	readOnly: boolean;
	onToggle: () => void;
	onOpen: () => void;
}): React.JSX.Element {
	const next = [...thread.steps].sort((a, b) => a.order - b.order).find((s) => !s.done);

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				padding: "7px 4px",
			}}
		>
			<Checkbox
				checked={done}
				disabled={readOnly}
				onChange={onToggle}
				title={done ? "Reopen this thread" : "Mark this thread done"}
			/>
			<button
				onClick={onOpen}
				style={{
					flex: 1,
					minWidth: 0,
					textAlign: "left",
					background: "none",
					border: "none",
					cursor: "pointer",
					padding: 0,
				}}
			>
				<span
					style={{
						fontSize: 13,
						color: done ? "var(--text-faint)" : "var(--text)",
						textDecoration: done ? "line-through" : "none",
					}}
				>
					{thread.title}
				</span>
				{next && !done ? (
					<span
						style={{
							display: "block",
							fontSize: 11,
							color: "var(--text-faint)",
						}}
					>
						{next.text}
					</span>
				) : null}
			</button>
			{!done ? (
				<>
					<StatusChip status={thread.status} />
					<button
						onClick={() =>
							void window.thread.invoke["session:start"]({ threadId: thread.id })
						}
						className="btn-launch"
						title="Start a Pomodoro on this thread"
						style={{
							width: 24,
							height: 24,
							borderRadius: "50%",
							cursor: "pointer",
							fontSize: 10,
							flexShrink: 0,
						}}
					>
						▶
					</button>
				</>
			) : null}
		</div>
	);
}
