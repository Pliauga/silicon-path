import type { HandbookExercise } from './types';

/**
 * All chapter exercises, merged from one TypeScript module per chapter.
 *
 * The app never imports this registry at runtime — each MDX chapter imports its
 * own module, so a reader only downloads the exercises on the page — but the
 * loader-side test suite uses it to enforce ids, shapes and the three-per-chapter
 * contract.
 */
type ChapterModule = Record<string, unknown>;

const chapterFiles = import.meta.glob<ChapterModule>(
	'/src/lib/content/handbook/exercises/*.ts',
	{ eager: true }
);

function isExercise(value: unknown): value is HandbookExercise {
	if (typeof value !== 'object' || value === null) return false;
	const record = value as Partial<HandbookExercise>;
	return (
		typeof record.id === 'string' &&
		typeof record.prompt === 'string' &&
		typeof record.starter === 'string' &&
		typeof record.solution === 'string' &&
		Array.isArray(record.hints) &&
		typeof record.concept === 'string'
	);
}

/** Flat list, in file order, of every authored handbook exercise. */
export const handbookExercises: HandbookExercise[] = Object.values(chapterFiles)
	.flatMap((module) => Object.values(module).filter(isExercise))
	.sort((a, b) => a.id.localeCompare(b.id));