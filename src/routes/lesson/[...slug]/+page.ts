/**
 * Lesson routes are prerendered from the curriculum (agents.md §10), so the
 * static build can serve each lesson as a real HTML file with no server.
 */
import { error } from '@sveltejs/kit';
import { getLesson, lessonNeighbours, lessonsInOrder } from '$lib/content';
import type { EntryGenerator, PageLoad } from './$types';

export const prerender = true;

/** The last segment is the lesson key; earlier segments are the module slug. */
function lessonKey(rest: string): string {
	// A rest parameter keeps the trailing slash (`01-gates/`), so trim it
	// before taking the final segment.
	return rest.replace(/\/+$/, '').split('/').pop() ?? '';
}

/**
 * Both URL shapes resolve to the same lesson:
 *   /lesson/01-gates/               (the compact canonical link)
 *   /lesson/04-logic/01-gates/      (module-qualified, mirrors the file tree)
 */
export const entries: EntryGenerator = () =>
	lessonsInOrder.flatMap((lesson) => [
		{ slug: lesson.slug },
		{ slug: `${lesson.module.slug}/${lesson.slug}` }
	]);

export const load: PageLoad = ({ params }) => {
	const key = lessonKey(params.slug);
	const lesson = getLesson(key);
	if (!lesson) {
		error(404, `No lesson named "${params.slug}" yet.`);
	}

	const { previous, next } = lessonNeighbours(key);

	return {
		slug: lesson.slug,
		frontmatter: lesson.frontmatter,
		moduleTitle: lesson.module.title,
		previous: previous ? { slug: previous.slug, title: previous.frontmatter.title } : undefined,
		next: next ? { slug: next.slug, title: next.frontmatter.title } : undefined
	};
};
