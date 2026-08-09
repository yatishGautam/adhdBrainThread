import { useEffect, useState } from "react";
import type { SessionState, SessionTick } from "@shared/ipc/channels.js";
import { MiniRing } from "./MiniRing.js";
import { ThreadLabel } from "./ThreadLabel.js";
import { Countdown } from "./Countdown.js";
import { ControlBar } from "./ControlBar.js";
import { HudToast } from "./HudToast.js";
import { EmptyHud } from "./EmptyHud.js";
import { computeUrgency } from "./urgency.js";

/**
 * Two rows: the thread title gets the full width to itself (it was being squeezed down to a
 * single letter when it shared a row with the button strip), and the ring/clock/buttons sit
 * below. Calm and still for most of the session — motion is reserved for the final stretch,
 * where a slow pulse gives the clock a felt sense of closing in.
 */
export function HudApp(): React.JSX.Element {
	const [state, setState] = useState<SessionState | null>(null);
	const [tick, setTick] = useState<SessionTick | null>(null);
	const [toast, setToast] = useState<string | null>(null);

	useEffect(() => {
		window.thread.invoke["session:state"](undefined).then(setState);
		const offChanged = window.thread.on("session:changed", (next) => {
			setState(next);
			if (!next) setTick(null);
		});
		const offTick = window.thread.on("session:tick", setTick);
		const offToast = window.thread.on("hud:toast", ({ text }) => {
			setToast(text);
			setTimeout(() => setToast(null), 1500);
		});
		return () => {
			offChanged();
			offTick();
			offToast();
		};
	}, []);

	const remainingMs = tick?.remainingMs ?? state?.remainingMs ?? 0;
	const progress = tick?.progress ?? 0;
	const paused = state?.paused ?? false;
	const urgency = computeUrgency(progress);

	return (
		<div
			style={
				{
					width: "100vw",
					height: "100vh",
					position: "relative",
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					gap: 8,
					padding: "10px 14px",
					background: "var(--surface)",
					border: "1px solid var(--line)",
					borderRadius: 22,
					opacity: paused ? 0.75 : 1,
					transition: "opacity var(--motion-slow) var(--ease-out)",
					// The whole HUD doubles as its own drag handle; only interactive controls opt out.
					WebkitAppRegion: "drag",
				} as React.CSSProperties
			}
		>
			{!state ? (
				<EmptyHud />
			) : (
				<>
					<ThreadLabel
						title={state.threadTitle}
						nextAction={state.nextAction}
					/>
					<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
						<MiniRing progress={progress} paused={paused} urgency={urgency} />
						<Countdown remainingMs={remainingMs} paused={paused} urgency={urgency} />
						<div style={{ flex: 1 }} />
						<ControlBar
							paused={paused}
							onPauseResume={() =>
								void window.thread.invoke[
									paused ? "session:resume" : "session:pause"
								](undefined)
							}
							onDistraction={(kind, note) =>
								void window.thread.invoke["session:distraction"]({ kind, note })
							}
							onSkip={() =>
								void window.thread.invoke["session:end"]({ outcome: "completed" })
							}
							onEnd={() => void window.thread.invoke["session:end"]({})}
						/>
					</div>
				</>
			)}
			<HudToast text={toast} />
		</div>
	);
}
