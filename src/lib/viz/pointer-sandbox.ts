/**
 * The `<PointerSandbox />` model.
 *
 * Deliberately pure: every function here takes a state and returns a new one,
 * with no Svelte, no DOM, and no timers. The component owns the runes; this
 * module owns the semantics, so the prediction gating and the memory diff can
 * be unit-tested without a browser.
 *
 * The teaching idea (see andragogy.md, POE gating): before the machine moves,
 * the student must commit to a cell. A wrong commitment is not blocked — it is
 * executed, then contrasted against what actually happened.
 *
 * Addresses are illustrative: three consecutive `int` slots on a 64-bit stack.
 * They are never compared numerically, only displayed, so no program depends on
 * this particular base address.
 */

export type CellId = 'a' | 'b' | 'p';

export interface Cell {
	readonly id: CellId;
	readonly address: string;
	readonly type: string;
	/** Human label used in prompts: "`a`", "`p`". */
	readonly name: string;
}

export interface CellState {
	/** The value stored in the cell; null means "not initialised yet". */
	value: number | null;
	/** For `int *p`: the cell whose address `p` currently holds. */
	pointsTo: CellId | null;
}

export interface MemoryState {
	cells: Record<CellId, CellState>;
	/** Cell written by the last applied step, for the highlight. */
	changed: CellId | null;
	/** Cell read through `*p` by the last applied step. */
	read: CellId | null;
}

export interface AnalogyCopy {
	football: string;
	money: string;
}

export interface PointerStep {
	readonly code: string;
	readonly question: string;
	/** The cell the student must click to be right. */
	readonly answer: CellId;
	/** Neutral confirmation shown after a correct prediction. */
	readonly reveal: string;
	/** The state differential: what actually happened. */
	readonly differential: string;
	/** The misconception behind each plausible wrong cell. */
	readonly misconceived: Partial<Record<CellId, string>>;
	readonly explain: AnalogyCopy;
}

/** Display order and addresses of the three stack cells. */
export const CELLS: readonly Cell[] = [
	{ id: 'a', address: '0x7ff4', type: 'int', name: 'a' },
	{ id: 'b', address: '0x7ff8', type: 'int', name: 'b' },
	{ id: 'p', address: '0x7ffc', type: 'int *', name: 'p' }
];

export const STEPS: readonly PointerStep[] = [
	{
		code: 'int *p = &a;',
		question: 'Which cell will `p` point to?',
		answer: 'a',
		reveal: '`p` now holds 0x7ff4 — the address of `a`.',
		differential:
			'`p` holds `&a`, which is 0x7ff4: the cell where `a` lives. The arrow starts at `p` and ends at `a`.',
		misconceived: {
			p: '`p` is the cell holding the address (0x7ffc). `&a` names `a`’s cell, not `p`’s.',
			b: '`b` is untouched by this line — the code never mentions it.'
		},
		explain: {
			football:
				'`p` is a ticket stub with the seat number 0x7ff4 written on it. The seat (`a`) is where the score actually sits; the stub only tells you where to look.',
			money: '`p` is a slip of paper with account 0x7ff4 written on it. The number is not the money — it is the instruction for which account to open.'
		}
	},
	{
		code: '*p = 99;',
		question: "Which cell's value will change?",
		answer: 'a',
		reveal: '`a` becomes 99. `p` still holds 0x7ff4.',
		differential:
			'`*p` writes through the pointer: it follows 0x7ff4 and changes `a` from 10 to 99. `p`’s own value is not touched.',
		misconceived: {
			p: '`*p` writes to the target. Writing to `p` itself would be `p = 99;` — no star.',
			b: '`b` is not `p`’s target; `p` still holds `a`’s address.'
		},
		explain: {
			football:
				'Following the seat number on the stub and painting that seat (`a`). The stub itself keeps its number.',
			money: 'Following the account number on the slip and depositing into that account (`a`). The slip is unchanged.'
		}
	},
	{
		code: 'p = &b;',
		question: 'Which cell will `p` point to now?',
		answer: 'b',
		reveal: '`p` now holds 0x7ff8 — the address of `b`.',
		differential:
			'`&b` makes `p` hold 0x7ff8. Assigning to `p` retargets the pointer; `a` keeps its value and is simply no longer pointed at.',
		misconceived: {
			a: '`&b` is `b`’s address. The pointer moves; the old target keeps its 99.',
			p: '`p` is the cell being written (0x7ffc), not the cell it will point to.'
		},
		explain: {
			football:
				'Erasing the stub and writing the neighbouring seat number 0x7ff8 on it. The old seat is still there with its paint.',
			money: 'Crossing out the account number and writing `b`’s number instead. The old account still holds its balance.'
		}
	},
	{
		code: '*p = *p + 1;',
		question: "Which cell's value will change?",
		answer: 'b',
		reveal: '`b` goes from 32 to 33. `a` stays at 99.',
		differential:
			'`*p` is `b` now. Reading it gives 32, one is added, and the result is written back to `b` → 33. `a` is not involved anymore.',
		misconceived: {
			a: '`a` was `p`’s target two steps ago. `p` was retargeted to `b`, so `*p` is `b`.',
			p: '`p` keeps 0x7ff8; only the value it points at changes.'
		},
		explain: {
			football:
				'Reading the score at the seat the stub names, adding one, and writing it back to that same seat. One smaller step, twice.',
			money: 'Read the account the slip names, add one, write it back to the same account. The slip never changes.'
		}
	}
];

