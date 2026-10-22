import { describe, expect, it } from 'vitest';
import { modules, findModule } from './curriculum';
import { lessons, lessonsInOrder, getLesson } from './index';

/**
 * Content invariants. These are cheap assertions that catch the failure mode
 * that actually hurts in a course app: a lesson exists but is unreachable, or
 * a prerequisite points at a slug that was renamed.
 */
describe('curriculum', () => {
	it('covers all 22 lectures plus the supplementary bash module', () => {
		expect(modules).toHaveLength(23);
		expect(modules.map((m) => m.id)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
	});

	it('has unique module slugs', () => {
		const slugs = modules.map((m) => m.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});

	it('marks every C-heavy module explicitly', () => {
		const cHeavy = modules.filter((m) => m.cHeavy).map((m) => m.id);
		// agents.md §4 flags these decks as carrying real C work; the exact set is
		// asserted so a module cannot silently lose its C exercises.
		expect(cHeavy).toEqual([2, 4, 6, 9, 11, 12, 13, 14, 16, 17, 18, 19, 20]);
	});

	it('resolves a module by id', () => {
		expect(findModule(1)?.slug).toBe('01-what-is-data');
		expect(findModule(99)).toBeUndefined();
	});
});

describe('lesson loader', () => {
	it('loads at least the bits-and-bytes lesson', () => {
		expect(lessons.size).toBeGreaterThanOrEqual(1);
		expect(getLesson('01-bits-bytes')).toBeDefined();
	});

	it('assigns every loaded lesson to a real module', () => {
		for (const lesson of lessons.values()) {
			expect(findModule(lesson.frontmatter.module)).toBeDefined();
		}
	});

	it('keeps loaded lessons inside their module grouping', () => {
		for (const lesson of lessons.values()) {
			expect(lesson.module.lessons).toContainEqual(
				expect.objectContaining({ slug: lesson.slug })
			);
		}
	});

	it('orders lessons deterministically by module then slug', () => {
		const keys = lessonsInOrder.map((l) => [l.frontmatter.module, l.slug] as const);
		const sorted = [...keys].sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
		expect(keys).toEqual(sorted);
	});

	it('has unique lesson slugs', () => {
		const slugs = lessonsInOrder.map((l) => l.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});
});
