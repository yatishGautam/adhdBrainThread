import { useMemo, useState } from "react";
import { ACTIVE_THREAD_CAP } from "@shared/constants.js";
import type { Thread } from "@shared/domain.js";
import { useThreadStore } from "../../stores/threadStore.js";
import { ThreadCard } from "./ThreadCard.js";
import { DoneSection } from "./DoneSection.js";
import { EmptyState } from "../../../shared/components/EmptyState.js";
import { Button } from "../../../shared/components/Button.js";
import { Collapsible } from "../../../shared/components/Collapsible.js";
import { PageHeader } from "../../../shared/components/PageHeader.js";
import { ThreadDrawer } from "./ThreadDrawer.js";
import { justStart, pickJustStart } from "../justStart.js";

/**
 * Up to five active threads, then the dormant zone, then the done pile — both collapsed (§2).
 * Done and dormant threads do not count toward the five: the cap is on what you are carrying,
 * not on what you have ever written down.
 */
export function ThreadsView(): React.JSX.Element {
	const threads = useThreadStore((s) => s.threads);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);
	const [title, setTitle] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [dragId, setDragId] = useState<string | null>(null);
	const [dropTarget, setDropTarget] = useState<string | null>(null);

	const active = useMemo(
		() => boardOrder(threads.filter((t) => t.status !== "done" && t.status !== "dormant")),
		[threads],
	);
	const dormant = useMemo(
		() => boardOrder(threads.filter((t) => t.status === "dormant")),
		[threads],
	);
	const full = active.length >= ACTIVE_THREAD_CAP;

	const create = async (): Promise<void> => {
		const trimmed = title.trim();
		if (!trimmed) {
			setCreating(false);
			return;
		}
		try {
			const thread = await window.thread.invoke["threads:create"]({
				title: trimmed,
			});
			setTitle("");
			setCreating(false);
			setError(null);
			setExpandedId(thread.id);
		} catch (cause) {
			setError(messageOf(cause));
		}
	};

	const move = async (
		id: string,
		toIndex: number,
		status?: Thread["status"],
	): Promise<void> => {
		setDragId(null);
		setDropTarget(null);
		try {
			await window.thread.invoke["threads:reorder"]({ id, toIndex, status });
			setError(null);
		} catch (cause) {
			setError(messageOf(cause));
		}
	};

	const dragProps = (list: Thread[], thread: Thread, index: number) => ({
		onDragStart: () => setDragId(thread.id),
		onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
			event.preventDefault();
			if (dragId && dragId !== thread.id) setDropTarget(thread.id);
		},
		onDrop: (event: React.DragEvent<HTMLDivElement>) => {
			event.preventDefault();
			if (!dragId || dragId === thread.id) return;
			void move(dragId, index, list === dormant ? "dormant" : undefined);
		},
		onDragEnd: () => {
			setDragId(null);
			setDropTarget(null);
		},
		isDragOver: dropTarget === thread.id,
		isDragging: dragId === thread.id,
	});

	const renderCard = (
		list: Thread[],
		thread: Thread,
		index: number,
	): React.JSX.Element => (
		<div key={thread.id}>
			<ThreadCard
				thread={thread}
				expanded={expandedId === thread.id}
				onToggle={() =>
					setExpandedId(expandedId === thread.id ? null : thread.id)
				}
				{...dragProps(list, thread, index)}
			/>
			<ThreadDrawer thread={thread} open={expandedId === thread.id} />
		</div>
	);

	return (
		<div style={{ padding: "20px 28px 40px", maxWidth: 920, margin: "0 auto" }}>
			<PageHeader
				title="Threads"
				description="Everything you're working on. Each thread keeps its own checklist."
				right={
					<div style={{ display: "flex", alignItems: "center", gap: 14 }}>
						<span
							title={`At most ${ACTIVE_THREAD_CAP} active threads. Done and dormant ones are free.`}
							style={{
								fontSize: 12,
								color: full ? "var(--amber)" : "var(--text-faint)",
								whiteSpace: "nowrap",
							}}
						>
							{active.length} of {ACTIVE_THREAD_CAP} active
						</span>
						{pickJustStart(threads) ? (
							<button
								onClick={() => void justStart(threads)}
								className="btn-launch"
								title={`Start a Pomodoro on '${pickJustStart(threads)?.title}' — no choosing, just go`}
								style={{
									padding: "9px 18px",
									borderRadius: 999,
									fontWeight: 700,
									fontSize: 13,
									cursor: "pointer",
									whiteSpace: "nowrap",
								}}
							>
								⚡ Just start
							</button>
						) : null}
					</div>
				}
			/>

			{error ? (
				<p style={{ fontSize: 12, color: "var(--clay)", margin: "0 0 12px" }}>
					{error}
				</p>
			) : null}

			<div
				style={{
					marginTop: 20,
					display: "flex",
					flexDirection: "column",
					gap: 10,
				}}
			>
				{active.length === 0 && !creating ? (
					<EmptyState
						title="Nothing on the board yet."
						detail="A thread is one thing you're working on — a bug, an errand, a chapter."
						action={
							<Button variant="primary" onClick={() => setCreating(true)}>
								New thread
							</Button>
						}
					/>
				) : (
					active.map((thread, index) => renderCard(active, thread, index))
				)}

				{creating ? (
					<input
						autoFocus
						value={title}
						placeholder="What are you working on?"
						onChange={(e) => setTitle(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") void create();
							if (e.key === "Escape") setCreating(false);
						}}
						onBlur={() => void create()}
						style={{
							padding: "12px 14px",
							borderRadius: 10,
							border: "1px solid var(--line)",
							background: "var(--surface-raised)",
							fontSize: 14,
						}}
					/>
				) : active.length > 0 ? (
					<Button
						onClick={() => setCreating(true)}
						disabled={full}
						title={
							full
								? `At most ${ACTIVE_THREAD_CAP} active threads. Finish one, or move one to the dormant zone.`
								: undefined
						}
						style={{ alignSelf: "flex-start" }}
					>
						+ New thread
					</Button>
				) : null}
			</div>

			<div style={{ marginTop: 26 }}>
				<Collapsible
					title={<span>Dormant ({dormant.length})</span>}
					defaultOpen={false}
				>
					<div
						onDragOver={(event) => {
							event.preventDefault();
							if (dragId) setDropTarget("dormant-zone");
						}}
						onDrop={(event) => {
							event.preventDefault();
							if (dragId) void move(dragId, dormant.length, "dormant");
						}}
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 10,
							padding: 10,
							borderRadius: 12,
							border: `1px dashed ${dropTarget === "dormant-zone" ? "var(--amber)" : "var(--line)"}`,
						}}
					>
						{dormant.length === 0 ? (
							<p
								style={{
									fontSize: 12,
									color: "var(--text-faint)",
									margin: 0,
									textAlign: "center",
								}}
							>
								Drag a thread here to park it. Dormant threads don&rsquo;t count
								toward the {ACTIVE_THREAD_CAP}.
							</p>
						) : (
							dormant.map((thread, index) => renderCard(dormant, thread, index))
						)}
					</div>
				</Collapsible>
			</div>

			<DoneSection />
		</div>
	);
}

/** Manual drag order, with the old status-then-recency sort as the fallback for legacy records. */
const STATUS_ORDER: Record<Thread["status"], number> = {
	in_progress: 0,
	blocked: 1,
	waiting: 2,
	idle: 3,
	dormant: 4,
	done: 5,
};

export function boardOrder(threads: Thread[]): Thread[] {
	return [...threads].sort((a, b) => {
		if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
		if (a.order !== undefined) return -1;
		if (b.order !== undefined) return 1;
		return (
			STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
			b.updatedAt.localeCompare(a.updatedAt)
		);
	});
}

function messageOf(cause: unknown): string {
	const raw = cause instanceof Error ? cause.message : String(cause);
	// Electron prefixes IPC rejections with the handler path; the sentence after it is the one
	// written for the user.
	return raw.replace(/^Error invoking remote method '[^']*':\s*Error:\s*/, "");
}