/** Clamped accessor, so the UI can never read a hole in the step table. */
export function stepAt(index: number): PointerStep {
	const safe = Math.min(Math.max(index, 0), STEPS.length - 1);
	const step = STEPS[safe];
	if (step === undefined) throw new RangeError('pointer sandbox has no steps');
	return step;
}

export function initialState(): MemoryState {
	return {
		cells: {
			a: { value: 10, pointsTo: null },
			b: { value: 32, pointsTo: null },
			p: { value: null, pointsTo: null }
		},
		changed: null,
		read: null
	};
}

/**
 * Advance the machine by one step. Only the caller that has already collected
 * a prediction may call this — the gating lives in `canAdvance`, and the
 * component never reaches this path without it.
 */
export function applyStep(state: MemoryState, index: number): MemoryState {
	const cells: Record<CellId, CellState> = {
		a: { ...state.cells.a },
		b: { ...state.cells.b },
		p: { ...state.cells.p }
	};

	switch (index) {
		case 0:
			cells.p = { value: 0x7ff4, pointsTo: 'a' };
			return { cells, changed: 'p', read: null };
		case 1:
			cells.a = { ...cells.a, value: 99 };
			return { cells, changed: 'a', read: 'a' };
		case 2:
			cells.p = { value: 0x7ff8, pointsTo: 'b' };
			return { cells, changed: 'p', read: null };
		case 3:
			cells.b = { ...cells.b, value: (cells.b.value ?? 0) + 1 };
			return { cells, changed: 'b', read: 'b' };
		default:
			return state;
	}
}

/** True when the student has committed to a cell, which unlocks the step. */
export function canAdvance(prediction: CellId | null): boolean {
	return prediction !== null;
}

/** Did the committed cell match the step's answer? */
export function judge(stepIndex: number, prediction: CellId): boolean {
	const step = STEPS[stepIndex];
	return step !== undefined && step.answer === prediction;
}

/** One sentence, after the last step, that states where everything ended up. */
export function summary(state: MemoryState): string {
	const target = state.cells.p.pointsTo;
	if (target === null) return 'Nothing has run yet.';
	const name = CELLS.find((cell) => cell.id === target)?.name ?? target;
	return `Final state: \`p\` points at \`${name}\`; \`${name}\` holds ${state.cells[target].value}; \`a\` holds ${state.cells.a.value}.`;
}

/** Format a cell's stored value for display. */
export function formatValue(cell: Cell, state: CellState): string {
	if (cell.id === 'p') {
		const target = CELLS.find((candidate) => candidate.id === state.pointsTo);
		return target?.address ?? '—';
	}
	return state.value === null ? '—' : String(state.value);
}
