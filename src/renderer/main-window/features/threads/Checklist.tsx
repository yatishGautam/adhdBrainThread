import { useState } from "react";
import type { Step } from "@shared/domain.js";
import { Checkbox } from "../../../shared/components/Checkbox.js";

export function Checklist({
	threadId,
	steps,
}: {
	threadId: string;
	steps: Step[];
}): React.JSX.Element {
	const [text, setText] = useState("");
	const [draggingStepId, setDraggingStepId] = useState<string | null>(null);
	const [dragOverStepId, setDragOverStepId] = useState<string | null>(null);
	const sorted = [...steps].sort((a, b) => a.order - b.order);

	const add = async (afterStepId?: string): Promise<void> => {
		const trimmed = text.trim();
		setText("");
		if (!trimmed) return;
		await window.thread.invoke["steps:add"]({
			threadId,
			text: trimmed,
			afterStepId,
		});
	};

	const moveStep = async (stepId: string, toIndex: number): Promise<void> => {
		setDragOverStepId(null);
		setDraggingStepId(null);
		await window.thread.invoke["steps:reorder"]({ threadId, stepId, toIndex });
	};

	const doneCount = sorted.filter((step) => step.done).length;

	return (
		<div>
			{sorted.length > 0 ? <Progress done={doneCount} total={sorted.length} /> : null}
			{sorted.map((step, index) => (
				<ChecklistItem
					key={step.id}
					threadId={threadId}
					step={step}
					isLast={index === sorted.length - 1}
					onEnterAtEnd={() => add()}
					draggable={true}
					onDragStart={() => setDraggingStepId(step.id)}
					onDragOver={(event) => {
						event.preventDefault();
						if (draggingStepId && draggingStepId !== step.id)
							setDragOverStepId(step.id);
					}}
					onDrop={(event) => {
						event.preventDefault();
						if (draggingStepId && draggingStepId !== step.id)
							moveStep(draggingStepId, index);
					}}
					onDragEnd={() => {
						setDraggingStepId(null);
						setDragOverStepId(null);
					}}
					isDragOver={dragOverStepId === step.id}
					isDragging={draggingStepId === step.id}
				/>
			))}
			<div
				onDragOver={(event) => {
					event.preventDefault();
					if (draggingStepId) setDragOverStepId("end");
				}}
				onDrop={(event) => {
					event.preventDefault();
					if (draggingStepId) moveStep(draggingStepId, sorted.length);
				}}
				style={{
					minHeight: 28,
					borderRadius: 8,
					border: `1px dashed ${dragOverStepId === "end" ? "var(--amber)" : "var(--line)"}`,
					padding: 8,
					margin: "8px 0",
					color: dragOverStepId === "end" ? "var(--text)" : "var(--text-faint)",
					fontSize: 12,
					textAlign: "center",
				}}
			>
				{dragOverStepId === "end"
					? "Release to move to the end"
					: "Drag a step here to move it to the end"}
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
					padding: "6px 0",
				}}
			>
				<span
					style={{
						width: 18,
						height: 18,
						borderRadius: 5,
						flexShrink: 0,
						border: "1.5px dashed var(--line-strong)",
					}}
				/>
				<input
					value={text}
					placeholder="Add a step and press Enter…"
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && void add()}
					style={{ flex: 1, fontSize: 14, padding: "4px 0" }}
				/>
			</div>
		</div>
	);
}

/** Live progress ("3/5 done"), so a half-finished checklist reads as progress, not as debt. */
function Progress({ done, total }: { done: number; total: number }): React.JSX.Element {
	const fraction = total > 0 ? done / total : 0;
	return (
		<div style={{ marginBottom: 10 }}>
			<div
				style={{
					height: 4,
					borderRadius: 999,
					background: "var(--line)",
					overflow: "hidden",
				}}
			>
				<div
					style={{
						width: `${Math.round(fraction * 100)}%`,
						height: "100%",
						background: done === total ? "var(--emerald)" : "var(--amber)",
						transition: "width var(--motion-slow) var(--ease-out)",
					}}
				/>
			</div>
			<div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
				{done}/{total} done
			</div>
		</div>
	);
}

function ChecklistItem({
	threadId,
	step,
	isLast,
	onEnterAtEnd,
	draggable,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
	isDragOver,
	isDragging,
}: {
	threadId: string;
	step: Step;
	isLast: boolean;
	onEnterAtEnd: () => void;
	draggable: boolean;
	onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
	onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
	onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
	onDragEnd: () => void;
	isDragOver: boolean;
	isDragging: boolean;
}): React.JSX.Element {
	const [editing, setEditing] = useState(false);
	const [text, setText] = useState(step.text);
	const [hover, setHover] = useState(false);

	const commit = async (advance: boolean): Promise<void> => {
		setEditing(false);
		if (text.trim() && text !== step.text) {
			await window.thread.invoke["steps:update"]({
				threadId,
				stepId: step.id,
				text: text.trim(),
			});
		}
		// Enter at the end of a step creates the next one — never requires reaching for the mouse.
		if (advance && isLast) onEnterAtEnd();
	};

	return (
		<div
			draggable={draggable && !editing}
			onDragStart={(event) => {
				if (!editing) {
					event.dataTransfer.effectAllowed = "move";
					onDragStart(event);
				}
			}}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onDragEnd={onDragEnd}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				padding: "6px 0",
				borderRadius: 8,
				border: isDragOver ? "1px solid var(--amber)" : "1px solid transparent",
				background: isDragging ? "rgba(242, 166, 90, 0.06)" : "transparent",
				cursor: editing ? "text" : "grab",
			}}
		>
			<Checkbox
				checked={step.done}
				title={step.done ? "Mark this step unfinished" : "Mark this step done"}
				onChange={() =>
					void window.thread.invoke["steps:toggle"]({
						threadId,
						stepId: step.id,
					})
				}
			/>
			{editing ? (
				<input
					autoFocus
					value={text}
					onChange={(e) => setText(e.target.value)}
					onBlur={() => void commit(false)}
					onKeyDown={(e) => {
						if (e.key === "Enter") void commit(true);
						if (e.key === "Escape") {
							setText(step.text);
							setEditing(false);
						}
					}}
					style={{ flex: 1, fontSize: 14 }}
				/>
			) : (
				<span
					onDoubleClick={() => setEditing(true)}
					style={{
						flex: 1,
						fontSize: 14,
						textDecoration: step.done ? "line-through" : "none",
						color: step.done ? "var(--text-faint)" : "var(--text)",
					}}
				>
					{step.text}
				</span>
			)}
			{hover && !editing ? (
				<button
					onClick={() =>
						void window.thread.invoke["steps:remove"]({
							threadId,
							stepId: step.id,
						})
					}
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
