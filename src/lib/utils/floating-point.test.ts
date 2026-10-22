import { describe, expect, it } from 'vitest';
import { encodeFloat, isExactFloat, groupFractionBits } from './floating-point';

describe('encodeFloat', () => {
	it('encodes an exactly representable value', () => {
		const bits = encodeFloat(12.5);
		expect(bits.hex).toBe('0x41480000');
		expect(bits.sign).toBe(0);
		expect(bits.exponent).toBe(3);
		expect(bits.scientific).toBe('1.1001 × 2^3');
		expect(bits.storedValue).toBe(12.5);
		expect(bits.relativeError).toBe(0);
		expect(isExactFloat(12.5)).toBe(true);
	});

	it('shows the rounding gap for 0.1', () => {
		const bits = encodeFloat(0.1);
		expect(bits.hex).toBe('0x3DCCCCCD');
		expect(bits.storedValue).toBeCloseTo(0.1, 8);
		expect(bits.relativeError).toBeGreaterThan(0);
		expect(isExactFloat(0.1)).toBe(false);
	});

	it('handles zero and negative zero', () => {
		expect(encodeFloat(0).isZero).toBe(true);
		expect(encodeFloat(0).hex).toBe('0x00000000');
		const negativeZero = encodeFloat(-0);
		expect(negativeZero.isZero).toBe(true);
		expect(negativeZero.sign).toBe(1);
		expect(negativeZero.hex).toBe('0x80000000');
	});

	it('groups the fraction field in reading-sized chunks', () => {
		expect(groupFractionBits('10010000000000000000000')).toBe('1001 0000 0000 0000 0000 000');
	});
});