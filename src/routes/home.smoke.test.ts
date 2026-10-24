// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

/**
 * Smoke test for criterion 6: the dashboard mounts and lists all 23 modules.
 * `$app/*` is mocked because there is no router under test — the page only
 * needs the current URL and path resolution.
 */
vi.mock('$app/paths', () => ({
	// Minimal stand-in for SvelteKit's router: fill `[param]` segments from the
	// second argument so hrefs read like the real ones.
	resolve: (route: string, params: Record<string, string> = {}) =>
		route.replace(/\[(?:\.\.\.)?([^\]]+)\]/g, (_, key: string) => params[key] ?? ''),
	// The 3D hero resolves model and decoder URLs through SvelteKit's asset helper.
	asset: (path: string) => `/${path}`
}));

vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/'), params: {}, status: 200, error: null }
}));

import { render } from '@testing-library/svelte';
import Page from './+page.svelte';
import Eli5Block from '$lib/components/lesson/Eli5Block.svelte';
import { settings } from '$lib/stores/settings.svelte';

describe('home page', () => {
	it('renders the hero and all 23 module cards', () => {
		const { container } = render(Page);
		expect(container.querySelector('h1')?.textContent).toContain('From source code to silicon');
		const tiles = container.querySelectorAll('[data-available]');
		expect(tiles.length).toBe(23);
	});

	it('links every module once all 23 modules have lessons', () => {
		const { container } = render(Page);
		const tiles = [...container.querySelectorAll('[data-available]')];
		const links = tiles.filter((tile) => tile.tagName === 'A');
		// All 23 modules now carry lessons, so every tile is a live link. The
		// locked-tile branch still exists for a module whose lessons are removed
		// but nothing currently exercises it.
		expect(links.length).toBe(23);
		expect(links[0]?.getAttribute('href')).toBe('/lesson/01-bits-bytes');
		expect(tiles.filter((t) => t.getAttribute('aria-disabled') === 'true').length).toBe(0);
	});

	it('advertises the second track', () => {
		const { container } = render(Page);
		const handbook = container.querySelector('a[href="/handbook"]');
		expect(handbook?.textContent).toContain('The C Handbook');
	});
});

describe('Eli5Block', () => {
	it('swaps the wording when the analogy mode changes', () => {
		settings.setAnalogyMode('football');
		const { container } = render(Eli5Block, { props: { topic: 'bits' } });
		expect(container.textContent).toContain('match ticket');
		expect(container.textContent).not.toContain('penny');
	});

	it('falls back to generic copy for an unknown topic', () => {
		const { container } = render(Eli5Block, { props: { topic: 'not-a-real-topic' } });
		expect(container.textContent).toContain('team sheet');
	});

	it('prefers copy passed from the lesson over the built-in map', () => {
		settings.setAnalogyMode('money');
		const { container } = render(Eli5Block, {
			props: {
				topic: 'bits',
				football: 'Authored football copy.',
				money: 'Authored money copy.'
			}
		});
		expect(container.textContent).toContain('Authored money copy.');
		expect(container.textContent).not.toContain('penny');
	});

	it('still uses the map when a lesson passes only one side', () => {
		settings.setAnalogyMode('football');
		const { container } = render(Eli5Block, {
			props: { topic: 'bits', money: 'Authored money copy.' }
		});
		expect(container.textContent).toContain('match ticket');
	});
});
