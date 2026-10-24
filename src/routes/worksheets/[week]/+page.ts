import { error } from '@sveltejs/kit';
import { getWorksheet, worksheets } from '$lib/content/worksheets';
import type { EntryGenerator, PageLoad } from './$types';

/**
 * The shell renders client-side (`ssr = false`), so the crawler cannot discover
 * these links from HTML. Name the five weeks explicitly.
 */
export const entries: EntryGenerator = () =>
	worksheets.map((week) => ({ week: String(week.week) }));

export const load: PageLoad = ({ params }) => {
	const week = getWorksheet(Number(params.week));
	if (!week) error(404, 'That worksheet does not exist.');
	return { week };
};