import { describe, expect, it } from 'vitest';

import {
	L2_CELLS,
	L2_STEPS,
	l2ApplyStep,
	l2CanAdvance,
	l2InitialState,
	l2Judge,
	l2StepAt,
	l2Summary,
	readThroughDoublePointer,
	type Level2CellId,
	type Level2MemoryState
} from './double-pointer';

/** Apply steps 0..last in order, as the component would after each reveal. */
function runThrough(last: number): Level2MemoryState {
	let state = l2InitialState();
	for (let index = 0; index <= last; index += 1) {
		state = l2ApplyStep(state, index);
	}
	return state;
}

describe('level 2 sandbox: initial state', () => {
	it('starts with all three cells uninitialised', () => {
		const state = l2InitialState();
		expect(state.cells.c.value).toBeNull();
		expect(state.cells.pc.value).toBeNull();
		expect(state.cells.ppc.value).toBeNull();
		expect(readThroughDoublePointer(state)).toBeNull();
	});

	it('has a fixed three-cell layout with distinct addresses', () => {
		expect(L2_CELLS.map((cell) => cell.id)).toEqual(['c', 'pc', 'ppc']);
		expect(new Set(L2_CELLS.map((cell) => cell.address)).size).toBe(3);
	});
});

describe('level 2 sandbox: the chain ppc -> pc -> c', () => {
	it('sets c to 10 on the first step', () => {
		const state = runThrough(0);
		expect(state.cells.c.value).toBe(10);
		expect(state.changed).toBe('c');
	});

	it('makes pc point at c, then ppc point at pc', () => {
		const afterPc = runThrough(1);
		expect(afterPc.cells.pc.pointsTo).toBe('c');

		const afterPpc = runThrough(2);
		expect(afterPpc.cells.ppc.pointsTo).toBe('pc');
		// ppc stores pc's address, not c's.
		expect(afterPpc.cells.ppc.value).toBe(0x7ff8);
		expect(afterPpc.cells.pc.value).toBe(0x7ff4);
	});

	it('reads c through both pointers once the chain is complete', () => {
		expect(readThroughDoublePointer(runThrough(1))).toBeNull();
		expect(readThroughDoublePointer(runThrough(2))).toBe(10);
	});

	it('updates **ppc when the final step writes 36 into c', () => {
		const final = runThrough(3);
		expect(final.cells.c.value).toBe(36);
		expect(readThroughDoublePointer(final)).toBe(36);
		// The intermediate pointers are read, never rewritten.
		expect(final.cells.pc.pointsTo).toBe('c');
		expect(final.cells.ppc.pointsTo).toBe('pc');
	});

	it('marks c as the changed cell on the write-through step', () => {
		const final = runThrough(3);
		expect(final.changed).toBe('c');
		expect(final.read).toBe('c');
	});
});

describe('level 2 sandbox: POE gating', () => {
	it('refuses to advance without a committed prediction', () => {
		expect(l2CanAdvance(null)).toBe(false);
		expect(l2CanAdvance('c')).toBe(true);
	});

	it('accepts exactly the authored answer per step', () => {
		const answers: Level2CellId[] = ['c', 'c', 'pc', 'c'];
		answers.forEach((answer, index) => {
			expect(l2Judge(index, answer)).toBe(true);
			const others = L2_CELLS.map((cell) => cell.id).filter((id) => id !== answer);
			for (const other of others) {
				expect(l2Judge(index, other)).toBe(false);
			}
		});
	});

	it('explains every wrong option it offers', () => {
		L2_STEPS.forEach((step) => {
			for (const cell of L2_CELLS) {
				if (cell.id === step.answer) continue;
				expect(step.misconceived[cell.id]).toBeTruthy();
			}
		});
	});
});

describe('level 2 sandbox: copy', () => {
	it('clamps step lookup to the authored range', () => {
		expect(l2StepAt(-5)).toBe(L2_STEPS[0]);
		expect(l2StepAt(99)).toBe(L2_STEPS[L2_STEPS.length - 1]);
	});

	it('summarises the final state with the double dereference value', () => {
		expect(l2Summary(runThrough(3))).toContain('36');
		expect(l2Summary(l2InitialState())).toBe('Nothing has run yet.');
	});
});