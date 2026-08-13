import { useEffect, useState } from "react";
import type { Thread, ThreadStatus } from "@shared/domain.js";
import { StatusChip, statusColor } from "../../../shared/components/Chip.js";
import { StatusDropdown } from "./StatusDropdown.js";
import { NextAction } from "./NextAction.js";
import { LinkChip } from "./LinkChip.js";

/**
 * Card elements in the order §2 fixes them: name, link chip, next step, status, then Start
 * Focus. Cards are tinted and left-bordered by status, and every status also carries an icon
 * and a word, so the board reads without colour.
 */
export function ThreadCard({
	thread,
	expanded,
	onToggle,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
	isDragOver,
	isDragging,
}: {
	thread: Thread;
	expanded: boolean;
	onToggle: () => void;
	onDragStart?: () => void;
	onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
	onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
	onDragEnd?: () => void;
	isDragOver?: boolean;
	isDragging?: boolean;
}): React.JSX.Element {
	const [starting, setStarting] = useState(false);
	const [hover, setHover] = useState(false);
	const [editingTitle, setEditingTitle] = useState(false);
	const [title, setTitle] = useState(thread.title);
	const done = thread.steps.filter((s) => s.done).length;
	const inProgress = thread.status === "in_progress";
	const tone = statusColor(thread.status);

	useEffect(() => {
		setTitle(thread.title);
	}, [thread.id, thread.title]);

	const focus = async (e: React.MouseEvent): Promise<void> => {
		e.stopPropagation();
		setStarting(true);
		try {
			await window.thread.invoke["session:start"]({ threadId: thread.id });
		} finally {
			setStarting(false);
		}
	};

	const setStatus = async (
		status: ThreadStatus,
		waitingOn?: string,
	): Promise<void> => {
		await window.thread.invoke["threads:setStatus"]({
			id: thread.id,
			status,
			waitingOn,
		});
	};

	const commitTitle = async (): Promise<void> => {
		setEditingTitle(false);
		const trimmed = title.trim();
		if (!trimmed || trimmed === thread.title) {
			setTitle(thread.title);
			return;
		}
		await window.thread.invoke["threads:update"]({
			id: thread.id,
			patch: { title: trimmed },
		});
	};

	return (
		<div
			onClick={onToggle}
			draggable={Boolean(onDragStart) && !editingTitle}
			onDragStart={(event) => {
				if (editingTitle) return;
				event.dataTransfer.effectAllowed = "move";
				onDragStart?.();
			}}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onDragEnd={onDragEnd}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			className={expanded ? undefined : "lift"}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 14,
				padding: "14px 16px",
				// Squared off at the bottom while the drawer is out, so the card and the drawer
				// share one continuous outline instead of looking like two stacked boxes.
				borderRadius: expanded ? "12px 12px 0 0" : 12,
				border: `1px solid ${isDragOver ? "var(--amber)" : "var(--line)"}`,
				borderLeft: `3px solid ${tone}`,
				background: expanded
					? "var(--surface-raised)"
					: `color-mix(in srgb, ${tone} ${hover ? 12 : 7}%, var(--surface))`,
				opacity: isDragging ? 0.5 : 1,
				cursor: "pointer",
				transition:
					"background var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out), box-shadow 260ms ease-in-out",
				boxShadow: inProgress
					? `0 0 0 1px color-mix(in srgb, ${tone} 22%, transparent), var(--shadow-card), var(--edge-light)`
					: "var(--shadow-card), var(--edge-light)",
			}}
		>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						flexWrap: "wrap",
					}}
				>
					{editingTitle ? (
						<input
							autoFocus
							value={title}
							onClick={(e) => e.stopPropagation()}
							onChange={(e) => setTitle(e.target.value)}
							onBlur={() => void commitTitle()}
							onKeyDown={(e) => {
								if (e.key === "Enter") void commitTitle();
								if (e.key === "Escape") {
									setTitle(thread.title);
									setEditingTitle(false);
								}
							}}
							style={{ fontSize: 15, fontWeight: 500, flex: 1, minWidth: 120 }}
						/>
					) : (
						<span
							onDoubleClick={(e) => {
								e.stopPropagation();
								setEditingTitle(true);
							}}
							title="Double-click to rename"
							style={{
								fontSize: 15,
								fontWeight: 500,
								overflow: "hidden",
								textOverflow: "ellipsis",
							}}
						>
							{thread.title}
						</span>
					)}
					<LinkChip
						link={thread.link}
						onChange={(link) =>
							void window.thread.invoke["threads:update"]({
								id: thread.id,
								patch: { link: link ?? "" },
							})
						}
					/>
				</div>
				<NextAction thread={thread} />
				{(thread.status === "waiting" || thread.status === "blocked") &&
				thread.waitingOn ? (
					<div style={{ fontSize: 11, color: tone, marginTop: 2 }}>
						{thread.status === "blocked" ? "Blocked on" : "Waiting on"}:{" "}
						{thread.waitingOn}
					</div>
				) : null}
			</div>

			<div
				onClick={(e) => e.stopPropagation()}
				style={{ display: "flex", alignItems: "center", gap: 10 }}
			>
				<StatusDropdown status={thread.status} onChange={setStatus} />
				<button
					onClick={(e) => {
						e.stopPropagation();
						onToggle();
					}}
					title={expanded ? "Close checklist" : "Open checklist and notes"}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 5,
						padding: "7px 11px",
						borderRadius: 999,
						border: `1px solid ${expanded ? "var(--line-strong)" : "var(--line)"}`,
						background: expanded ? "var(--surface-hover)" : "transparent",
						color: expanded ? "var(--text)" : "var(--text-muted)",
						cursor: "pointer",
						fontSize: 12,
					}}
				>
					{thread.steps.length > 0 ? `${done}/${thread.steps.length}` : "Steps"}
					<span
						aria-hidden="true"
						style={{
							display: "inline-block",
							fontSize: 9,
							transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
							transition: "transform var(--motion-slow) var(--ease-out)",
						}}
					>
						▼
					</span>
				</button>
				<button
					onClick={focus}
					disabled={starting}
					className="btn-launch"
					title="Start a Pomodoro on this thread"
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						padding: "8px 15px",
						borderRadius: 999,
						fontWeight: 700,
						fontSize: 12,
						cursor: "pointer",
						whiteSpace: "nowrap",
					}}
				>
					▶ Start Focus
				</button>
			</div>
		</div>
	);
}

export { StatusChip };
