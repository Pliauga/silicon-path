/**
 * Handbook routes are prerendered from disk, exactly like lessons, so the
 * static bundle carries one HTML file per chapter with no rewrite rules.
 */
import { error } from '@sveltejs/kit';
import { getChapter, prerenderableChapterSlugs } from '$lib/content/handbook';
import type { EntryGenerator, PageLoad } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => prerenderableChapterSlugs().map((slug) => ({ slug }));

export const load: PageLoad = ({ params }) => {
	const chapter = getChapter(params.slug);
	if (!chapter) {
		error(404, `No handbook chapter named "${params.slug}" yet.`);
	}

	return { slug: chapter.slug };
};