import type { StageState } from "@shared/ipc/channels.js";
import { formatClock } from "@shared/format.js";
import { HudButton } from "./ControlBar.js";
import { ParkButton } from "./ParkButton.js";

/**
 * The paused moment between stages (§4). A stage never auto-starts, so this is what the HUD
 * shows when a focus block or a break has ended: what is next, how long it is, and a Resume
 * button. Nothing here counts as focus and nothing here reaches the dashboard.
 */
export function StagePanel({ stage }: { stage: StageState }): React.JSX.Element {
	const isBreak = stage.kind === "break";

	return (
		<>
			<div style={{ minWidth: 0, textAlign: "center" }}>
				<div style={{ fontSize: 15, fontWeight: 600 }}>
					{isBreak ? "Break" : "Next: focus"}
				</div>
				<div
					title={stage.threadTitle}
					style={{
						fontSize: 12,
						color: "var(--hud-text-muted)",
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
						marginTop: 1,
					}}
				>
					{stage.threadTitle}
				</div>
			</div>

			<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
				<span
					className="mono"
					style={{
						fontSize: 26,
						lineHeight: 1,
						fontWeight: 600,
						color: isBreak ? "var(--moss)" : "var(--amber)",
					}}
				>
					{formatClock(stage.remainingMs)}
				</span>
				{!stage.running ? (
					<span style={{ fontSize: 10, color: "var(--hud-text-faint)" }}>
						WAITING FOR YOU
					</span>
				) : null}
				<div style={{ flex: 1 }} />

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
						onClick={() => void window.thread.invoke["stage:resume"](undefined)}
						title={
							isBreak
								? "Start the break — it will not start on its own"
								: "Start the next focus block"
						}
						label={stage.running ? "Running" : "Resume"}
					/>
					<ParkButton />
					<HudButton
						onClick={() => void window.thread.invoke["stage:skip"](undefined)}
						title={isBreak ? "Skip the break" : "Start now"}
						label="Skip"
					/>
					<HudButton
						onClick={() => void window.thread.invoke["stage:stop"](undefined)}
						title="Leave the cycle. Nothing is lost."
						label="Stop"
					/>
				</div>
			</div>
		</>
	);
}
