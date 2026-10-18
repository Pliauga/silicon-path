/**
 * The C Handbook: a second, independent learning track.
 *
 * The twenty chapters in `src/content/handbook` are converted textbook
 * chapters — one MDX file per chapter — and deliberately live outside the
 * CST1500 curriculum. They have their own route (`/handbook/[slug]`), their
 * own navigation and their own frontmatter shape; nothing here feeds the
 * module list, the course progress total, or the 3D studies.
 */
import type { Component } from 'svelte';

export interface HandbookFrontmatter {
	/** Stable id, normally identical to the route slug. */
	id: string;
	title: string;
	estimatedMinutes: number;
	hasExercise: boolean;
}

export interface HandbookChapter {
	/** Route slug, derived from the file name, e.g. `01-introduction-to-c`. */
	slug: string;
	frontmatter: HandbookFrontmatter;
	component: Component;
}

type MdxModule = {
	default: Component;
	metadata?: Partial<HandbookFrontmatter>;
};

/** Every chapter is eager-imported: the static build prerenders all of them. */
const files = import.meta.glob<MdxModule>('/src/content/handbook/*.mdx', { eager: true });

function slugFromPath(path: string): string {
	const file = path.split('/').pop() ?? '';
	return file.replace(/\.mdx$/, '');
}

function toChapter(path: string, mod: MdxModule): HandbookChapter | null {
	const slug = slugFromPath(path);
	const meta = mod.metadata;
	if (!meta || typeof meta.title !== 'string' || meta.title.length === 0) return null;

	return {
		slug,
		frontmatter: {
			id: typeof meta.id === 'string' && meta.id.length > 0 ? meta.id : slug,
			title: meta.title,
			estimatedMinutes:
				typeof meta.estimatedMinutes === 'number' && meta.estimatedMinutes > 0
					? meta.estimatedMinutes
					: 30,
			hasExercise: meta.hasExercise === true
		},
		component: mod.default
	};
}

/**
 * Chapters in reading order. The numeric filename prefix is the ordering
 * contract, so `01-…` sorts before `02-…` even when the glob order changes.
 */
export const chapters: HandbookChapter[] = Object.entries(files)
	.map(([path, mod]) => toChapter(path, mod))
	.filter((chapter): chapter is HandbookChapter => chapter !== null)
	.sort((a, b) => a.slug.localeCompare(b.slug));

/** Looks up a single chapter by route slug. */
export function getChapter(slug: string): HandbookChapter | undefined {
	return chapters.find((chapter) => chapter.slug === slug);
}

/** Neighbouring chapters for the prev/next footer controls. */
export function chapterNeighbours(slug: string): {
	previous: HandbookChapter | undefined;
	next: HandbookChapter | undefined;
} {
	const index = chapters.findIndex((chapter) => chapter.slug === slug);
	if (index === -1) return { previous: undefined, next: undefined };
	return {
		previous: index > 0 ? chapters[index - 1] : undefined,
		next: index < chapters.length - 1 ? chapters[index + 1] : undefined
	};
}

/** Slugs to prerender, so the static build has one HTML file per chapter. */
export function prerenderableChapterSlugs(): string[] {
	return chapters.map((chapter) => chapter.slug);
}

/** The first chapter a reader should open from a cold start. */
export function firstChapterSlug(): string | undefined {
	return chapters[0]?.slug;
}