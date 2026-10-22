import { beforeEach, describe, expect, it } from 'vitest';
import { assessments } from './assessments.svelte';

describe('assessment store', () => {
	beforeEach(() => assessments.clearAll());

	it('keeps solvedAt after a later miss but resets the streak', () => {
		assessments.record('q', true);
		assessments.record('q', true);
		expect(assessments.streak('q')).toBe(2);
		assessments.record('q', false);
		expect(assessments.isSolved('q')).toBe(true);
		expect(assessments.streak('q')).toBe(0);
		expect(assessments.attempts('q')).toBe(3);
	});

	it('does not move the first-solved timestamp on later correct answers', () => {
		assessments.record('q', true);
		const first = assessments.get('q')?.solvedAt;
		assessments.record('q', true);
		expect(assessments.get('q')?.solvedAt).toBe(first);
	});

	it('marking a note read is not verification', () => {
		assessments.markRead('note');
		expect(assessments.isRead('note')).toBe(true);
		expect(assessments.isSolved('note')).toBe(false);
		expect(assessments.attempts('note')).toBe(0);
		expect(assessments.solvedCount).toBe(0);
	});

	it('markRead is idempotent and keeps earlier results', () => {
		assessments.record('x', true);
		assessments.markRead('x');
		assessments.markRead('x');
		expect(assessments.attempts('x')).toBe(1);
		expect(assessments.isSolved('x')).toBe(true);
	});
});
