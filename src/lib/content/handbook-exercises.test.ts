import { describe, expect, it } from 'vitest';
import { handbookExercises } from './handbook-exercises';
import { handbookMeta } from './handbook-meta';

/**
 * Exercise data invariants. The cards render whatever they are handed, so a
 * missing hint or an id reused from another chapter would surface only as a
 * confusing UI state. These assertions run over all sixty records.
 */
describe('C Handbook exercises', () => {
	it('ships exactly three exercises per chapter', () => {
		expect(handbookExercises).toHaveLength(handbookMeta.length * 3);

		for (const chapter of handbookMeta) {
			const prefix = `hb-${chapter.slug.slice(0, 2)}-`;
			const owned = handbookExercises.filter((exercise) => exercise.id.startsWith(prefix));
			expect(owned, chapter.slug).toHaveLength(3);
		}
	});

	it('uses unique, namespaced ids', () => {
		const ids = handbookExercises.map((exercise) => exercise.id);
		expect(new Set(ids).size).toBe(ids.length);

		for (const exercise of handbookExercises) {
			expect(exercise.id, exercise.id).toMatch(/^hb-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/);
		}
	});

	it('gives every exercise everything the card needs', () => {
		for (const exercise of handbookExercises) {
			expect(exercise.prompt.length, exercise.id).toBeGreaterThan(20);
			expect(exercise.concept.length, exercise.id).toBeGreaterThan(2);
			expect(exercise.hints.length, exercise.id).toBeGreaterThanOrEqual(2);
			for (const hint of exercise.hints) {
				expect(hint.length, exercise.id).toBeGreaterThan(10);
			}
			expect(exercise.starter, exercise.id).toContain('int main');
			expect(exercise.solution, exercise.id).toContain('int main');
			expect(exercise.starter, exercise.id).not.toBe(exercise.solution);
		}
	});

	it('only declares expected output when it means it', () => {
		for (const exercise of handbookExercises) {
			if (exercise.expectedStdout !== undefined) {
				expect(exercise.expectedStdout.length, exercise.id).toBeGreaterThan(0);
				expect(exercise.expectedExitCode, exercise.id).toBe(0);
			} else {
				expect(exercise.expectedExitCode, exercise.id).toBeUndefined();
			}
		}
	});
});