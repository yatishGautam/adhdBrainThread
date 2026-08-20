import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Dragging a row up or down a list, with the rest of the list parting to make room.
 *
 * Pointer events rather than HTML5 drag-and-drop: the native API hands you a translucent ghost
 * of the row, fires `dragover` at the browser's own cadence and refuses to tell you where the
 * cursor actually is — three ways of feeling approximate at exactly the moment the user is
 * asking "does this land where I mean it to".
 *
 * Geometry is measured once, when the drag starts. Rows are not all the same height here — a
 * block with a reason under it is taller — so the snap has to read real rects rather than
 * multiply an assumed row height. Everything after that is arithmetic on numbers that cannot
 * change underneath it mid-gesture.
 */
export interface RowDrag {
	/** The row being carried, by index, or null when nothing is moving. */
	from: number | null;
	/** Where it would land if you let go now. */
	to: number | null;
	/** Pixels to translate row `index` by, so the list parts around the gap. */
	offsetOf: (index: number) => number;
	/** Attach to each row's element, in render order. */
	register: (index: number) => (element: HTMLElement | null) => void;
	/** Call from the grip's `onPointerDown`. */
	grab: (index: number, event: React.PointerEvent) => void;
	/** Move a row without a mouse — the same commit, from the keyboard. */
	nudge: (index: number, delta: number) => void;
}

export interface Rect {
	top: number;
	height: number;
}

interface Active {
	from: number;
	to: number;
	dy: number;
	rects: Rect[];
}

/**
 * `onCommit` is handed the new order as indices into the original list. It fires once, on
 * release, and only when something actually moved — a drag that ends where it started is a
 * decision not to move, and writing it to the server anyway would burn a sync on nothing.
 */
export function useRowDrag(
	count: number,
	onCommit: (from: number, to: number) => void,
): RowDrag {
	const elements = useRef<(HTMLElement | null)[]>([]);
	const [active, setActive] = useState<Active | null>(null);
	// The live drag, readable from the window listeners without re-subscribing on every frame.
	const live = useRef<Active | null>(null);
	const commit = useRef(onCommit);
	commit.current = onCommit;

	const register = useCallback(
		(index: number) => (element: HTMLElement | null) => {
			elements.current[index] = element;
		},
		[],
	);

	const grab = useCallback((index: number, event: React.PointerEvent): void => {
		if (event.button !== 0) return;
		event.preventDefault();

		const rects = elements.current.slice(0, count).map((element) => {
			const box = element?.getBoundingClientRect();
			return { top: box?.top ?? 0, height: box?.height ?? 0 };
		});
		const started: Active = { from: index, to: index, dy: 0, rects };
		live.current = started;
		setActive(started);

		const startY = event.clientY;

		const move = (moveEvent: PointerEvent): void => {
			const current = live.current;
			if (!current) return;
			const dy = moveEvent.clientY - startY;
			const next = { ...current, dy, to: landingFor(current.rects, current.from, dy) };
			live.current = next;
			setActive(next);
		};

		const end = (): void => {
			const finished = live.current;
			live.current = null;
			setActive(null);
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', end);
			window.removeEventListener('pointercancel', cancel);
			if (finished && finished.to !== finished.from) {
				commit.current(finished.from, finished.to);
			}
		};

		// Escape and a cancelled pointer mean the same thing: put it back, write nothing.
		const cancel = (): void => {
			live.current = null;
			setActive(null);
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', end);
			window.removeEventListener('pointercancel', cancel);
		};

		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', end);
		window.addEventListener('pointercancel', cancel);
	}, [count]);

	useEffect(() => {
		if (!active) return;
		const onKey = (event: KeyboardEvent): void => {
			if (event.key !== 'Escape') return;
			live.current = null;
			setActive(null);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [active]);

	const offsetOf = useCallback(
		(index: number): number => {
			if (!active) return 0;
			const { from, to, dy, rects } = active;
			if (index === from) return dy;
			const height = rects[from]?.height ?? 0;
			if (to > from && index > from && index <= to) return -height;
			if (to < from && index < from && index >= to) return height;
			return 0;
		},
		[active],
	);

	const nudge = useCallback(
		(index: number, delta: number): void => {
			const to = index + delta;
			if (to < 0 || to >= count) return;
			commit.current(index, to);
		},
		[count],
	);

	return { from: active?.from ?? null, to: active?.to ?? null, offsetOf, register, grab, nudge };
}

/**
 * Where the carried row would land.
 *
 * The rule is the one a hand expects: a row is passed when the leading edge of what you are
 * carrying crosses that row's middle. Comparing centre-to-centre instead would make you drag a
 * full row past its neighbour before anything moved, which reads as the list ignoring you.
 */
export function landingFor(rects: Rect[], from: number, dy: number): number {
	const carried = rects[from];
	if (!carried) return from;
	const top = carried.top + dy;
	const bottom = top + carried.height;

	let landing = from;
	for (let index = from + 1; index < rects.length; index += 1) {
		const rect = rects[index]!;
		if (bottom > rect.top + rect.height / 2) landing = index;
	}
	for (let index = from - 1; index >= 0; index -= 1) {
		const rect = rects[index]!;
		if (top < rect.top + rect.height / 2) landing = index;
	}
	return landing;
}
