export function EmptyHud(): React.JSX.Element {
	return (
		<div
			onClick={() => void window.thread.invoke["hud:hide"](undefined)}
			style={{
				flex: 1,
				fontSize: 13,
				color: "var(--hud-text-faint)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				cursor: "pointer",
			}}
		>
			Nothing running — open ADHD Superpower to pick something
		</div>
	);
}
