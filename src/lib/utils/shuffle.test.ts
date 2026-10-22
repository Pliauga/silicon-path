import { describe, expect, it } from 'vitest';
import { seededOrder } from './shuffle';

describe('seededOrder', () => {
	it('returns a permutation of 0..n-1', () => {
		for (const n of [0, 1, 2, 3, 4, 5, 8]) {
			const order = seededOrder(n, 'm01-quiz-bits');
			expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
		}
	});

	it('is deterministic for a given seed', () => {
		expect(seededOrder(4, 'm02-quiz-wrap')).toEqual(seededOrder(4, 'm02-quiz-wrap'));
	});

	it('differs between seeds often enough to break a positional habit', () => {
		const firsts = new Set<number>();
		for (let i = 0; i < 40; i += 1) firsts.add(seededOrder(4, `quiz-${i}`)[0] as number);
		expect(firsts.size).toBe(4);
	});
});
