/**
 * Base-conversion helpers for the data-representation widgets.
 *
 * Every function here is pure and total: it accepts any finite integer,
 * including negatives (interpreted as two's complement within the requested
 * bit width), and never throws on an in-range input.
 */

/** Bit widths supported by the widgets. */
export type BitWidth = 8 | 16 | 32;

/** Renders an unsigned integer, zero-padded to the requested nibble count. */
function padBinary(value: number, bitWidth: BitWidth): string {
	const unsigned = value >>> 0;
	const raw = unsigned.toString(2);
	const padded = raw.padStart(bitWidth, '0');
	return padded.slice(padded.length - bitWidth);
}

/** `0b1010 1100`-style grouping, one space between nibbles, no prefix. */
export function toBinaryGroups(value: number, bitWidth: BitWidth = 8): string {
	const bits = padBinary(value, bitWidth);
	const groups: string[] = [];
	for (let i = 0; i < bits.length; i += 4) {
		groups.push(bits.slice(i, i + 4));
	}
	return groups.join(' ');
}

/** Bare binary digits, no spacing. */
export function toBinary(value: number, bitWidth: BitWidth = 8): string {
	return padBinary(value, bitWidth);
}

/** Lowercase `0x` prefix, uppercase digits, zero-padded to the bit width. */
export function toHex(value: number, bitWidth: BitWidth = 8): string {
	const digits = bitWidth / 4;
	const hex = (value >>> 0).toString(16).toUpperCase();
	return `0x${hex.padStart(digits, '0').slice(-digits)}`;
}

/** `0o` prefix, octal digits, zero-padded to the bit width. */
export function toOctal(value: number, bitWidth: BitWidth = 8): string {
	const digits = Math.ceil(bitWidth / 3);
	const octal = (value >>> 0).toString(8);
	return `0o${octal.padStart(digits, '0').slice(-digits)}`;
}

/** Unsigned decimal, no padding. */
export function toUnsignedDecimal(value: number, bitWidth: BitWidth = 8): number {
	const mask = bitWidth === 32 ? 0xffffffff : (1 << bitWidth) - 1;
	return value & mask;
}

/** Signed decimal as two's complement at the given width. */
export function toSignedDecimal(value: number, bitWidth: BitWidth = 8): number {
	if (bitWidth === 32) return value | 0;
	const unsigned = toUnsignedDecimal(value, bitWidth);
	const signBit = 1 << (bitWidth - 1);
	return unsigned >= signBit ? unsigned - (1 << bitWidth) : unsigned;
}

/**
 * The printable ASCII character for a byte, or an em dash when the value is
 * outside 32–126. Control characters render as `␀`-style placeholders rather
 * than invisible glyphs, because an invisible readout looks like a bug.
 */
export function toAscii(value: number): string {
	const byte = value & 0xff;
	if (byte >= 32 && byte <= 126) return String.fromCharCode(byte);
	return '—';
}

/** Human-readable label for a byte's ASCII state, used by screen readers. */
export function describeAscii(value: number): string {
	const byte = value & 0xff;
	if (byte >= 32 && byte <= 126) {
		if (byte === 32) return 'space';
		return `"${String.fromCharCode(byte)}"`;
	}
	if (byte < 32) return `control character (${byte})`;
	return 'not printable ASCII';
}

/** Parses an integer in the given base, returning `null` for junk input. */
export function parseInBase(input: string, base: 2 | 8 | 10 | 16): number | null {
	const cleaned = input.trim().replace(/^0[xob]/i, '');
	if (cleaned === '') return null;
	const valid = /^[0-9a-f]+$/i.test(cleaned);
	if (!valid) return null;
	const parsed = Number.parseInt(cleaned, base);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Clamps a value into `[0, 2 ** bitWidth - 1]`, wrapping negatives. */
export function clampToWidth(value: number, bitWidth: BitWidth): number {
	const mask = bitWidth === 32 ? 0xffffffff : (1 << bitWidth) - 1;
	const wrapped = value % (mask + 1);
	return (wrapped < 0 ? wrapped + mask + 1 : wrapped) & mask;
}
