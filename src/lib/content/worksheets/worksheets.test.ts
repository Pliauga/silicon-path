import { describe, expect, it } from 'vitest';
import { exerciseCount, getWorksheet, worksheets } from './index';
import { worksheetMeta } from './meta';

describe('worksheets', () => {
	it('covers the five lab weeks in order', () => {
		expect(worksheets.map((week) => week.week)).toEqual([1, 2, 3, 4, 5]);
		for (const week of worksheets) {
			expect(week.title.length).toBeGreaterThan(5);
			expect(week.lecture.length).toBeGreaterThan(5);
			expect(week.sections.length).toBeGreaterThan(0);
			expect(week.source).toMatch(/^worksheets\/week-\d\/document\.md$/);
		}
	});

	it('carries every exercise from the paper sheets', () => {
		expect(worksheets.map(exerciseCount)).toEqual([13, 8, 14, 11, 17]);
		expect(worksheets.reduce((sum, week) => sum + exerciseCount(week), 0)).toBe(63);
	});

	it('keeps the compatibility metadata in sync with the content', () => {
		expect(worksheetMeta).toEqual(
			worksheets.map(({ week, title, lecture, duration }) => ({ week, title, lecture, duration }))
		);
	});

	it('finds a week by number and refuses the rest', () => {
		expect(getWorksheet(5)?.title).toContain('Bash');
		expect(getWorksheet(6)).toBeUndefined();
		expect(getWorksheet(Number.NaN)).toBeUndefined();
	});
});