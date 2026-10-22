import { describe, expect, it } from 'vitest';
import { applyGate, gateLabel, tiedOutput, truthTableFor } from './logic';

describe('logic gates', () => {
	it('computes the four truth tables', () => {
		expect(truthTableFor('and')).toEqual([
			{ a: 0, b: 0, y: 0 },
			{ a: 0, b: 1, y: 0 },
			{ a: 1, b: 0, y: 0 },
			{ a: 1, b: 1, y: 1 }
		]);
		expect(truthTableFor('or').map((row) => row.y)).toEqual([0, 1, 1, 1]);
		expect(truthTableFor('xor').map((row) => row.y)).toEqual([0, 1, 1, 0]);
		// NOT only reads A; B is ignored, so the table repeats each A value twice.
		expect(truthTableFor('not').map((row) => row.y)).toEqual([1, 1, 0, 0]);
	});

	it('names the gates as the worksheet does', () => {
		expect(gateLabel('and')).toBe('A AND B');
		expect(gateLabel('or')).toBe('A OR B');
		expect(gateLabel('xor')).toBe('A XOR B');
		expect(gateLabel('not')).toBe('NOT A');
	});

	it('reduces (AB)(A + B) to AB', () => {
		// The worksheet asks students to simplify Y = (AB)(A + B); by absorption
		// it is AB, so the tied output must equal AND for all four rows.
		for (const { a, b } of truthTableFor('and')) {
			expect(tiedOutput(a, b)).toBe(applyGate('and', a, b));
		}
	});
});