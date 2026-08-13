import { useState } from "react";
import type { Todo } from "@shared/domain.js";
import { formatSince } from "@shared/format.js";
import { useCarryStore } from "../../stores/carryStore.js";
import { Checkbox } from "../../../shared/components/Checkbox.js";
import { EmptyState } from "../../../shared/components/EmptyState.js";
import { PromoteToThread } from "./PromoteToThread.js";
import { Panel } from "./Panel.js";

/**
 * To-dos are global and carried forward (§5): they persist across days until they are done,
 * and every daily page shows the same list. Each one carries the date it was raised, so a thing
 * that has been sitting there since Aug 4 says so instead of quietly looking new every morning.
 * Completing one drops it off here and lands in today's Log.
 */
export function TodoList({ localDate }: { localDate: string }): React.JSX.Element {
	const todos = useCarryStore((s) => s.todos);
	const [text, setText] = useState("");

	// Added to the day you are looking at, not always today — a to-do you jot down while
	// reviewing Tuesday belongs to Tuesday.
	const add = async (): Promise<void> => {
		const trimmed = text.trim();
		setText("");
		if (trimmed) await window.thread.invoke["todo:add"]({ text: trimmed, localDate });
	};

	return (
		<Panel
			title="To-do"
			accent="var(--lavender)"
			subtitle="Carried forward until it's done. Not tied to any one day."
		>
			{todos.length === 0 ? (
				<EmptyState title="Nothing outstanding." detail="A clean list is allowed to stay clean." />
			) : (
				todos.map((todo) => <TodoItem key={todo.id} todo={todo} />)
			)}
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
						border: "1.5px dashed var(--line-strong)",
						flexShrink: 0,
					}}
				/>
				<input
					value={text}
					placeholder="Add a to-do or reminder…"
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && void add()}
					style={{ flex: 1, fontSize: 13, padding: "4px 0" }}
				/>
			</div>
		</Panel>
	);
}

function TodoItem({ todo }: { todo: Todo }): React.JSX.Element {
	const [editing, setEditing] = useState(false);
	const [text, setText] = useState(todo.text);
	const [hover, setHover] = useState(false);
	const localDate = todo.localDate;

	const commit = async (): Promise<void> => {
		setEditing(false);
		if (text.trim() && text !== todo.text) {
			await window.thread.invoke["todo:update"]({
				localDate,
				todoId: todo.id,
				text: text.trim(),
			});
		}
	};

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
				title="Done — this drops off the list and lands in today's log"
				onChange={() =>
					void window.thread.invoke["todo:toggle"]({
						localDate,
						todoId: todo.id,
					})
				}
			/>
			{editing ? (
				<input
					autoFocus
					value={text}
					onChange={(e) => setText(e.target.value)}
					onBlur={() => void commit()}
					onKeyDown={(e) => e.key === "Enter" && void commit()}
					style={{ flex: 1, fontSize: 13 }}
				/>
			) : (
				<span
					onDoubleClick={() => setEditing(true)}
					style={{ flex: 1, fontSize: 13, color: "var(--text)" }}
				>
					{todo.text}
				</span>
			)}
			<span
				style={{ fontSize: 10, color: "var(--text-faint)", flexShrink: 0 }}
				title={`Added ${todo.localDate}`}
			>
				{formatSince(todo.localDate)}
			</span>
			{hover && !editing ? (
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<PromoteToThread localDate={localDate} todoId={todo.id} />
					<button
						onClick={() =>
							void window.thread.invoke["todo:remove"]({
								localDate,
								todoId: todo.id,
							})
						}
						title="Delete to-do"
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
				</div>
			) : null}
		</div>
	);
}
