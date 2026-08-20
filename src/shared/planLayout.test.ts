/**
 * These tests travel with the port: the Swift copy asserts the same cases with the same
 * numbers, so the phone and the laptop cannot quietly disagree about where a dragged block
 * lands.
 */
import { describe, expect, it } from 'vitest';
import type { PlanBlock } from './domain.js';
import {
	DEFAULT_SLOT,
	insertBlock,
	moveBlock,
	resequenceBlocks,
	slotAt,
} from './planLayout.js';

function block(id: string, start: string, end: string, patch: Partial<PlanBlock> = {}): PlanBlock {
	return { id, start, end, kind: 'focus', title: id, ...patch };
}

/** 50 minutes of work, a 10 minute gap, twice — then a longer block after a 40 minute hole. */
const DAY: PlanBlock[] = [
	block('a', '09:00', '09:50'),
	block('b', '10:00', '10:50'),
	block('c', '11:30', '12:30'),
];

const times = (blocks: PlanBlock[]): string[] => blocks.map((b) => `${b.id} ${b.start}-${b.end}`);

describe('resequenceBlocks', () => {
	it('permutes what stands on the ladder without moving the ladder', () => {
		const out = resequenceBlocks(DAY, ['c', 'a', 'b']);
		// c keeps its own hour; the 10 and 40 minute gaps stay where the day put them.
		expect(times(out)).toEqual(['c 09:00-10:00', 'a 10:10-11:00', 'b 11:40-12:30']);
	});

	it('starts and ends the day exactly where it did', () => {
		for (const order of [
			['a', 'b', 'c'],
			['b', 'c', 'a'],
			['c', 'b', 'a'],
		]) {
			const out = resequenceBlocks(DAY, order);
			expect(out[0]!.start).toBe('09:00');
			expect(out[out.length - 1]!.end).toBe('12:30');
		}
	});

	it('pins what moved and leaves what did not alone', () => {
		const out = resequenceBlocks(DAY, ['a', 'c', 'b']);
		expect(out[0]!.pinned).toBeUndefined();
		expect(out[1]!.pinned).toBe(true);
		expect(out[2]!.pinned).toBe(true);
	});

	it('keeps overlaps rather than quietly repairing them', () => {
		const overlapping = [block('a', '09:00', '10:00'), block('b', '09:30', '10:30')];
		const out = resequenceBlocks(overlapping, ['b', 'a']);
		expect(times(out)).toEqual(['b 09:00-10:00', 'a 09:30-10:30']);
	});

	it('refuses an order that is not the day it describes', () => {
		expect(() => resequenceBlocks(DAY, ['a', 'b'])).toThrow(/changed/);
		expect(() => resequenceBlocks(DAY, ['a', 'b', 'ghost'])).toThrow(/changed/);
	});
});

describe('moveBlock', () => {
	it('moves one block down by position', () => {
		expect(times(moveBlock(DAY, 0, 2))).toEqual([
			'b 09:00-09:50',
			'c 10:00-11:00',
			'a 11:40-12:30',
		]);
	});

	it('moves one block up by position', () => {
		expect(times(moveBlock(DAY, 2, 0))).toEqual([
			'c 09:00-10:00',
			'a 10:10-11:00',
			'b 11:40-12:30',
		]);
	});

	it('does nothing at the ends of the list', () => {
		expect(moveBlock(DAY, 0, -1)).toEqual(DAY);
		expect(moveBlock(DAY, 2, 5)).toEqual(DAY);
		expect(moveBlock(DAY, 1, 1)).toEqual(DAY);
	});
});

describe('slotAt', () => {
	it('fills a real gap instead of inventing a default beside it', () => {
		expect(slotAt(DAY, 2, '09:00')).toEqual({ start: '10:50', end: '11:30', pushes: 0 });
	});

	it('makes its own room when the gap is too small to be a block', () => {
		expect(slotAt(DAY, 1, '09:00')).toEqual({
			start: '09:50',
			end: '10:20',
			pushes: DEFAULT_SLOT - 10,
		});
	});

	it('lands after the last block at the end of the day', () => {
		expect(slotAt(DAY, 3, '09:00')).toEqual({ start: '12:30', end: '13:00', pushes: 0 });
	});

	it('borrows from before the first block when opening a space above it', () => {
		expect(slotAt(DAY, 0, '09:00')).toEqual({ start: '08:30', end: '09:00', pushes: 0 });
	});

	it('starts at the day\'s own start when there is nothing planned yet', () => {
		expect(slotAt([], 0, '09:00')).toEqual({ start: '09:00', end: '09:30', pushes: 0 });
	});
});

describe('insertBlock', () => {
	it('slots into a gap without touching the afternoon', () => {
		const out = insertBlock(DAY, 2, block('new', '10:50', '11:30'));
		expect(times(out)).toEqual([
			'a 09:00-09:50',
			'b 10:00-10:50',
			'new 10:50-11:30',
			'c 11:30-12:30',
		]);
	});

	it('pushes what follows when it has to make room', () => {
		const out = insertBlock(DAY, 1, block('new', '09:50', '10:20'));
		expect(times(out)).toEqual([
			'a 09:00-09:50',
			'new 09:50-10:20',
			'b 10:20-11:10',
			'c 11:50-12:50',
		]);
	});

	it('pins the new block, because you made it', () => {
		expect(insertBlock(DAY, 3, block('new', '12:30', '13:00'))[3]!.pinned).toBe(true);
	});
});
