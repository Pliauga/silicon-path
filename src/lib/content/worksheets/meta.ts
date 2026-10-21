import type { WorksheetWeek } from './types';

/**
 * Title-only metadata for the shell. The rail and drawer list worksheets on
 * every route, so they must not import the full card text (60+ exercises) into
 * the navigation bundle. `worksheets.test.ts` keeps this list in sync with the
 * real content.
 */
export const worksheetMeta: Pick<WorksheetWeek, 'week' | 'title' | 'lecture' | 'duration'>[] = [
	{
		week: 1,
		title: 'Introduction to IoT & Basic Numbers',
		lecture: 'Lecture 01–02 — Data Representation',
		duration: '90 minutes'
	},
	{
		week: 2,
		title: 'Logic, Decisions & Pointers',
		lecture: 'Lecture 03–05 — Architecture, Logic, Sequential Logic',
		duration: '100 minutes'
	},
	{
		week: 3,
		title: 'Input, Output & Loops',
		lecture: 'Lecture 06–08 — Memory, I/O, Control',
		duration: '110 minutes'
	},
	{
		week: 4,
		title: 'Batch Files & Windows Scripting',
		lecture: 'Lecture 09–10 — Operating Systems & Scripting',
		duration: '90 minutes'
	},
	{
		week: 5,
		title: 'Unix Shell Scripting with Bash',
		lecture: 'Lecture 10–11 — OS, Processes, Shell',
		duration: '120 minutes'
	}
];