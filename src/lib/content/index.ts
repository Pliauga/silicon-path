import type { Component } from 'svelte';
import type { LessonFrontmatter, Module } from './types';
import { modules } from './curriculum';

/** A lesson resolved from disk and matched to its curriculum entry. */
export interface LoadedLesson {
	/** Route slug, derived from the file name. */
	slug: string;
	frontmatter: LessonFrontmatter;
	/** The compiled MDX body. */
	component: Component;
	module: Module;
}

type MdxModule = {
	default: Component;
	metadata?: LessonFrontmatter;
};

/**
 * Every `.mdx` lesson, eager-imported so the static prerender can resolve any
 * lesson route at build time. The set is small by design; if lessons ever get
 * heavy we swap this for a manifest + dynamic import per slug.
 */
const files = import.meta.glob<MdxModule>('/src/content/lessons/**/*.mdx', {
	eager: true
});

/** `…/01-what-is-data/01-bits-bytes.mdx` → `01-bits-bytes`. */
function slugFromPath(path: string): string {
	const file = path.split('/').pop() ?? '';
	return file.replace(/\.mdx$/, '');
}

function toLesson(path: string, mod: MdxModule): LoadedLesson | null {
	const slug = slugFromPath(path);
	const frontmatter = mod.metadata;
	if (!frontmatter) return null;

	const owner = modules.find((entry) => entry.id === frontmatter.module);
	if (!owner) return null;

	return { slug, frontmatter, component: mod.default, module: owner };
}

/** All lessons, keyed by route slug. */
export const lessons: Map<string, LoadedLesson> = new Map(
	Object.entries(files)
		.map(([path, mod]) => toLesson(path, mod))
		.filter((lesson): lesson is LoadedLesson => lesson !== null)
		.map((lesson) => [lesson.slug, lesson])
);

/** Ready-to-render lessons in curriculum order. */
export const lessonsInOrder: LoadedLesson[] = modules.flatMap((module) =>
	module.lessons.flatMap((meta) => {
		const lesson = lessons.get(meta.slug);
		return lesson ? [lesson] : [];
	})
);

/** Looks up a single lesson by route slug. */
export function getLesson(slug: string): LoadedLesson | undefined {
	return lessons.get(slug);
}

/** The first lesson a brand-new learner should open. */
export function firstLessonSlug(): string | undefined {
	return lessonsInOrder[0]?.slug;
}

/** Neighbouring lessons for the prev/next footer controls. */
export function lessonNeighbours(slug: string): {
	previous: LoadedLesson | undefined;
	next: LoadedLesson | undefined;
} {
	const index = lessonsInOrder.findIndex((lesson) => lesson.slug === slug);
	if (index === -1) return { previous: undefined, next: undefined };
	return {
		previous: index > 0 ? lessonsInOrder[index - 1] : undefined,
		next: index < lessonsInOrder.length - 1 ? lessonsInOrder[index + 1] : undefined
	};
}

/** Slugs to prerender — keeps `python -m http.server` working with no rewrites. */
export function prerenderableLessonSlugs(): string[] {
	return [...lessons.keys()];
}
