// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

/**
 * Smoke test for the second track's front door: the index must mount and list
 * every handbook chapter. `$app/*` is mocked exactly as in the dashboard test.
 */
vi.mock('$app/paths', () => ({
	resolve: (route: string, params: Record<string, string> = {}) =>
		route.replace(/\[([^\]]+)\]/g, (_, key: string) => params[key] ?? '')
}));

vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/handbook'), params: {}, status: 200, error: null }
}));

import { render } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('C Handbook index', () => {
	it('lists twenty chapters in reading order', () => {
		const { container } = render(Page);
		const links = [...container.querySelectorAll('ol a[href^="/handbook/"]')];
		expect(links).toHaveLength(20);
		expect(links[0]?.getAttribute('href')).toBe('/handbook/01-introduction-to-c');
		expect(container.querySelector('a.btn-clay')?.getAttribute('href')).toBe(
			'/handbook/01-introduction-to-c'
		);
		expect(container.querySelector('h1')?.textContent).toContain('The C Handbook');
	});
});