import { describe, expect, it } from 'vitest';

import {
	CELLS,
	STEPS,
	applyStep,
	canAdvance,
	formatValue,
	initialState,
	judge,
	summary,
	type CellId,
	type MemoryState
} from './pointer-sandbox';

/** Apply steps 0..last in order, as the component would after each reveal. */
function runThrough(last: number): MemoryState {
	let state = initialState();
	for (let index = 0; index <= last; index += 1) {
		state = applyStep(state, index);
	}
	return state;
}

describe('pointer sandbox: initial state', () => {
	it('starts with a and b set and p uninitialised', () => {
		const state = initialState();
		expect(state.cells.a.value).toBe(10);
		expect(state.cells.b.value).toBe(32);
		expect(state.cells.p.value).toBeNull();
		expect(state.cells.p.pointsTo).toBeNull();
	});

	it('has a fixed three-cell layout with distinct addresses', () => {
		expect(CELLS.map((cell) => cell.id)).toEqual(['a', 'b', 'p']);
		expect(new Set(CELLS.map((cell) => cell.address)).size).toBe(3);
	});
});

describe('pointer sandbox: POE gating', () => {
	it('locks the step control until a cell is committed', () => {
		expect(canAdvance(null)).toBe(false);
		expect(canAdvance('a')).toBe(true);
		expect(canAdvance('p')).toBe(true);
	});

	it('accepts only the step’s own answer', () => {
		expect(judge(0, 'a')).toBe(true);
		expect(judge(0, 'p')).toBe(false);
		expect(judge(1, 'a')).toBe(true);
		expect(judge(2, 'b')).toBe(true);
		expect(judge(3, 'b')).toBe(true);
		expect(judge(3, 'a')).toBe(false);
	});

	it('gives every step a differential and an analogy in both registers', () => {
		for (const step of STEPS) {
			expect(step.differential.length).toBeGreaterThan(20);
			expect(step.explain.football.length).toBeGreaterThan(10);
			expect(step.explain.money.length).toBeGreaterThan(10);
			expect(step.misconceived[step.answer]).toBeUndefined();
		}
	});
});

describe('pointer sandbox: memory transitions', () => {
	it('step 1 points p at a without touching a', () => {
		const state = runThrough(0);
		expect(state.cells.p.pointsTo).toBe('a');
		expect(state.cells.p.value).toBe(0x7ff4);
		expect(state.cells.a.value).toBe(10);
		expect(state.changed).toBe('p');
	});

	it('step 2 writes through p into a', () => {
		const state = runThrough(1);
		expect(state.cells.a.value).toBe(99);
		expect(state.cells.p.pointsTo).toBe('a');
		expect(state.changed).toBe('a');
		expect(state.read).toBe('a');
	});

	it('step 3 retargets p to b and leaves a alone', () => {
		const state = runThrough(2);
		expect(state.cells.p.pointsTo).toBe('b');
		expect(state.cells.p.value).toBe(0x7ff8);
		expect(state.cells.a.value).toBe(99);
		expect(state.cells.b.value).toBe(32);
	});

	it('step 4 increments b through the new target', () => {
		const state = runThrough(3);
		expect(state.cells.b.value).toBe(33);
		expect(state.cells.a.value).toBe(99);
		expect(state.changed).toBe('b');
	});

	it('never mutates the state it was given', () => {
		const before = initialState();
		const snapshot = structuredClone(before);
		applyStep(before, 1);
		expect(before).toEqual(snapshot);
	});

	it('ignores an out-of-range step', () => {
		const state = initialState();
		expect(applyStep(state, 99)).toBe(state);
	});
});

describe('pointer sandbox: rendering helpers', () => {
	it('formats the pointer cell as its target’s address', () => {
		const state = runThrough(1);
		const p = CELLS.find((cell) => cell.id === 'p');
		expect(p).toBeDefined();
		if (p) {
			expect(formatValue(p, state.cells.p)).toBe('0x7ff4');
		}
	});

	it('shows a dash for an uninitialised pointer', () => {
		const state = initialState();
		const p = CELLS.find((cell) => cell.id === 'p');
		if (p) expect(formatValue(p, state.cells.p)).toBe('—');
	});

	it('summarises the final state in one sentence', () => {
		const state = runThrough(3);
		expect(summary(state)).toContain('`p` points at `b`');
		expect(summary(state)).toContain('33');
	});

	it('keeps a fallback summary before anything runs', () => {
		expect(summary(initialState())).toBe('Nothing has run yet.');
	});
});

describe('pointer sandbox: step table sanity', () => {
	it('every answer names a real cell', () => {
		const ids = new Set<CellId>(CELLS.map((cell) => cell.id));
		for (const step of STEPS) {
			expect(ids.has(step.answer)).toBe(true);
		}
	});

	it('has four steps, matching the four lines of the program', () => {
		expect(STEPS.map((step) => step.code)).toEqual([
			'int *p = &a;',
			'*p = 99;',
			'p = &b;',
			'*p = *p + 1;'
		]);
	});
});
