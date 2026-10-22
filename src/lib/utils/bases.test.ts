import { describe, expect, it } from 'vitest';
import { convertFromDecimal, groupBinary, digitValue } from './bases';

describe('convertFromDecimal', () => {
	it('converts 42 to binary, octal and hex with the division steps', () => {
		const binary = convertFromDecimal(42, 2);
		expect(binary.digits).toBe('101010');
		expect(binary.steps).toHaveLength(6);
		expect(binary.steps[0]).toMatchObject({ dividend: 42, quotient: 21, remainder: 0, digit: '0' });
		expect(binary.steps.at(-1)).toMatchObject({ dividend: 1, quotient: 0, remainder: 1, digit: '1' });

		expect(convertFromDecimal(42, 8).digits).toBe('52');
		expect(convertFromDecimal(42, 16).digits).toBe('2A');
	});

	it('renders zero as a single digit and no steps', () => {
		const zero = convertFromDecimal(0, 2);
		expect(zero.digits).toBe('0');
		expect(zero.steps).toEqual([]);
	});

	it('uses uppercase hex digits', () => {
		expect(convertFromDecimal(255, 16).digits).toBe('FF');
	});

	it('treats invalid input as zero', () => {
		expect(convertFromDecimal(-3, 2).digits).toBe('0');
		expect(convertFromDecimal(1.5, 10 as never).digits).toBe('0');
	});
});

describe('groupBinary', () => {
	it('groups from the right into nibbles', () => {
		expect(groupBinary('101010')).toBe('0010 1010');
		expect(groupBinary('1')).toBe('0001');
	});
});

describe('digitValue', () => {
	it('accepts only digits valid in the base', () => {
		expect(digitValue('F', 16)).toBe(15);
		expect(digitValue('9', 8)).toBeNull();
		expect(digitValue('2', 2)).toBeNull();
	});
});
