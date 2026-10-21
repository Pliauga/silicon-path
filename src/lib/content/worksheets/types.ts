/**
 * Data model for the lab worksheet track.
 *
 * The worksheets are lab scripts, not lessons: each card is either a reading
 * task with a written answer (`note`) or a small C program (`code`). Phrasing
 * follows the CST1500 sheets so students can move between paper and app.
 */

export type WorksheetMode = 'code' | 'note';

export interface WorksheetExercise {
	/** Stable id, e.g. `ws1-ex05`; also the progress key. */
	id: string;
	/** The sheet's exercise number, e.g. `EX 5`. */
	label: string;
	title: string;
	/** The task itself, one or two plain-text paragraphs. */
	prompt: string;
	/** Progressive hints, gentle first. */
	hints: string[];
	/** Reference answer (for note tasks) or reference program (for code). */
	solution: string;
	mode: WorksheetMode;
	/** C scaffold shown in the editor. */
	starter?: string;
	/** Fixed stdin for the in-browser run. */
	stdin?: string;
	/** Exact stdout for Check; omit when addresses or timings vary. */
	expectedStdout?: string;
	concept?: string;
}

export interface WorksheetSection {
	id: string;
	title: string;
	note?: string;
	exercises: WorksheetExercise[];
}

export type WorksheetFigureKind =
	| 'pc'
	| 'bases'
	| 'binary'
	| 'float'
	| 'waveform'
	| 'bitwise'
	| 'gates'
	| 'gates3d'
	| 'bash';

export interface WorksheetFigure {
	kind: WorksheetFigureKind;
	/** Caption shown above the widget. */
	caption: string;
}

export interface WorksheetWeek {
	week: number;
	title: string;
	/** Short lecture reference, e.g. `Lecture 01–02 — Data Representation`. */
	lecture: string;
	/** Two or three paragraphs of orientation, `\n\n`-separated. */
	intro: string;
	/** Time estimate, e.g. `90 minutes`. */
	duration: string;
	/** Original worksheet file, for traceability. */
	source: string;
	figures: WorksheetFigure[];
	sections: WorksheetSection[];
}

export function exerciseCount(week: WorksheetWeek): number {
	return week.sections.reduce((total, section) => total + section.exercises.length, 0);
}