import { useEffect, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import type {
	SessionState,
	SessionTick,
	StageState,
} from "@shared/ipc/channels.js";
import { MiniRing } from "./MiniRing.js";
import { ThreadLabel } from "./ThreadLabel.js";
import { Countdown } from "./Countdown.js";
import { ControlBar } from "./ControlBar.js";
import { StagePanel } from "./StagePanel.js";
import { HudToast } from "./HudToast.js";
import { EmptyHud } from "./EmptyHud.js";
import { computeUrgency } from "./urgency.js";
import { playStageChime } from "./chime.js";

/**
 * Two rows: the thread title gets the full width to itself, and the ring/clock/buttons sit
 * below. Calm and still for most of a block — motion is reserved for the final stretch and for
 * a stage ending, where the HUD pops, glows and shakes so a finished Pomodoro cannot be missed.
 *
 * Between stages the session is gone but the cycle is not, so the same window shows the paused
 * next stage instead of the "nothing running" state.
 */
export function HudApp(): React.JSX.Element {
	const [state, setState] = useState<SessionState | null>(null);
	const [stage, setStage] = useState<StageState | null>(null);
	const [tick, setTick] = useState<SessionTick | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const shell = useAnimationControls();

	useEffect(() => {
		window.thread.invoke["session:state"](undefined).then(setState);
		window.thread.invoke["stage:state"](undefined).then(setStage);

		const offChanged = window.thread.on("session:changed", (next) => {
			setState(next);
			if (!next) setTick(null);
			if (next) setStage(null);
		});
		const offTick = window.thread.on("session:tick", setTick);
		const offStage = window.thread.on("stage:changed", setStage);
		const offStageTick = window.thread.on("stage:tick", ({ remainingMs }) => {
			setStage((current) => (current ? { ...current, remainingMs } : current));
		});
		const offToast = window.thread.on("hud:toast", ({ text }) => {
			setToast(text);
			setTimeout(() => setToast(null), 1500);
		});
		const offAttention = window.thread.on("hud:attention", ({ stage: ended }) => {
			playStageChime(ended);
			void shell.start({
				scale: [1, 1.06, 1, 1.03, 1],
				x: [0, -7, 7, -4, 4, 0],
				boxShadow: [
					"0 0 0 0 rgba(242,166,90,0)",
					"0 0 28px 6px rgba(242,166,90,0.5)",
					"0 0 0 0 rgba(242,166,90,0)",
				],
				transition: { duration: 0.85, ease: "easeInOut" },
			});
		});

		return () => {
			offChanged();
			offTick();
			offStage();
			offStageTick();
			offToast();
			offAttention();
		};
	}, [shell]);

	const remainingMs = tick?.remainingMs ?? state?.remainingMs ?? 0;
	const progress = tick?.progress ?? 0;
	const paused = state?.paused ?? false;
	const urgency = computeUrgency(progress);
	// Waiting for Resume: a gentle pulse so the HUD cannot be lost among other windows.
	const waiting = !state && stage !== null && !stage.running;

	return (
		<motion.div
			animate={shell}
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
			<motion.div
				animate={waiting ? { opacity: [1, 0.62, 1] } : { opacity: 1 }}
				transition={
					waiting
						? { duration: 2, repeat: Infinity, ease: "easeInOut" }
						: { duration: 0.2 }
				}
				style={{ display: "flex", flexDirection: "column", gap: 8 }}
			>
				{state ? (
					<>
						<ThreadLabel
							title={state.threadTitle}
							nextAction={state.nextAction}
						/>
						<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
							<MiniRing progress={progress} paused={paused} urgency={urgency} />
							<Countdown
								remainingMs={remainingMs}
								paused={paused}
								urgency={urgency}
							/>
							<div style={{ flex: 1 }} />
							<ControlBar
								paused={paused}
								onPauseResume={() =>
									void window.thread.invoke[
										paused ? "session:resume" : "session:pause"
									](undefined)
								}
								onSkip={() =>
									void window.thread.invoke["session:end"]({
										outcome: "completed",
									})
								}
								onEnd={() => void window.thread.invoke["session:end"]({})}
							/>
						</div>
					</>
				) : stage ? (
					<StagePanel stage={stage} />
				) : (
					<EmptyHud />
				)}
			</motion.div>
			<HudToast text={toast} />
		</motion.div>
	);
}
