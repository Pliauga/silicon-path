/**
 * Base conversion, with the long-division steps kept alongside the answer.
 *
 * The worksheet asks students to *show their working*, so the widget cannot
 * stop at `42₁₀ = 101010₂`: it has to expose the repeated division that
 * produced those digits, in the order the algorithm produces them (least
 * significant first), and then say plainly that the answer is read upwards.
 */

export type ConversionBase = 2 | 8 | 16;

export interface BaseStep {
	/** 1-based position in the division sequence. */
	step: number;
	dividend: number;
	divisor: ConversionBase;
	quotient: number;
	remainder: number;
	/** The digit that remainder becomes in the target base. */
	digit: string;
}

export interface BaseConversion {
	base: ConversionBase;
	/** Digits in conventional order, most significant first. */
	digits: string;
	/** Division steps in the order they are performed (least significant first). */
	steps: BaseStep[];
}

export const BASE_LABELS: Record<ConversionBase, string> = {
	2: 'Binary',
	8: 'Octal',
	16: 'Hexadecimal'
};

export const BASE_PREFIXES: Record<ConversionBase, string> = {
	2: '0b',
	8: '0o',
	16: '0x'
};

/** Maximum decimal value the worksheet widget accepts. */
export const MAX_CONVERSION_VALUE = 1_000_000;

const DIGITS = '0123456789ABCDEF';

/** One digit of `value` in `base`, uppercase for hexadecimal. */
export function digitFor(value: number, base: ConversionBase): string {
	return value >= 0 && value < base ? (DIGITS[value] ?? '') : '';
}

/** True when `value` is a whole number the widget can convert. */
export function isValidValue(value: number): boolean {
	return Number.isInteger(value) && value >= 0 && value <= MAX_CONVERSION_VALUE;
}

/**
 * Repeated division by `base`, stopping when the quotient reaches zero.
 * `0` converts to `0` with no division steps.
 */
export function convertFromDecimal(value: number, base: ConversionBase): BaseConversion {
	const safe = isValidValue(value) ? value : 0;
	const steps: BaseStep[] = [];
	let dividend = safe;
	let step = 1;

	while (dividend > 0) {
		const quotient = Math.floor(dividend / base);
		const remainder = dividend % base;
		steps.push({
			step,
			dividend,
			divisor: base,
			quotient,
			remainder,
			digit: digitFor(remainder, base)
		});
		dividend = quotient;
		step += 1;
	}

	const digits =
		steps.length === 0
			? '0'
			: steps
					.map((entry) => entry.digit)
					.reverse()
					.join('');

	return { base, digits, steps };
}

/** Splits a binary string into nibbles for readability: `1010 1100`. */
export function groupBinary(digits: string): string {
	const padded = digits.padStart(Math.ceil(digits.length / 4) * 4, '0');
	return padded.match(/.{1,4}/g)?.join(' ') ?? padded;
}

/** Decimal value of a digit in a given base, or `null` when invalid. */
export function digitValue(digit: string, base: ConversionBase): number | null {
	const index = DIGITS.indexOf(digit.toUpperCase());
	return index >= 0 && index < base ? index : null;
}