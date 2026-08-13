import { useEffect, useState } from "react";
import type { Day } from "@shared/domain.js";
import { formatClock } from "@shared/format.js";
import { useSessionStore } from "../../stores/sessionStore.js";
import { useThreadStore } from "../../stores/threadStore.js";
import { useLiveClock } from "../../../shared/hooks/useLiveClock.js";
import { Button } from "../../../shared/components/Button.js";
import { Ring } from "../../../shared/components/Ring.js";
import { justStart, pickJustStart } from "../justStart.js";

/**
 * NOW (§3). One large, high-contrast field for what you are doing right now — the first thing
 * on the page and the only thing on it that is a sentence rather than a list. When a Pomodoro
 * is running the live clock sits underneath it, mirroring the HUD from the same session store.
 */
export function NowSection({
	day,
	localDate,
}: {
	day: Day | null;
	localDate: string;
}): React.JSX.Element {
	const [text, setText] = useState(day?.now ?? "");
	const state = useSessionStore((s) => s.state);
	const threads = useThreadStore((s) => s.threads);
	const tick = useLiveClock(state?.session.id ?? null);
	const remaining = tick?.remainingMs ?? state?.remainingMs ?? 0;
	const pick = pickJustStart(threads);

	useEffect(() => {
		setText(day?.now ?? "");
	}, [day?.localDate, day?.now]);

	const commit = (): void => {
		if ((day?.now ?? "") === text) return;
		void window.thread.invoke["day:setNow"]({ now: text, localDate });
	};

	return (
		<section
			// While a Pomodoro runs, the whole card breathes — the fire is lit and the page says so.
			className={state ? "breath" : undefined}
			style={{
				borderRadius: 16,
				border: "1px solid var(--line)",
				borderLeft: "3px solid var(--amber)",
				background:
					"linear-gradient(135deg, color-mix(in srgb, var(--amber) 11%, var(--surface)), color-mix(in srgb, var(--coral) 5%, var(--surface)))",
				boxShadow: "var(--shadow-card), var(--edge-light)",
				padding: "22px 24px",
			}}
		>
			<div
				style={{
					fontSize: 11,
					textTransform: "uppercase",
					letterSpacing: "0.08em",
					color: "var(--amber)",
					marginBottom: 10,
				}}
			>
				Now
			</div>
			<input
				value={text}
				placeholder="What are you doing right now?"
				onChange={(e) => setText(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => e.key === "Enter" && commit()}
				style={{
					width: "100%",
					fontSize: 26,
					fontWeight: 600,
					letterSpacing: "-0.01em",
					fontFamily: "var(--font-display)",
					color: "var(--text)",
					padding: "2px 0",
					caretColor: "var(--amber)",
				}}
			/>

			{!state && pick ? (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 12,
						marginTop: 16,
						paddingTop: 14,
						borderTop: "1px solid var(--line)",
					}}
				>
					<button
						onClick={() => void justStart(threads)}
						className="btn-launch"
						style={{
							padding: "9px 18px",
							borderRadius: 999,
							fontWeight: 700,
							fontSize: 13,
							cursor: "pointer",
							whiteSpace: "nowrap",
						}}
					>
						⚡ Just start
					</button>
					<span style={{ fontSize: 12, color: "var(--text-muted)" }}>
						25 minutes on <strong style={{ color: "var(--text)" }}>{pick.title}</strong> — no
						choosing, just go.
					</span>
				</div>
			) : null}

			{state ? (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 14,
						marginTop: 16,
						paddingTop: 14,
						borderTop: "1px solid var(--line)",
					}}
				>
					<Ring value={tick?.progress ?? 0} size={38} dim={state.paused}>
						<span className="mono" style={{ fontSize: 9 }}>
							{formatClock(remaining)}
						</span>
					</Ring>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div
							style={{
								fontSize: 13,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{state.threadTitle}
						</div>
						{state.nextAction ? (
							<div style={{ fontSize: 11, color: "var(--text-muted)" }}>
								{state.nextAction}
							</div>
						) : null}
					</div>
					<Button
						size="sm"
						onClick={() =>
							void window.thread.invoke[
								state.paused ? "session:resume" : "session:pause"
							](undefined)
						}
					>
						{state.paused ? "Resume" : "Pause"}
					</Button>
					<Button
						size="sm"
						title="Got distracted? Tap this. It adds time back and costs you nothing."
						onClick={() => void window.thread.invoke["session:park"]({})}
					>
						Park
					</Button>
					<Button
						size="sm"
						onClick={() => void window.thread.invoke["hud:show"](undefined)}
					>
						Show HUD
					</Button>
					<Button
						size="sm"
						title="Stop the timer. This does not finish the thread."
						onClick={() => void window.thread.invoke["session:end"]({})}
					>
						Stop
					</Button>
				</div>
			) : null}
		</section>
	);
}
