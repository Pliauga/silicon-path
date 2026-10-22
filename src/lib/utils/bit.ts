import type { BitWidth } from './number';

/**
 * Bit-level helpers for the data-representation widgets.
 *
 * Bits are addressed least-significant first: index 0 is the 1s column, so an
 * eight-bit readout labelled 7…0 left-to-right is the conventional way a
 * programmer reads a byte.
 */

/** All bit indices for a width, most-significant first (7…0 for a byte). */
export function bitIndices(bitWidth: BitWidth): number[] {
	const indices: number[] = [];
	for (let i = bitWidth - 1; i >= 0; i -= 1) indices.push(i);
	return indices;
}

/** True when the bit at `index` is set in `value`. */
export function getBit(value: number, index: number): boolean {
	return ((value >>> index) & 1) === 1;
}

/** Returns a new value with the bit at `index` flipped. */
export function toggleBit(value: number, index: number): number {
	return (value ^ (1 << index)) >>> 0;
}

/** Returns a new value with the bit at `index` set to `state`. */
export function setBit(value: number, index: number, state: boolean): number {
	return state ? (value | (1 << index)) >>> 0 : (value & ~(1 << index)) >>> 0;
}

/** Counts set bits (popcount). */
export function countSetBits(value: number): number {
	let count = 0;
	let v = value >>> 0;
	while (v) {
		v &= v - 1;
		count += 1;
	}
	return count;
}

/** Builds a byte value from an MSB-first array of booleans. */
export function bitsToValue(bits: readonly boolean[]): number {
	return bits.reduce((acc, bit) => (acc << 1) | (bit ? 1 : 0), 0) >>> 0;
}

/** Splits a value into per-index states, lowest index first. */
export function valueToBits(value: number, bitWidth: BitWidth): boolean[] {
	const bits: boolean[] = [];
	for (let i = 0; i < bitWidth; i += 1) bits.push(getBit(value, i));
	return bits;
}

/** Index of the most-significant set bit, or `null` for zero. */
export function highestSetBit(value: number): number | null {
	if (value === 0) return null;
	return Math.floor(Math.log2(value >>> 0));
}
