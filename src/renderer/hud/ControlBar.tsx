import { DistractionButton } from "./DistractionButton.js";
import type { DistractionKind } from "@shared/domain.js";

/**
 * Labelled rather than icon-only. The HUD sits beside real work all day, so a button whose
 * meaning you have to remember is a button you stop using.
 */
export function ControlBar({
	paused,
	onPauseResume,
	onDistraction,
	onSwitch,
	onEnd,
}: {
	paused: boolean;
	onPauseResume: () => void;
	onDistraction: (kind: DistractionKind, note?: string) => void;
	onSwitch: () => void;
	onEnd: () => void;
}): React.JSX.Element {
	return (
		<div
			style={
				{
					display: "flex",
					gap: 5,
					flexShrink: 0,
					flexWrap: "wrap",
					justifyContent: "flex-end",
					WebkitAppRegion: "no-drag",
				} as React.CSSProperties
			}
		>
			<HudButton
				onClick={onPauseResume}
				title={paused ? "Resume the timer" : "Pause the timer"}
				label={paused ? "Resume" : "Pause"}
			/>
			<DistractionButton onDistraction={onDistraction} />
			<HudButton
				onClick={onSwitch}
				title="Work on a different thread instead"
				label="Switch"
			/>
			<HudButton
				onClick={onEnd}
				title="Stop the timer (this does not finish the thread)"
				label="Stop"
			/>
		</div>
	);
}

export function HudButton({
	onClick,
	title,
	label,
	...rest
}: {
	onClick?: () => void;
	title: string;
	label: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
	return (
		<button onClick={onClick} title={title} style={hudBtn} {...rest}>
			{label}
		</button>
	);
}

export const hudBtn: React.CSSProperties = {
	padding: "6px 10px",
	borderRadius: 8,
	border: "1px solid var(--line)",
	background: "var(--surface-raised)",
	color: "var(--text-muted)",
	cursor: "pointer",
	fontSize: 10,
	whiteSpace: "nowrap",
	minWidth: 56,
};
