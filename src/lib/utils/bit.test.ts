import { describe, expect, it } from 'vitest';
import {
	getBit,
	setBit,
	toggleBit,
	countSetBits,
	bitsToValue,
	valueToBits,
	highestSetBit
} from './bit';
import { toBinary, toHex, toSignedDecimal, toOctal, toAscii, parseInBase } from './number';

/**
 * The pure logic behind BitToggle. These are the checks that keep the widget's
 * readouts honest — if any of these drift, the lesson teaches the wrong number.
 */
describe('bit helpers', () => {
	it('reads bits least-significant first', () => {
		// 0b1010_0101 → bits 0,2,5,7 set
		expect(getBit(0b1010_0101, 0)).toBe(true);
		expect(getBit(0b1010_0101, 1)).toBe(false);
		expect(getBit(0b1010_0101, 7)).toBe(true);
	});

	it('toggles a single bit without touching its neighbours', () => {
		expect(toggleBit(0b1010_0101, 0)).toBe(0b1010_0100);
		expect(toggleBit(0b1010_0100, 0)).toBe(0b1010_0101);
	});

	it('sets and clears a bit explicitly', () => {
		expect(setBit(0, 3, true)).toBe(0b0000_1000);
		expect(setBit(0b1111_1111, 3, false)).toBe(0b1111_0111);
	});

	it('counts set bits', () => {
		expect(countSetBits(0b1010_0101)).toBe(4);
		expect(countSetBits(0)).toBe(0);
		expect(countSetBits(0xff)).toBe(8);
	});

	it('round-trips through bitsToValue and valueToBits', () => {
		const bits = valueToBits(0b1010_0101, 8);
		expect(bitsToValue([...bits].reverse())).toBe(0b1010_0101);
	});

	it('reports the highest set bit', () => {
		expect(highestSetBit(0b0000_1000)).toBe(3);
		expect(highestSetBit(0)).toBeNull();
	});
});

describe('number formatting', () => {
	it('pads binary to the requested width', () => {
		expect(toBinary(0b1010_0101, 8)).toBe('10100101');
		expect(toBinary(1, 8)).toBe('00000001');
	});

	it('formats hex as two digits, prefixed, uppercase', () => {
		expect(toHex(0b1010_0101)).toBe('0xA5');
		expect(toHex(1)).toBe('0x01');
	});

	it('formats octal', () => {
		expect(toOctal(0b1010_0101)).toBe('0o245');
	});

	it('maps printable bytes to ASCII and dashes the rest', () => {
		expect(toAscii(0x41)).toBe('A');
		expect(toAscii(0x20)).toBe(' ');
		expect(toAscii(0x00)).toBe('—');
		expect(toAscii(0xff)).toBe('—');
	});

	it('parses input in an explicit base and rejects junk', () => {
		expect(parseInBase('0xff', 16)).toBe(255);
		expect(parseInBase('1010', 2)).toBe(10);
		expect(parseInBase('nope!', 10)).toBeNull();
		expect(parseInBase('   ', 10)).toBeNull();
	});

	it('interprets the same byte as signed two’s complement', () => {
		expect(toSignedDecimal(0b1010_0101, 8)).toBe(-91);
		expect(toSignedDecimal(0b0111_1111, 8)).toBe(127);
		expect(toSignedDecimal(0b1000_0000, 8)).toBe(-128);
	});
});
