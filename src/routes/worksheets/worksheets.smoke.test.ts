// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

/**
 * Smoke test for the worksheet track: the index lists five weeks, and a week
 * page renders every exercise card from its data with the expected ids.
 */
vi.mock('$app/paths', () => ({
	resolve: (route: string, params: Record<string, string> = {}) =>
		route.replace(/\[([^\]]+)\]/g, (_, key: string) => params[key] ?? '')
}));

vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/worksheets'), params: {}, status: 200, error: null }
}));

import { render } from '@testing-library/svelte';
import Index from './+page.svelte';
import WeekPage from './[week]/+page.svelte';
import { week5 } from '$lib/content/worksheets/week5';

describe('worksheets index', () => {
	it('lists the five lab weeks', () => {
		const { container } = render(Index);
		const links = [...container.querySelectorAll('a[href^="/worksheets/"]')];
		expect(links).toHaveLength(5);
		expect(links[0]?.getAttribute('href')).toBe('/worksheets/1');
		expect(container.querySelector('h1')?.textContent).toContain('Five labs');
		expect(container.textContent).toContain('63 exercises');
	});
});

describe('one worksheet week', () => {
	it('renders every exercise card and the week header', () => {
		const { container } = render(WeekPage, { data: { week: week5 } });
		expect(container.querySelector('h1')?.textContent).toContain(week5.title);
		const cards = container.querySelectorAll('[data-exercise-id]');
		expect(cards).toHaveLength(17);
		expect(container.querySelector('[data-exercise-mode="note"]')).not.toBeNull();
	});
});