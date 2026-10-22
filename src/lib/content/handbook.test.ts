import { describe, expect, it } from 'vitest';
import { chapters, chapterNeighbours, getChapter, prerenderableChapterSlugs } from './handbook';
import { handbookMeta } from './handbook-meta';

/**
 * The C Handbook is the second curriculum track. These assertions protect the
 * two things that break silently: a chapter that exists on disk but is absent
 * from the rail manifest, and a chapter whose frontmatter drifted from the
 * loader's contract.
 */
describe('C Handbook chapters', () => {
	it('has twenty chapters in reading order', () => {
		expect(handbookMeta).toHaveLength(20);
		expect(chapters).toHaveLength(20);
		const slugs = handbookMeta.map((chapter) => chapter.slug);
		expect(slugs).toEqual([...slugs].sort());
		slugs.forEach((slug, index) => {
			expect(slug.startsWith(`${String(index + 1).padStart(2, '0')}-`), slug).toBe(true);
		});
	});

	it('keeps the rail manifest in sync with the MDX frontmatter', () => {
		expect(
			chapters.map((chapter) => ({
				slug: chapter.slug,
				id: chapter.frontmatter.id,
				title: chapter.frontmatter.title,
				estimatedMinutes: chapter.frontmatter.estimatedMinutes,
				hasExercise: chapter.frontmatter.hasExercise
			}))
		).toEqual(handbookMeta);
	});

	it('gives every chapter a usable title, id and reading time', () => {
		for (const chapter of chapters) {
			expect(chapter.frontmatter.id, chapter.slug).toBe(chapter.slug);
			expect(chapter.frontmatter.title.length, chapter.slug).toBeGreaterThan(3);
			expect(chapter.frontmatter.estimatedMinutes, chapter.slug).toBeGreaterThanOrEqual(20);
			expect(chapter.frontmatter.estimatedMinutes, chapter.slug).toBeLessThanOrEqual(60);
			expect(chapter.frontmatter.hasExercise, chapter.slug).toBe(true);
			expect(chapter.component, chapter.slug).toBeTruthy();
		}
	});

	it('resolves chapters and their neighbours', () => {
		const first = chapters[0];
		const last = chapters[chapters.length - 1];

		expect(getChapter(first.slug)?.slug).toBe(first.slug);
		expect(getChapter('does-not-exist')).toBeUndefined();

		expect(chapterNeighbours(first.slug).previous).toBeUndefined();
		expect(chapterNeighbours(first.slug).next?.slug).toBe(chapters[1].slug);
		expect(chapterNeighbours(last.slug).next).toBeUndefined();
		expect(chapterNeighbours(last.slug).previous?.slug).toBe(chapters[chapters.length - 2].slug);
	});

	it('prerenders every chapter', () => {
		expect(prerenderableChapterSlugs()).toEqual(chapters.map((chapter) => chapter.slug));
	});
});