import type { ReactNode } from "react";
import type { ThreadStatus } from "@shared/domain.js";
import styles from "./Chip.module.css";

export type Tone =
	| "amber"
	| "slate"
	| "moss"
	| "lavender"
	| "danger"
	| "emerald"
	| "clay";

/**
 * Every status pairs a colour with an icon and a label, so status survives a glance and
 * colour-blindness (§9). `idle` is legacy — records written before the Blocked/Dormant split
 * still carry it, so it renders, but it is not offered in the picker.
 */
export const STATUS_META: Record<
	ThreadStatus,
	{ label: string; icon: string; tone: Tone }
> = {
	in_progress: { label: "In progress", icon: "●", tone: "emerald" },
	blocked: { label: "Blocked", icon: "■", tone: "clay" },
	waiting: { label: "Waiting", icon: "◐", tone: "amber" },
	done: { label: "Done", icon: "✓", tone: "slate" },
	dormant: { label: "Dormant", icon: "◌", tone: "slate" },
	idle: { label: "Idle", icon: "○", tone: "lavender" },
};

/** The colour a status card is tinted and left-bordered with. */
export function statusColor(status: ThreadStatus): string {
	return `var(--${STATUS_META[status].tone})`;
}

export function StatusChip({
	status,
}: {
	status: ThreadStatus;
}): React.JSX.Element {
	const meta = STATUS_META[status];
	return (
		<span
			className={`${styles.chip} ${styles[meta.tone]} ${status === "in_progress" ? styles.pulse : ""}`}
		>
			<span aria-hidden="true">{meta.icon}</span>
			{meta.label}
		</span>
	);
}

export function Chip({
	tone = "lavender",
	children,
}: {
	tone?: Tone;
	children: ReactNode;
}): React.JSX.Element {
	return <span className={`${styles.chip} ${styles[tone]}`}>{children}</span>;
}
