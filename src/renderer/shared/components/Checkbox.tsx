import { useState } from "react";

/**
 * One checkbox for the whole app. The old ones were a 1px border in `--line` on a near-black
 * card — technically present, invisible in practice. This one has a filled well, a border a
 * shade stronger than any other control, a hover state, and a tick that is drawn rather than
 * implied by a colour change.
 */
export function Checkbox({
	checked,
	onChange,
	disabled,
	tone = "var(--emerald)",
	size = 18,
	title,
}: {
	checked: boolean;
	onChange: () => void;
	disabled?: boolean;
	/** Blockers use clay, everything else emerald. */
	tone?: string;
	size?: number;
	title?: string;
}): React.JSX.Element {
	const [hover, setHover] = useState(false);

	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={checked}
			title={title}
			disabled={disabled}
			onClick={(event) => {
				event.stopPropagation();
				if (!disabled) onChange();
			}}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				width: size,
				height: size,
				flexShrink: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 0,
				borderRadius: 5,
				cursor: disabled ? "default" : "pointer",
				border: `1.5px solid ${checked ? tone : hover && !disabled ? tone : "var(--line-strong)"}`,
				background: checked
					? tone
					: hover && !disabled
						? "color-mix(in srgb, var(--line-strong) 30%, transparent)"
						: "var(--ink)",
				boxShadow:
					hover && !disabled && !checked
						? `0 0 0 3px color-mix(in srgb, ${tone} 15%, transparent)`
						: "none",
				transition:
					"background var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out)",
			}}
		>
			<svg
				viewBox="0 0 16 16"
				width={size - 6}
				height={size - 6}
				aria-hidden="true"
				style={{
					// A ghost tick on hover shows what the click will do before it does it.
					opacity: checked ? 1 : hover && !disabled ? 0.45 : 0,
					transition: "opacity var(--motion-fast) var(--ease-out)",
				}}
			>
				<path
					d="M3 8.5 L6.5 12 L13 4.5"
					fill="none"
					stroke={checked ? "#12160f" : "var(--text-muted)"}
					strokeWidth="2.4"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		</button>
	);
}
