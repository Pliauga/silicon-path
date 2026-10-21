import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { worksheets } from './index';
import type { WorksheetExercise } from './types';

/**
 * Every runnable worksheet program must compile cleanly under the same flags
 * the lesson pipeline uses (-std=c11 -Wall -Wextra -Werror) and, where the sheet
 * specifies exact stdout, produce it. Solutions are compiled strictly; starters
 * only need to parse, because an intentional unused variable is allowed until
 * the student fills it in.
 *
 * gcc is native here (clang's gcc shim on macOS, gcc on Linux). The in-browser
 * backend is Clang/wasm, but both accept the same C11 subset used here and the
 * integer/printf behaviour tested is identical.
 */

const gcc = ['/usr/bin/gcc', '/usr/local/bin/gcc', '/opt/homebrew/bin/gcc'].find((path) =>
	existsSync(path)
);

const codeExercises: WorksheetExercise[] = worksheets.flatMap((week) =>
	week.sections.flatMap((section) => section.exercises).filter((exercise) => exercise.mode === 'code')
);

const workdir = mkdtempSync(join(tmpdir(), 'silicon-path-worksheets-'));

afterAll(() => {
	rmSync(workdir, { recursive: true, force: true });
});

function compile(source: string, name: string, strict: boolean): boolean {
	const cFile = join(workdir, `${name}.c`);
	const binary = join(workdir, name);
	writeFileSync(cFile, source);
	const flags = ['-std=c11', '-Wall', '-Wextra'];
	if (strict) flags.push('-Werror');
	try {
		execFileSync(gcc as string, [...flags, cFile, '-o', binary], {
			stdio: 'pipe',
			timeout: 20_000
		});
		return true;
	} catch (error) {
		const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? String(error);
		throw new Error(`${name} failed to compile:\n${stderr}`);
	}
}

describe.skipIf(!gcc)('worksheet C programs', () => {
	it('has a realistic number of runnable exercises', () => {
		expect(codeExercises.length).toBeGreaterThanOrEqual(15);
	});

	for (const exercise of codeExercises) {
		describe(`${exercise.id} — ${exercise.title}`, () => {
			it('starter parses', () => {
				expect(exercise.starter).toBeTruthy();
				compile(exercise.starter as string, `${exercise.id}-starter`, false);
			});

			it('solution compiles without warnings and matches stdout', () => {
				const binary = join(workdir, `${exercise.id}-solution`);
				compile(exercise.solution, `${exercise.id}-solution`, true);
				if (exercise.expectedStdout === undefined) return;
				const stdout = execFileSync(binary, [], {
					input: exercise.stdin ?? '',
					stdio: ['pipe', 'pipe', 'pipe'],
					timeout: 5_000
				}).toString();
				expect(stdout.trimEnd()).toBe(exercise.expectedStdout.trimEnd());
			});
		});
	}
});

describe('worksheet data', () => {
	it('keeps ids unique across weeks', () => {
		const ids = worksheets.flatMap((week) =>
			week.sections.flatMap((section) => section.exercises.map((exercise) => exercise.id))
		);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('gives every code exercise a starter and every note exercise a written solution', () => {
		for (const week of worksheets) {
			for (const section of week.sections) {
				for (const exercise of section.exercises) {
					expect(exercise.prompt.length).toBeGreaterThan(40);
					expect(exercise.hints.length).toBeGreaterThan(0);
					expect(exercise.solution.length).toBeGreaterThan(20);
					if (exercise.mode === 'code') expect(exercise.starter).toBeTruthy();
				}
			}
		}
	});

	it('labels exercises EX 1..n inside each week', () => {
		for (const week of worksheets) {
			const labels = week.sections.flatMap((section): string[] =>
				section.exercises.map((exercise) => exercise.label)
			);
			expect(labels).toEqual(labels.map((_, index) => `EX ${index + 1}`));
		}
	});
});
describe('worksheet stdin consistency', () => {
	it('ws3-ex06 prompt tells the learner how to try 25 and -4, and the graded stdin is 25 4', () => {
		const exercise = worksheets
			.flatMap((week) => week.sections.flatMap((section) => section.exercises))
			.find((entry) => entry.id === 'ws3-ex06');
		expect(exercise?.stdin).toBe('25 4');
		expect(exercise?.prompt).toContain('pre-filled with 25 and 4');
		expect(exercise?.prompt).toContain('25 -4');
	});
});
