import { useEffect, useState } from "react";
import type { Thought } from "@shared/domain.js";
import { formatLocalDate } from "@shared/format.js";
import { useUiStore } from "../../stores/uiStore.js";
import { EmptyState } from "../../../shared/components/EmptyState.js";
import { PageHeader } from "../../../shared/components/PageHeader.js";

/**
 * Every parked thought, from every day, newest first. This is where "later" actually happens:
 * come back, add a note, promote the good ones to a to-do or a thread, delete the rest.
 * Reached from the dashboard's parked stat or the daily Park panel — not a tab, because it is
 * a place you visit, not a place you live.
 */
export function ParkView(): React.JSX.Element {
	const [thoughts, setThoughts] = useState<Thought[] | null>(null);
	const prevTab = useUiStore((s) => s.prevTab);
	const setTab = useUiStore((s) => s.setTab);

	const refresh = (): void => {
		void window.thread.invoke["park:all"](undefined).then(setThoughts);
	};

	useEffect(refresh, []);
	// Any day changing (a delete, a note, the HUD parking something) refreshes the list.
	useEffect(() => window.thread.on("day:changed", refresh), []);

	const groups = groupByDate(thoughts ?? []);

	return (
		<div style={{ padding: "20px 28px 40px", maxWidth: 820, margin: "0 auto" }}>
			<button
				onClick={() => setTab(prevTab)}
				style={{
					background: "none",
					border: "none",
					color: "var(--text-muted)",
					cursor: "pointer",
					fontSize: 13,
					padding: 0,
					marginBottom: 14,
				}}
			>
				← Back
			</button>
			<PageHeader
				title="Parked"
				description="Everything you set aside to look at later. Later is now — note it, promote it, or let it go."
			/>

			{thoughts === null ? (
				<div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
			) : thoughts.length === 0 ? (
				<EmptyState
					title="Nothing parked."
					detail="The Park button on the HUD and the Park box on the daily page both land here."
				/>
			) : (
				groups.map((group) => (
					<div key={group.date} style={{ marginBottom: 22 }}>
						<div
							style={{
								fontSize: 11,
								fontWeight: 700,
								color: "var(--text-faint)",
								textTransform: "uppercase",
								letterSpacing: "0.06em",
								marginBottom: 8,
							}}
						>
							{formatLocalDate(group.date)}
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
							{group.thoughts.map((thought) => (
								<ParkedCard key={thought.id} thought={thought} />
							))}
						</div>
					</div>
				))
			)}
		</div>
	);
}

function ParkedCard({ thought }: { thought: Thought }): React.JSX.Element {
	const [noting, setNoting] = useState(false);
	const [note, setNote] = useState(thought.note ?? "");

	useEffect(() => {
		setNote(thought.note ?? "");
	}, [thought.id, thought.note]);

	const saveNote = async (): Promise<void> => {
		setNoting(false);
		if ((thought.note ?? "") !== note.trim()) {
			await window.thread.invoke["thought:note"]({
				localDate: thought.localDate,
				thoughtId: thought.id,
				note,
			});
		}
	};

	const act = (action: "thread" | "todo"): void => {
		void window.thread.invoke["thought:process"]({
			localDate: thought.localDate,
			thoughtId: thought.id,
			action,
		});
	};

	return (
		<div
			className="lift"
			style={{
				borderRadius: 12,
				border: "1px solid var(--line)",
				background: "var(--surface)",
				boxShadow: "var(--shadow-card), var(--edge-light)",
				padding: "12px 14px",
				opacity: thought.processed ? 0.55 : 1,
			}}
		>
			<div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
				<span style={{ flex: 1, fontSize: 14 }}>
					{thought.text}
					{thought.processed ? (
						<span style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: 8 }}>
							· promoted
						</span>
					) : null}
				</span>
				<div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
					{!thought.processed ? (
						<>
							<button onClick={() => act("todo")} style={action} title="Turn into a to-do">
								→ to-do
							</button>
							<button onClick={() => act("thread")} style={action} title="Turn into a thread">
								→ thread
							</button>
						</>
					) : null}
					<button
						onClick={() => setNoting(true)}
						style={action}
						title="Add a note to this thought"
					>
						{thought.note ? "edit note" : "+ note"}
					</button>
					<button
						onClick={() =>
							void window.thread.invoke["thought:remove"]({
								localDate: thought.localDate,
								thoughtId: thought.id,
							})
						}
						style={{ ...action, color: "var(--text-faint)" }}
						title="Delete this thought"
					>
						✕
					</button>
				</div>
			</div>

			{noting ? (
				<textarea
					autoFocus
					value={note}
					onChange={(e) => setNote(e.target.value)}
					onBlur={() => void saveNote()}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							void saveNote();
						}
						if (e.key === "Escape") {
							setNote(thought.note ?? "");
							setNoting(false);
						}
					}}
					placeholder="What do you think about it now?"
					rows={2}
					style={{
						width: "100%",
						marginTop: 10,
						padding: 10,
						fontSize: 13,
						lineHeight: 1.5,
						borderRadius: 8,
						border: "1px solid var(--line-strong)",
						background: "var(--ink)",
						resize: "vertical",
					}}
				/>
			) : thought.note ? (
				<div
					onDoubleClick={() => setNoting(true)}
					style={{
						marginTop: 8,
						paddingLeft: 10,
						borderLeft: "2px solid var(--line-strong)",
						fontSize: 12,
						color: "var(--text-muted)",
						lineHeight: 1.5,
						whiteSpace: "pre-wrap",
					}}
				>
					{thought.note}
				</div>
			) : null}
		</div>
	);
}

const action: React.CSSProperties = {
	background: "none",
	border: "none",
	color: "var(--amber)",
	cursor: "pointer",
	fontSize: 11,
	padding: 0,
};

function groupByDate(thoughts: Thought[]): { date: string; thoughts: Thought[] }[] {
	const map = new Map<string, Thought[]>();
	for (const thought of thoughts) {
		const list = map.get(thought.localDate);
		if (list) list.push(thought);
		else map.set(thought.localDate, [thought]);
	}
	return [...map.entries()]
		.sort((a, b) => (a[0] < b[0] ? 1 : -1))
		.map(([date, list]) => ({ date, thoughts: list }));
}
