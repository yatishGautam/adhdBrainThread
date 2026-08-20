/**
 * Moving blocks around inside a planned day.
 *
 * A day has a shape: when it starts, how long each block runs, and the gaps between them. That
 * shape is the part you negotiated with your own attention — the walk after lunch, the twenty
 * minutes of slack before the standup — and dragging a block up or down is not a request to
 * change it. It is a request to change what *fills* it.
 *
 * So a resequence keeps the ladder — the first start and every gap, held by position rather
 * than by block — and permutes only what stands on it. Durations travel with the block, because
 * an hour of deep work is an hour wherever you drop it; a slot that resized its occupant would
 * be a drag that quietly cut your afternoon short. The sum of the durations plus the sum of the
 * gaps cannot change under a permutation, so the day still ends when it ended. Dragging can
 * reorder your afternoon; it can never make it longer.
 *
 * Inserting is the other half, and it is honest about the opposite thing: a new block is new
 * work, and new work takes time the day did not have. It fills a gap when a gap is there, and
 * otherwise pushes everything after it down.
 */
import type { PlanBlock } from './domain.js';
import { toClock, toMinutes } from './dayRun.js';

/** Where the day begins, and the pause that follows each position in it. */
interface Ladder {
	start: number;
	/** Minutes between one block's end and the next one's start. Negative where they overlap. */
	gaps: number[];
}

/**
 * The day's shape, read off the blocks as they stand.
 *
 * Overlaps are preserved rather than repaired: a negative gap is someone's real plan, and a
 * resequence is not the moment to silently rewrite it.
 */
function ladderOf(blocks: PlanBlock[]): Ladder {
	const gaps = blocks.map((block, index) => {
		const next = blocks[index + 1];
		return next ? toMinutes(next.start) - toMinutes(block.end) : 0;
	});
	return { start: blocks.length ? toMinutes(blocks[0]!.start) : 0, gaps };
}

/**
 * Lay a sequence of blocks back onto a ladder, stamping anything that actually moved.
 *
 * `pinned` is the same contract a hand edit earns: the server plans around a pinned block
 * instead of replacing it, so an order you chose survives the next regeneration. Blocks that
 * happen to land back on their own times are left alone — nudging the bottom block should not
 * pin the entire morning.
 */
function layOnLadder(sequence: PlanBlock[], ladder: Ladder): PlanBlock[] {
	let cursor = ladder.start;
	return sequence.map((block, index) => {
		const duration = toMinutes(block.end) - toMinutes(block.start);
		const start = toClock(cursor);
		const end = toClock(cursor + duration);
		cursor += duration + (ladder.gaps[index] ?? 0);
		if (start === block.start && end === block.end) return block;
		return { ...block, start, end, pinned: true };
	});
}

/**
 * Put the day's blocks in a new order, keeping the day's shape.
 *
 * `order` is the ids as the list now reads, top to bottom. It has to be a permutation of what
 * is actually in the plan — a drag that raced a sync and lost is a drag that must not be
 * applied to a day it no longer describes.
 */
export function resequenceBlocks(blocks: PlanBlock[], order: string[]): PlanBlock[] {
	const byId = new Map(blocks.map((block) => [block.id, block]));
	if (order.length !== blocks.length || order.some((id) => !byId.has(id))) {
		throw new Error('The plan changed while you were moving that block.');
	}
	const sequence = order.map((id) => byId.get(id)!);
	return layOnLadder(sequence, ladderOf(blocks));
}

/** Move one block by position, the way a keyboard nudge means it. */
export function moveBlock(blocks: PlanBlock[], from: number, to: number): PlanBlock[] {
	if (from === to || from < 0 || from >= blocks.length) return blocks;
	const target = Math.max(0, Math.min(blocks.length - 1, to));
	const order = blocks.map((block) => block.id);
	const [moved] = order.splice(from, 1);
	order.splice(target, 0, moved!);
	return resequenceBlocks(blocks, order);
}

/** The shortest slot worth calling a slot. Below this it is a gap, not a block. */
const MIN_SLOT = 15;
/** What a new block takes when it has to make its own room. */
export const DEFAULT_SLOT = 30;

/**
 * Where a new block would go if you opened a space at `index`, and how long it would be.
 *
 * A real gap gets filled — that is what the gap was for, and a day full of 30-minute defaults
 * stacked beside 20-minute holes is a day you stop trusting. A gap too small to be a block
 * means the new one has to make its own room, and `pushes` says so.
 */
export function slotAt(
	blocks: PlanBlock[],
	index: number,
	dayStart: string,
): { start: string; end: string; pushes: number } {
	const previous = blocks[index - 1];
	const next = blocks[index];
	const start = previous ? toMinutes(previous.end) : startBefore(next, dayStart);
	const gap = next ? toMinutes(next.start) - start : DEFAULT_SLOT;

	if (gap >= MIN_SLOT) {
		return { start: toClock(start), end: toClock(start + gap), pushes: 0 };
	}
	return {
		start: toClock(start),
		end: toClock(start + DEFAULT_SLOT),
		pushes: DEFAULT_SLOT - Math.max(0, gap),
	};
}

/** Opening a space above the first block borrows from the day's own start, not from nowhere. */
function startBefore(next: PlanBlock | undefined, dayStart: string): number {
	if (!next) return toMinutes(dayStart);
	return Math.min(toMinutes(dayStart), toMinutes(next.start) - DEFAULT_SLOT);
}

/**
 * Drop a new block into the day at `index`, pushing what follows if it has to.
 *
 * Unlike a resequence, this one is allowed to make the day longer — it is new work, and a
 * planner that pretended otherwise would be lying to you about your afternoon.
 */
export function insertBlock(
	blocks: PlanBlock[],
	index: number,
	block: PlanBlock,
): PlanBlock[] {
	const at = Math.max(0, Math.min(blocks.length, index));
	const push = Math.max(0, toMinutes(block.end) - startOf(blocks[at]));
	const before = blocks.slice(0, at);
	const after = blocks.slice(at).map((later) => (push > 0 ? shift(later, push) : later));
	return [...before, { ...block, pinned: true }, ...after];
}

function startOf(block: PlanBlock | undefined): number {
	return block ? toMinutes(block.start) : Number.POSITIVE_INFINITY;
}

function shift(block: PlanBlock, minutes: number): PlanBlock {
	return {
		...block,
		start: toClock(toMinutes(block.start) + minutes),
		end: toClock(toMinutes(block.end) + minutes),
	};
}
