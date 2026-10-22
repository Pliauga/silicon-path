/**
 * Column-by-column binary addition and subtraction.
 *
 * The result alone teaches nothing; the worksheet is about the carry and the
 * borrow. This module returns both the answer and the working — one record per
 * bit column, least-significant first, exactly the order the hardware walks.
 */

export type BinaryOperation = 'add' | 'subtract';

export interface BinaryColumn {
	/** Bit position, 0 = least significant. */
	index: number;
	a: number;
	b: number;
	/** Carry into this column for addition; borrow into it for subtraction. */
	carryIn: number;
	result: number;
	/** Carry out of this column for addition; borrow out for subtraction. */
	carryOut: number;
}

export interface BinaryComputation {
	op: BinaryOperation;
	/** Number of operand columns shown (at least 8). */
	width: number;
	a: number;
	b: number;
	columns: BinaryColumn[];
	/** Result masked to `width` bits. */
	result: number;
	/** Final carry (addition) or final borrow (subtraction). */
	carryOut: number;
	/** True arithmetic value: `a + b`, or `a - b` when it is non-negative. */
	exact: number;
	/** True when addition overflowed or subtraction went below zero. */
	wrapped: boolean;
}

/** Maximum operand the widget accepts. */
export const MAX_OPERAND = 4095;

/** Number of bits needed to write `value` in binary (`0` needs one). */
export function bitsNeeded(value: number): number {
	if (value <= 0) return 1;
	return Math.floor(Math.log2(value)) + 1;
}

/** Operand width: at least a byte, and always enough for the larger input. */
export function operandWidth(a: number, b: number): number {
	return Math.max(8, bitsNeeded(a), bitsNeeded(b));
}

/** Bit `index` of `value`, reading from the least-significant end. */
export function bitAt(value: number, index: number): number {
	return (value >>> index) & 1;
}

/** Binary text of `value`, zero-padded to `width`. */
export function formatBinary(value: number, width: number): string {
	return (value >>> 0).toString(2).padStart(width, '0').slice(-width);
}

/** Clamps a user-entered operand to the widget's range. */
export function clampOperand(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(MAX_OPERAND, Math.max(0, Math.trunc(value)));
}

/** Runs the column algorithm for the requested operation. */
export function computeBinary(
	op: BinaryOperation,
	a: number,
	b: number,
	width = operandWidth(a, b)
): BinaryComputation {
	const columns: BinaryColumn[] = [];
	let carry = 0;

	for (let index = 0; index < width; index += 1) {
		const aBit = bitAt(a, index);
		const bBit = bitAt(b, index);

		if (op === 'add') {
			const total = aBit + bBit + carry;
			columns.push({
				index,
				a: aBit,
				b: bBit,
				carryIn: carry,
				result: total % 2,
				carryOut: Math.floor(total / 2)
			});
			carry = Math.floor(total / 2);
			continue;
		}

		let difference = aBit - bBit - carry;
		let borrowOut = 0;
		if (difference < 0) {
			difference += 2;
			borrowOut = 1;
		}
		columns.push({
			index,
			a: aBit,
			b: bBit,
			carryIn: carry,
			result: difference,
			carryOut: borrowOut
		});
		carry = borrowOut;
	}

	const result = columns.reduce((acc, column) => acc | (column.result << column.index), 0);
	const exact = op === 'add' ? a + b : a - b;
	const wrapped = op === 'add' ? exact >= 2 ** width : exact < 0;

	return {
		op,
		width,
		a,
		b,
		columns,
		result: result >>> 0,
		carryOut: carry,
		exact,
		wrapped
	};
}

/** The decimal answer to show next to the masked binary result. */
export function displayResult(computation: BinaryComputation): string {
	if (computation.op === 'subtract' && computation.exact < 0) {
		return `${computation.exact} (borrow out, modulo ${2 ** computation.width})`;
	}
	if (computation.op === 'add' && computation.wrapped) {
		return `${computation.exact} (falls outside ${computation.width} bits)`;
	}
	return String(computation.exact);
}