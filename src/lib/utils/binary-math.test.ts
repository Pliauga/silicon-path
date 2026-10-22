import { describe, expect, it } from 'vitest';
import { bitsNeeded, computeBinary, displayResult, formatBinary } from './binary-math';

describe('bitsNeeded', () => {
	it('counts the bits of the magnitude', () => {
		expect(bitsNeeded(0)).toBe(1);
		expect(bitsNeeded(1)).toBe(1);
		expect(bitsNeeded(255)).toBe(8);
		expect(bitsNeeded(256)).toBe(9);
	});
});

describe('computeBinary addition', () => {
	it('adds 159 + 147 and reports the carry out of a byte', () => {
		const computation = computeBinary('add', 159, 147);
		expect(computation.width).toBe(8);
		expect(computation.result).toBe(50);
		expect(computation.carryOut).toBe(1);
		expect(computation.exact).toBe(306);
		expect(computation.wrapped).toBe(true);
		expect(computation.columns).toHaveLength(8);
		expect(displayResult(computation)).toContain('306');
	});

	it('carries across three columns', () => {
		const computation = computeBinary('add', 0b0111, 0b0001);
		const columns = computation.columns;
		expect(columns.slice(0, 4).map((column) => column.carryOut)).toEqual([1, 1, 1, 0]);
		expect(computation.result).toBe(8);
	});
});

describe('computeBinary subtraction', () => {
	it('subtracts 138 - 75 without a borrow out', () => {
		const computation = computeBinary('subtract', 138, 75);
		expect(computation.result).toBe(63);
		expect(computation.carryOut).toBe(0);
		expect(displayResult(computation)).toBe('63');
	});

	it('borrows across zero columns', () => {
		const computation = computeBinary('subtract', 0b1000, 0b0001);
		expect(computation.result).toBe(7);
		expect(computation.columns.slice(0, 4).map((column) => column.carryOut)).toEqual([1, 1, 1, 0]);
	});

	it('reports a borrow out when the minuend is smaller', () => {
		const computation = computeBinary('subtract', 3, 5);
		expect(computation.result).toBe(254);
		expect(computation.carryOut).toBe(1);
		expect(displayResult(computation)).toContain('-2');
	});
});

describe('formatBinary', () => {
	it('pads to the requested width', () => {
		expect(formatBinary(50, 8)).toBe('00110010');
		expect(formatBinary(1, 4)).toBe('0001');
	});
});
