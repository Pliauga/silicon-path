/**
 * Grading rules for the two assessment cards.
 *
 * Kept pure and free of Svelte so the comparison rules are unit-tested rather
 * than discovered by a student whose output "looks right". The one deliberate
 * policy: trailing whitespace and trailing blank lines never decide whether a
 * program is correct — those are editor artefacts, not C behaviour. Anything
 * else, including leading spaces on a line, must match exactly.
 */

export interface RunOutput {
	stdout: string;
	exitCode: number;
}

export interface ExpectedOutput {
	stdout: string;
	/** Defaults to 0: a lesson program is expected to succeed. */
	exitCode?: number;
}

export type OutputVerdict =
	| { kind: 'match'; exitCode: number }
	| {
			kind: 'mismatch';
			expected: string;
			actual: string;
			/** 1-based line of the first difference, when there is one. */
			line: number | null;
	  }
	| { kind: 'exit'; expectedExitCode: number; actualExitCode: number }
	| { kind: 'missing-expected' };

/**
 * Canonical form used on both sides of a comparison: LF line endings, no
 * trailing whitespace on any line, no trailing blank lines.
 */
export function normaliseOutput(text: string): string {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const trimmed = lines.map((line) => line.replace(/[ \t]+$/, ''));
	while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') trimmed.pop();
	return trimmed.join('\n');
}

/** 1-based line index of the first difference, or null if the texts agree. */
export function firstDifferingLine(actual: string, expected: string): number | null {
	const a = normaliseOutput(actual).split('\n');
	const e = normaliseOutput(expected).split('\n');
	const limit = Math.max(a.length, e.length);
	for (let index = 0; index < limit; index += 1) {
		if ((a[index] ?? null) !== (e[index] ?? null)) return index + 1;
	}
	return null;
}

/** Compare a program's output with the lesson's authored expectation. */
export function checkOutput(actual: RunOutput, expected: ExpectedOutput | undefined): OutputVerdict {
	if (!expected) return { kind: 'missing-expected' };

	const wanted = expected.exitCode ?? 0;
	if (actual.exitCode !== wanted) {
		return { kind: 'exit', expectedExitCode: wanted, actualExitCode: actual.exitCode };
	}
	if (normaliseOutput(actual.stdout) === normaliseOutput(expected.stdout)) {
		return { kind: 'match', exitCode: wanted };
	}
	return {
		kind: 'mismatch',
		expected: normaliseOutput(expected.stdout),
		actual: normaliseOutput(actual.stdout),
		line: firstDifferingLine(actual.stdout, expected.stdout)
	};
}

/**
 * Accepts either an index or the option's text, so an author can write
 * `answer="4"` in MDX without counting list positions by hand.
 */
export function isCorrectAnswer(
	options: readonly string[] | undefined,
	answer: number | string | undefined,
	chosen: number
): boolean {
	if (!options || answer === undefined) return false;
	const picked = options[chosen];
	if (picked === undefined) return false;
	if (typeof answer === 'number') return answer === chosen;
	return picked.trim() === answer.trim();
}

/** True when a quiz has enough authored data to be answerable. */
export function isAnswerableQuiz(
	options: readonly string[] | undefined,
	answer: number | string | undefined
): boolean {
	if (!options || options.length < 2 || answer === undefined) return false;
	if (typeof answer === 'number') return answer >= 0 && answer < options.length;
	return options.some((option) => option.trim() === answer.trim());
}

/** Index of the correct option, or -1 when the answer is not in the list. */
export function correctOptionIndex(
	options: readonly string[] | undefined,
	answer: number | string | undefined
): number {
	if (!options || answer === undefined) return -1;
	if (typeof answer === 'number') return options[answer] === undefined ? -1 : answer;
	return options.findIndex((option) => option.trim() === answer.trim());
}