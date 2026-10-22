/**
 * Boolean gates for the Week 2 worksheets.
 *
 * `not` ignores its second input (kept so every gate shares one call shape).
 */

export type LogicGate = 'and' | 'or' | 'xor' | 'not';
export type LogicLevel = 0 | 1;

export function applyGate(gate: LogicGate, a: LogicLevel, b: LogicLevel): LogicLevel {
	switch (gate) {
		case 'and':
			return a === 1 && b === 1 ? 1 : 0;
		case 'or':
			return a === 1 || b === 1 ? 1 : 0;
		case 'xor':
			return a !== b ? 1 : 0;
		case 'not':
			return a === 1 ? 0 : 1;
	}
}

export function gateLabel(gate: LogicGate): string {
	switch (gate) {
		case 'and':
			return 'A AND B';
		case 'or':
			return 'A OR B';
		case 'xor':
			return 'A XOR B';
		case 'not':
			return 'NOT A';
	}
}

/** `Y = (AB)(A + B)` from the Week 2 gates worksheet, in terms of gates. */
export function tiedOutput(a: LogicLevel, b: LogicLevel): LogicLevel {
	const both = applyGate('and', a, b);
	const either = applyGate('or', a, b);
	return applyGate('and', both, either);
}

export function truthTableFor(gate: LogicGate): { a: LogicLevel; b: LogicLevel; y: LogicLevel }[] {
	const rows: { a: LogicLevel; b: LogicLevel }[] = [
		{ a: 0, b: 0 },
		{ a: 0, b: 1 },
		{ a: 1, b: 0 },
		{ a: 1, b: 1 }
	];
	return rows.map(({ a, b }) => ({ a, b, y: applyGate(gate, a, b) }));
}