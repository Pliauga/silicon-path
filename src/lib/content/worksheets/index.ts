import { week1 } from './week1';
import { week2 } from './week2';
import { week3 } from './week3';
import { week4 } from './week4';
import { week5 } from './week5';
import type { WorksheetWeek } from './types';

/**
 * The five lab worksheets, in teaching order. Each week is a standalone page:
 * figures first, then sections of exercises. Exercise ids are the progress keys.
 */
export const worksheets: WorksheetWeek[] = [week1, week2, week3, week4, week5];

export function getWorksheet(week: number): WorksheetWeek | undefined {
	return worksheets.find((entry) => entry.week === week);
}

export { exerciseCount } from './types';
export type {
	WorksheetExercise,
	WorksheetFigure,
	WorksheetFigureKind,
	WorksheetMode,
	WorksheetSection,
	WorksheetWeek
} from './types';