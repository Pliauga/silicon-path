import { describe, expect, it } from 'vitest';

import {
	checkOutput,
	correctOptionIndex,
	firstDifferingLine,
	isAnswerableQuiz,
	isCorrectAnswer,
	normaliseOutput
} from './assessment';

describe('normaliseOutput', () => {
	it('normalises CRLF and trims trailing whitespace per line', () => {
		expect(normaliseOutput('a  \r\nb\t\r\n')).toBe('a\nb');
	});

	it('drops trailing blank lines but keeps interior blanks', () => {
		expect(normaliseOutput('a\n\nb\n\n\n')).toBe('a\n\nb');
	});

	it('keeps leading indentation, which is real program output', () => {
		expect(normaliseOutput('   x\n')).toBe('   x');
	});

	it('maps an empty program to an empty string', () => {
		expect(normaliseOutput('\n\n')).toBe('');
	});
});

describe('firstDifferingLine', () => {
	it('returns the 1-based line of the first difference', () => {
		expect(firstDifferingLine('a\nb\nc', 'a\nB\nc')).toBe(2);
	});

	it('returns null when the texts agree after normalisation', () => {
		expect(firstDifferingLine('a\nb\n\n', 'a\nb')).toBeNull();
	});

	it('detects a missing trailing line', () => {
		expect(firstDifferingLine('a', 'a\nb')).toBe(2);
	});
});

describe('checkOutput', () => {
	it('reports match when stdout agrees and the exit code is 0', () => {
		const verdict = checkOutput({ stdout: '42\n', exitCode: 0 }, { stdout: '42' });
		expect(verdict.kind).toBe('match');
	});

	it('reports a mismatch with both texts and the differing line', () => {
		const verdict = checkOutput({ stdout: '41\n', exitCode: 0 }, { stdout: '42' });
		expect(verdict).toEqual({
			kind: 'mismatch',
			expected: '42',
			actual: '41',
			line: 1
		});
	});

	it('checks the exit code before the text', () => {
		const verdict = checkOutput(
			{ stdout: '42', exitCode: 3 },
			{ stdout: '42', exitCode: 0 }
		);
		expect(verdict.kind).toBe('exit');
	});

	it('honours a non-zero expected exit code', () => {
		expect(checkOutput({ stdout: '', exitCode: 2 }, { stdout: '', exitCode: 2 }).kind).toBe('match');
	});

	it('returns missing-expected when the lesson authored none', () => {
		expect(checkOutput({ stdout: 'x', exitCode: 0 }, undefined).kind).toBe('missing-expected');
	});
});

describe('quiz answers', () => {
	const options = ['wraps to 4', 'undefined behaviour', 'promotes to 260'];

	it('accepts an index answer', () => {
		expect(isCorrectAnswer(options, 1, 1)).toBe(true);
		expect(isCorrectAnswer(options, 1, 0)).toBe(false);
	});

	it('accepts the exact option text as the answer', () => {
		expect(isCorrectAnswer(options, 'undefined behaviour', 1)).toBe(true);
		expect(isCorrectAnswer(options, 'undefined behaviour', 2)).toBe(false);
	});

	it('rejects out-of-range picks and missing answers', () => {
		expect(isCorrectAnswer(options, 1, 9)).toBe(false);
		expect(isCorrectAnswer(options, undefined, 0)).toBe(false);
	});

	it('treats a quiz as answerable only with options and a resolvable answer', () => {
		expect(isAnswerableQuiz(options, 1)).toBe(true);
		expect(isAnswerableQuiz(options, 'undefined behaviour')).toBe(true);
		expect(isAnswerableQuiz(options, 7)).toBe(false);
		expect(isAnswerableQuiz(options, 'not an option')).toBe(false);
		expect(isAnswerableQuiz(['only one'], 0)).toBe(false);
		expect(isAnswerableQuiz(undefined, 0)).toBe(false);
	});

	it('resolves the correct option index from either answer form', () => {
		expect(correctOptionIndex(options, 1)).toBe(1);
		expect(correctOptionIndex(options, 'promotes to 260')).toBe(2);
		expect(correctOptionIndex(options, 'nope')).toBe(-1);
	});
});