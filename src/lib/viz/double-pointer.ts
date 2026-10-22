/**
 * The Level 2 model for the pointer sandbox: `int **ppc = &pc`.
 *
 * Kept separate from `pointer-sandbox.ts` so Level 1 stays byte-for-byte what
 * it was (the lessons embed it) and this level can be toggled in on the
 * reference page only. Same contract: pure functions, a committed prediction
 * before the machine moves, and a differential after it does.
 */

export type Level2CellId = 'c' | 'pc' | 'ppc';

export interface Level2Cell {
	readonly id: Level2CellId;
	readonly address: string;
	readonly type: string;
	readonly name: string;
}

export interface Level2CellState {
	value: number | null;
	pointsTo: Level2CellId | null;
}

export interface Level2MemoryState {
	cells: Record<Level2CellId, Level2CellState>;
	/** Cell written by the last applied step, for the highlight. */
	changed: Level2CellId | null;
	/** Cell read by the last applied step (through `**ppc`, if any). */
	read: Level2CellId | null;
}

export interface L2Step {
	readonly code: string;
	readonly question: string;
	/** The cell the student must click to be right. */
	readonly answer: Level2CellId;
	readonly reveal: string;
	readonly differential: string;
	readonly misconceived: Partial<Record<Level2CellId, string>>;
}

/** Display order and addresses of the three stack cells. */
export const L2_CELLS: readonly Level2Cell[] = [
	{ id: 'c', address: '0x7ff4', type: 'int', name: 'c' },
	{ id: 'pc', address: '0x7ff8', type: 'int *', name: 'pc' },
	{ id: 'ppc', address: '0x7ffc', type: 'int **', name: 'ppc' }
];

export const L2_STEPS: readonly L2Step[] = [
	{
		code: 'int c = 10;',
		question: 'Which cell will hold 10?',
		answer: 'c',
		reveal: '`c` holds 10 at 0x7ff4.',
		differential:
			'`c` is a plain `int`, so the value lives in its own cell. `pc` and `ppc` have not been declared yet — they hold nothing.',
		misconceived: {
			pc: '`pc` is not named by this line. It does not exist until the next step.',
			ppc: '`ppc` is not named by this line. It does not exist until step 3.'
		}
	},
	{
		code: 'int *pc = &c;',
		question: 'Which cell will `pc` point to?',
		answer: 'c',
		reveal: '`pc` holds 0x7ff4 — the address of `c`.',
		differential:
			'`&c` is the address of the cell holding 10. `pc` stores that address, so the first arrow runs from `pc` to `c`.',
		misconceived: {
			pc: '`pc` is the cell holding the address, not the cell it points at. `&c` names `c`.',
			ppc: '`ppc` is still undeclared. One star is one level of indirection.'
		}
	},
	{
		code: 'int **ppc = &pc;',
		question: 'Which cell will `ppc` point to?',
		answer: 'pc',
		reveal: '`ppc` holds 0x7ff8 — the address of `pc`.',
		differential:
			'`ppc` is a pointer to a pointer, so it stores the address of `pc`. Now `*ppc` is `pc` and `**ppc` is `c`. The chain is `ppc → pc → c`.',
		misconceived: {
			c: 'One star would point at `c`. Two stars store the address of the cell that shares a type with `pc` — `pc` itself.',
			ppc: '`ppc` is the cell doing the pointing (0x7ffc); the question is what it points at.'
		}
	},
	{
		code: '**ppc = 36;',
		question: "Which cell's value will change?",
		answer: 'c',
		reveal: '`c` becomes 36. `pc` and `ppc` keep their addresses.',
		differential:
			'`**ppc` follows two arrows: `ppc` → `pc` → `c`, then writes 36 into `c`. The intermediate pointers are read, never rewritten.',
		misconceived: {
			pc: '`*ppc` is `pc`, but the second star follows one more address to `c`. Writing to `pc` would be `*ppc = ...` — one star.',
			ppc: '`ppc` is the starting cell. Dereferencing reads its value; it does not change it.'
		}
	}
];

export function l2StepAt(index: number): L2Step {
	const safe = Math.min(Math.max(index, 0), L2_STEPS.length - 1);
	const step = L2_STEPS[safe];
	if (step === undefined) throw new RangeError('level 2 sandbox has no steps');
	return step;
}

export function l2InitialState(): Level2MemoryState {
	return {
		cells: {
			c: { value: null, pointsTo: null },
			pc: { value: null, pointsTo: null },
			ppc: { value: null, pointsTo: null }
		},
		changed: null,
		read: null
	};
}

export function l2ApplyStep(state: Level2MemoryState, index: number): Level2MemoryState {
	const cells: Record<Level2CellId, Level2CellState> = {
		c: { ...state.cells.c },
		pc: { ...state.cells.pc },
		ppc: { ...state.cells.ppc }
	};

	switch (index) {
		case 0:
			cells.c = { value: 10, pointsTo: null };
			return { cells, changed: 'c', read: null };
		case 1:
			cells.pc = { value: 0x7ff4, pointsTo: 'c' };
			return { cells, changed: 'pc', read: null };
		case 2:
			cells.ppc = { value: 0x7ff8, pointsTo: 'pc' };
			return { cells, changed: 'ppc', read: null };
		case 3:
			cells.c = { ...cells.c, value: 36 };
			return { cells, changed: 'c', read: 'c' };
		default:
			return state;
	}
}

export function l2CanAdvance(prediction: Level2CellId | null): boolean {
	return prediction !== null;
}

export function l2Judge(stepIndex: number, prediction: Level2CellId): boolean {
	const step = L2_STEPS[stepIndex];
	return step !== undefined && step.answer === prediction;
}

export function l2Summary(state: Level2MemoryState): string {
	const c = state.cells.c.value;
	if (c === null) return 'Nothing has run yet.';
	return `Final state: \`pc\` points at \`c\`, \`ppc\` points at \`pc\`, and \`**ppc\` reads ${c} through both arrows.`;
}

export function l2FormatValue(cell: Level2Cell, state: Level2CellState): string {
	if (cell.id === 'c') return state.value === null ? '—' : String(state.value);
	const target = L2_CELLS.find((candidate) => candidate.id === state.pointsTo);
	return target?.address ?? '—';
}

/**
 * The value `**ppc` would read right now: follow ppc to pc, pc to c, and read
 * c. Returns null while the chain is incomplete, so the UI can say "not yet"
 * instead of inventing a number.
 */
export function readThroughDoublePointer(state: Level2MemoryState): number | null {
	const pc = state.cells.ppc.pointsTo === 'pc' ? state.cells.pc : null;
	if (pc === null) return null;
	return pc.pointsTo === 'c' ? state.cells.c.value : null;
}