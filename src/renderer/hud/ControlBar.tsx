import { ParkButton } from "./ParkButton.js";

/**
 * Pause/Resume · Park · Skip · Stop (§4). Labelled rather than icon-only: the HUD sits beside
 * real work all day, so a button whose meaning you have to remember is a button you stop using.
 */
export function ControlBar({
	paused,
	onPauseResume,
	onSkip,
	onEnd,
}: {
	paused: boolean;
	onPauseResume: () => void;
	onSkip: () => void;
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
			<ParkButton />
			<HudButton
				onClick={onSkip}
				title="Finish this block right now — it still counts as complete, nothing is lost"
				label="Skip"
			/>
			<HudButton
				onClick={onEnd}
				title="Stop the timer without finishing it"
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

/*
 * Type here is sized for the *shrunk* HUD: on a 13" screen the whole window renders at 80%, so
 * a 10px label landed at 8px and stopped being readable at a glance.
 */
export const hudBtn: React.CSSProperties = {
	padding: "6px 9px",
	borderRadius: 8,
	border: "1px solid var(--line)",
	// A shade behind the see-through shell, so the buttons read as part of the same pane of
	// glass — but solid enough that their labels never fight with the wallpaper.
	background: "color-mix(in srgb, var(--surface-raised) 85%, transparent)",
	color: "var(--hud-text-muted)",
	cursor: "pointer",
	fontSize: 12,
	whiteSpace: "nowrap",
	minWidth: 52,
};
