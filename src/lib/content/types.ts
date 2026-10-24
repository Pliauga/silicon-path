/** Shapes shared by the curriculum, the content loader, and the lesson route. */

export interface LessonMeta {
	/** Frontmatter `id`, e.g. `01-01-bits-bytes`. */
	id: string;
	/** Route slug, e.g. `01-bits-bytes`. */
	slug: string;
	title: string;
	estimatedMinutes: number;
	prerequisites: string[];
	hasExercise: boolean;
	hasQuiz: boolean;
}

export interface Module {
	/** 1..23; 23 is the supplementary Bash & Scripting module */
	id: number;
	slug: string;
	title: string;
	/** The exact slide-deck lecture title. */
	lectureTitle: string;
	/** One-sentence teaser. */
	blurb: string;
	lessons: LessonMeta[];
	/** True when the module carries significant C exercises. */
	cHeavy: boolean;
}

/** Frontmatter as authored in each `.mdx` file (agents.md §4.1). */
export interface LessonFrontmatter {
	id: string;
	title: string;
	module: number;
	lecture: string;
	/** Slide range for the LectureReference card, e.g. "5–17". */
	slides: string;
	estimatedMinutes: number;
	prerequisites: string[];
	tags: string[];
	hasExercise: boolean;
	hasQuiz: boolean;
}

/**
 * One exercise inside a C Handbook chapter. Handbook MDX spreads these props
 * into `<ExerciseCard />`; keeping the C programs in TypeScript rather than in
 * MDX attributes is what makes multi-line starter code readable and testable.
 */
export interface HandbookExercise {
	/** Stable id, namespaced `hb-<chapter>-…`, e.g. `hb-01-savings-receipt`. */
	id: string;
	/** The task, one short paragraph. */
	prompt: string;
	/** Starter C, shown in the editor's initial buffer. */
	starter: string;
	/** A complete reference program, revealed only on request. */
	solution: string;
	/** Exact stdout expected from a correct program, when the draft authors one. */
	expectedStdout?: string;
	expectedExitCode?: number;
	/** Progressive hints, from gentle to almost-the-answer. */
	hints: string[];
	/** Concept label, e.g. "reading compiler diagnostics". */
	concept: string;
}
