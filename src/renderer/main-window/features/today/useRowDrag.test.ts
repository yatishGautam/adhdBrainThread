/**
 * The snap rule, on its own. This is the part a drag is judged by — a list that decides late
 * feels like it is ignoring you, and one that decides early feels like it is guessing.
 */
import { describe, expect, it } from 'vitest';
import { landingFor, type Rect } from './useRowDrag.js';

/** Four 40px rows, stacked. */
const EVEN: Rect[] = [0, 40, 80, 120].map((top) => ({ top, height: 40 }));

/** A taller second row — a block with a reason printed under it. */
const UNEVEN: Rect[] = [
	{ top: 0, height: 40 },
	{ top: 40, height: 70 },
	{ top: 110, height: 40 },
];

describe('landingFor', () => {
	it('stays put until the carried row has passed half of its neighbour', () => {
		expect(landingFor(EVEN, 0, 0)).toBe(0);
		expect(landingFor(EVEN, 0, 19)).toBe(0);
		expect(landingFor(EVEN, 0, 21)).toBe(1);
	});

	it('reads the same going up', () => {
		expect(landingFor(EVEN, 3, -19)).toBe(3);
		expect(landingFor(EVEN, 3, -21)).toBe(2);
	});

	it('crosses more than one row in a long drag', () => {
		expect(landingFor(EVEN, 0, 61)).toBe(2);
		expect(landingFor(EVEN, 0, 200)).toBe(3);
		expect(landingFor(EVEN, 3, -200)).toBe(0);
	});

	it('measures the neighbour it is passing, not an assumed row height', () => {
		// Row 1 is 70px: its middle is at 75, so a 40px row starting at 0 has to travel 35.
		expect(landingFor(UNEVEN, 0, 34)).toBe(0);
		expect(landingFor(UNEVEN, 0, 36)).toBe(1);
	});

	it('cannot be dragged off either end of the list', () => {
		expect(landingFor(EVEN, 0, -500)).toBe(0);
		expect(landingFor(EVEN, 3, 500)).toBe(3);
	});
});
