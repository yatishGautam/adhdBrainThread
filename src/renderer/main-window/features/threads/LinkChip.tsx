import { useState } from "react";
import { classifyLink, linkLabel, normaliseLink } from "@shared/links.js";

/**
 * A valid link collapses to a clickable chip — Notion glyph for Notion, globe for a URL — with
 * a pencil to edit (§6). Opening always goes through main, which is what keeps a link out of an
 * Electron window it was never meant to render in.
 */
export function LinkChip({
	link,
	onChange,
}: {
	link: string | undefined;
	onChange: (link: string | undefined) => void;
}): React.JSX.Element {
	const [editing, setEditing] = useState(false);
	const [text, setText] = useState(link ?? "");

	const commit = (): void => {
		setEditing(false);
		const value = text.trim();
		if (!value) {
			onChange(undefined);
			return;
		}
		const normalised = normaliseLink(value);
		if (classifyLink(normalised) === "invalid") return;
		onChange(normalised);
	};

	if (editing) {
		return (
			<input
				autoFocus
				value={text}
				placeholder="Paste a Notion or web link…"
				onChange={(e) => setText(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") commit();
					if (e.key === "Escape") {
						setText(link ?? "");
						setEditing(false);
					}
				}}
				onClick={(e) => e.stopPropagation()}
				style={{
					fontSize: 11,
					width: 190,
					padding: "3px 8px",
					borderRadius: 999,
					border: "1px solid var(--line)",
					background: "var(--surface-raised)",
				}}
			/>
		);
	}

	if (!link) {
		return (
			<button
				onClick={(e) => {
					e.stopPropagation();
					setText("");
					setEditing(true);
				}}
				title="Attach a Notion page or a link"
				style={ghost}
			>
				+ link
			</button>
		);
	}

	const notion = classifyLink(link) === "notion";
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				flexShrink: 0,
			}}
		>
			<button
				onClick={(e) => {
					e.stopPropagation();
					void window.thread.invoke["link:open"]({ url: link });
				}}
				title={link}
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 5,
					padding: "3px 9px",
					borderRadius: 999,
					border: "1px solid var(--line)",
					background: "var(--surface-raised)",
					color: "var(--text-muted)",
					cursor: "pointer",
					fontSize: 11,
					maxWidth: 160,
					overflow: "hidden",
					whiteSpace: "nowrap",
					textOverflow: "ellipsis",
				}}
			>
				<span aria-hidden="true" style={{ fontWeight: 700 }}>
					{notion ? "N" : "🌐"}
				</span>
				{linkLabel(link)}
			</button>
			<button
				onClick={(e) => {
					e.stopPropagation();
					setText(link);
					setEditing(true);
				}}
				title="Edit link"
				style={ghost}
			>
				✎
			</button>
		</span>
	);
}

const ghost: React.CSSProperties = {
	background: "none",
	border: "none",
	color: "var(--text-faint)",
	cursor: "pointer",
	fontSize: 11,
	padding: 0,
};
