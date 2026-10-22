/**
 * IEEE-754 single-precision encoding, for the Week 2 floating-point worksheet.
 *
 * `encodeFloat` deliberately returns both the *requested* decimal and the
 * *stored* decimal. The gap between them is the lesson: 4.1 is not 4.1 once it
 * has passed through 23 fraction bits.
 */

export interface FloatEncoding {
	/** The decimal the student typed. */
	value: number;
	/** Sign bit: 0 for non-negative, 1 for negative. */
	sign: 0 | 1;
	/** Absolute value that actually gets encoded. */
	abs: number;
	/** Biased exponent field (0–255). */
	exponentField: number;
	/** Unbiased exponent (`exponentField - 127`). */
	exponent: number;
	/** Integer value of the 23 fraction bits. */
	fractionField: number;
	/** 23 fraction bits, most-significant first, no `0b` prefix. */
	fractionBits: string;
	/** 32 bits, sign + exponent + fraction. */
	rawBits: string;
	/** 32 bits as eight hex digits. */
	hex: string;
	/** Decimal represented by the stored 32-bit pattern. */
	storedValue: number;
	/** `|stored − value| / |value|`; 0 for exact encodings. */
	relativeError: number;
	/** True when the pattern is +0.0 / −0.0 (all exponent and fraction bits zero). */
	isZero: boolean;
	/** Normalised binary form such as `1.1001 × 2^3`; empty for zero. */
	scientific: string;
}

const FRACTION_BITS = 23;
const EXPONENT_BITS = 8;
const BIAS = 127;
const FRACTION_SCALE = 2 ** FRACTION_BITS;

function padBits(bits: string, length: number): string {
	return bits.padStart(length, '0');
}

/** Decompose |value| into binary digits: `intPart.fractionPart`. */
function toBinaryDigits(abs: number): { integer: string; fraction: string } {
	const integer = Math.floor(abs).toString(2);
	let rest = abs - Math.floor(abs);
	let fraction = '';
	// Enough digits to fill 23 fraction bits even after normalisation.
	for (let i = 0; i < 40 && rest > 0; i++) {
		rest *= 2;
		if (rest >= 1) {
			fraction += '1';
			rest -= 1;
		} else {
			fraction += '0';
		}
	}
	return { integer, fraction };
}

export function encodeFloat(value: number): FloatEncoding {
	const sign: 0 | 1 = Object.is(value, -0) || value < 0 ? 1 : 0;
	const abs = Math.abs(value);

	if (abs === 0) {
		return {
			value,
			sign,
			abs: 0,
			exponentField: 0,
			exponent: -BIAS,
			fractionField: 0,
			fractionBits: '0'.repeat(FRACTION_BITS),
			rawBits: `${sign}` + '0'.repeat(EXPONENT_BITS + FRACTION_BITS),
			hex: sign === 1 ? '0x80000000' : '0x00000000',
			storedValue: sign === 1 ? -0 : 0,
			relativeError: 0,
			isZero: true,
			scientific: ''
		};
	}

	const { integer, fraction } = toBinaryDigits(abs);
	const digits = integer + fraction;
	const leading = digits.indexOf('1');

	if (leading === -1) {
		// Smaller than the smallest normal float this visualiser handles.
		return {
			...encodeFloat(0),
			value,
			sign,
			storedValue: sign === 1 ? -0 : 0
		};
	}

	let exponent = integer.length - 1 - leading;

	// Round the 24-bit significand (implicit 1 + 23 fraction bits) to nearest,
	// ties to even. Truncating instead would turn 0.1 into 0x3DCCCCCC rather
	// than the correct 0x3DCCCCCD, and the whole worksheet is about that gap.
	let significand = Number.parseInt(
		digits.slice(leading, leading + FRACTION_BITS + 1).padEnd(FRACTION_BITS + 1, '0'),
		2
	);
	const dropped = digits.slice(leading + FRACTION_BITS + 1);
	if (dropped.startsWith('1')) {
		const restIsNonZero = dropped.slice(1).includes('1');
		if (restIsNonZero || significand % 2 === 1) significand += 1;
	}
	if (significand === 2 ** (FRACTION_BITS + 1)) {
		// Rounding carried into the next binade (1.111… → 10.000…).
		significand = 2 ** FRACTION_BITS;
		exponent += 1;
	}
	const fractionField = significand - 2 ** FRACTION_BITS;
	const fractionBits = fractionField.toString(2).padStart(FRACTION_BITS, '0');
	const exponentField = exponent + BIAS;

	const rawBits =
		`${sign}` +
		padBits(exponentField.toString(2), EXPONENT_BITS) +
		fractionBits;
	const hex = `0x${Number.parseInt(rawBits, 2).toString(16).toUpperCase().padStart(8, '0')}`;

	const storedValue =
		(sign === 1 ? -1 : 1) * 2 ** exponent * (1 + fractionField / FRACTION_SCALE);

	const significandText = `1.${digits.slice(leading + 1, leading + 12)}`;
	const relativeError = Math.abs(storedValue - value) / Math.abs(value);

	return {
		value,
		sign,
		abs,
		exponentField,
		exponent,
		fractionField,
		fractionBits,
		rawBits,
		hex,
		storedValue,
		relativeError,
		isZero: false,
		scientific: `${sign === 1 ? '−' : ''}${significandText} × 2^${exponent}`
	};
}

/** The 23 fraction bits in groups of four, for reading against hex digits. */
export function groupFractionBits(bits: string): string {
	return bits.replace(/(.{4})(?=.)/g, '$1 ');
}

/** True when a decimal can be represented exactly in 32-bit IEEE-754. */
export function isExactFloat(value: number): boolean {
	return encodeFloat(value).relativeError === 0;
}