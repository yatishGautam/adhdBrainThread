import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Thread } from "@shared/domain.js";
import { statusColor } from "../../../shared/components/Chip.js";
import { Checklist } from "./Checklist.js";

/**
 * The drawer that slides out of a thread card.
 *
 * It is deliberately not a separate floating panel: it shares the card's left accent, has no
 * top border and sits flush under it with the card's bottom corners squared off while open, so
 * the two read as one object hinged open rather than as a card with an unrelated box beneath.
 */
export function ThreadDrawer({
	thread,
	open,
}: {
	thread: Thread;
	open: boolean;
}): React.JSX.Element {
	const tone = statusColor(thread.status);

	return (
		<AnimatePresence initial={false}>
			{open ? (
				<motion.div
					key="drawer"
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
					style={{ overflow: "hidden" }}
				>
					<div
						style={{
							// No top border and negative margin: the card's bottom edge is this
							// panel's top edge, so there is no seam between them.
							marginTop: -1,
							padding: "16px 18px 18px",
							borderRadius: "0 0 12px 12px",
							border: "1px solid var(--line)",
							borderTop: "none",
							borderLeft: `3px solid ${tone}`,
							background: "var(--surface-raised)",
							boxShadow: "inset 0 8px 12px -10px rgba(0, 0, 0, 0.6)",
						}}
					>
						<DrawerLabel>Checklist</DrawerLabel>
						<Checklist threadId={thread.id} steps={thread.steps} />

						<div style={{ marginTop: 18 }}>
							<DrawerLabel>Notes</DrawerLabel>
							<Notes thread={thread} />
						</div>

						<div
							style={{
								display: "flex",
								justifyContent: "flex-end",
								marginTop: 16,
								paddingTop: 12,
								borderTop: "1px solid var(--line)",
							}}
						>
							<DeleteThread thread={thread} />
						</div>
					</div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

function Notes({ thread }: { thread: Thread }): React.JSX.Element {
	const [notes, setNotes] = useState(thread.notes);

	useEffect(() => {
		setNotes(thread.notes);
	}, [thread.id, thread.notes]);

	const save = async (): Promise<void> => {
		if (notes !== thread.notes) {
			await window.thread.invoke["threads:update"]({
				id: thread.id,
				patch: { notes },
			});
		}
	};

	return (
		<textarea
			value={notes}
			onChange={(e) => setNotes(e.target.value)}
			onBlur={() => void save()}
			placeholder="Anything worth remembering about this thread…"
			rows={4}
			style={{
				width: "100%",
				resize: "vertical",
				fontSize: 13,
				lineHeight: 1.6,
				padding: 12,
				border: "1px solid var(--line)",
				borderRadius: 10,
				background: "var(--ink)",
			}}
		/>
	);
}

/**
 * Two-step, inline. A thread carries its whole checklist and session history, so deleting one
 * is not a thing to do by accident — but it also does not deserve a modal.
 */
function DeleteThread({ thread }: { thread: Thread }): React.JSX.Element {
	const [confirming, setConfirming] = useState(false);

	useEffect(() => {
		setConfirming(false);
	}, [thread.id]);

	if (!confirming) {
		return (
			<button
				onClick={() => setConfirming(true)}
				style={{
					background: "none",
					border: "none",
					color: "var(--text-faint)",
					cursor: "pointer",
					fontSize: 12,
					padding: "4px 6px",
				}}
			>
				Delete thread
			</button>
		);
	}

	return (
		<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
			<span style={{ fontSize: 12, color: "var(--text-muted)" }}>
				Delete &lsquo;{thread.title}&rsquo; and its {thread.steps.length} step
				{thread.steps.length === 1 ? "" : "s"}?
			</span>
			<button
				onClick={() => setConfirming(false)}
				style={{
					background: "transparent",
					border: "1px solid var(--line)",
					borderRadius: 8,
					color: "var(--text-muted)",
					cursor: "pointer",
					fontSize: 12,
					padding: "5px 12px",
				}}
			>
				Keep
			</button>
			<button
				onClick={() =>
					void window.thread.invoke["threads:remove"]({ id: thread.id })
				}
				style={{
					background: "var(--clay)",
					border: "none",
					borderRadius: 8,
					color: "#1a0f0c",
					fontWeight: 600,
					cursor: "pointer",
					fontSize: 12,
					padding: "5px 12px",
				}}
			>
				Delete
			</button>
		</div>
	);
}

function DrawerLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
	return (
		<div
			style={{
				fontSize: 10,
				fontWeight: 700,
				color: "var(--text-faint)",
				textTransform: "uppercase",
				letterSpacing: "0.07em",
				marginBottom: 10,
			}}
		>
			{children}
		</div>
	);
}
