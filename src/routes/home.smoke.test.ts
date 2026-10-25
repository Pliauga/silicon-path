// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

/**
 * The hero's studio scene is WebGL-only: `new WebGLRenderer()` cannot succeed
 * under jsdom, so the component always lands in its `.hero__error` fallback
 * here. These stubs keep the six `await import()` calls it makes from outliving
 * the test file — an import still in flight when the file ends is what produced
 * Vitest 4's "Cannot load ... after the environment was torn down" noise.
 *
 * The renderer throws the same kind of error three.js raises when it cannot get
 * a GPU context, so the component walks the path a real WebGL-less browser
 * would take: `failed = true`, fallback panel, no retry loop.
 */
const { NO_WEBGL } = vi.hoisted(() => ({
	NO_WEBGL: 'THREE.WebGLRenderer: WebGL 2 is not available (jsdom has no GPU context)'
}));

vi.mock('three', () => ({
	Vector3: class {
		set() {
			return this;
		}
	},
	Scene: class {},
	PerspectiveCamera: class {},
	WebGLRenderer: class {
		constructor() {
			throw new Error(NO_WEBGL);
		}
	}
}));
vi.mock('gsap', () => ({ gsap: { registerPlugin: () => {} } }));
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: {} }));
vi.mock('three/addons/loaders/HDRLoader.js', () => ({}));
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({}));
vi.mock('three/addons/loaders/DRACOLoader.js', () => ({}));
vi.mock('three/addons/loaders/KTX2Loader.js', () => ({}));

import { render } from '@testing-library/svelte';
import Page from './+page.svelte';
import Eli5Block from '$lib/components/lesson/Eli5Block.svelte';
import { settings } from '$lib/stores/settings.svelte';

describe('home page', () => {
	let consoleError: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// One error per render is expected under jsdom (see the module stubs above).
		// Capture it so the suite's output stays silent instead of printing what CI
		// would read as a failure — and pin the message, so a *real* error thrown by
		// the component cannot hide behind the same silence.
		consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		for (const call of consoleError.mock.calls) {
			expect(String(call[0])).toContain('[HomeHero]');
			expect((call[1] as Error | undefined)?.message).toBe(NO_WEBGL);
		}
		consoleError.mockRestore();
	});

	/**
	 * Render the dashboard and wait for the hero's scene attempt to settle.
	 * Without this the component is still mid-`load()` when the test returns,
	 * which is exactly the race Vitest 4 reports at teardown.
	 */
	async function renderHomePage() {
		const result = render(Page);
		const hero = result.container.querySelector('.hero');
		await vi.waitFor(() => expect(hero?.classList.contains('is-loading')).toBe(false));
		return result;
	}

	it('renders the hero and all 23 module cards', async () => {
		const { container } = await renderHomePage();
		expect(container.querySelector('h1')?.textContent).toContain('From source code to silicon');
		const tiles = container.querySelectorAll('[data-available]');
		expect(tiles.length).toBe(23);
	});

	it('links every module once all 23 modules have lessons', async () => {
		const { container } = await renderHomePage();
		const tiles = [...container.querySelectorAll('[data-available]')];
		const links = tiles.filter((tile) => tile.tagName === 'A');
		// All 23 modules now carry lessons, so every tile is a live link. The
		// locked-tile branch still exists for a module whose lessons are removed
		// but nothing currently exercises it.
		expect(links.length).toBe(23);
		expect(links[0]?.getAttribute('href')).toBe('/lesson/01-bits-bytes');
		expect(tiles.filter((t) => t.getAttribute('aria-disabled') === 'true').length).toBe(0);
	});

	it('advertises the second track', async () => {
		const { container } = await renderHomePage();
		const handbook = container.querySelector('a[href="/handbook"]');
		expect(handbook?.textContent).toContain('The C Handbook');
	});

	it('falls back to the error panel when the platform has no WebGL', async () => {
		const { container } = await renderHomePage();
		const hero = container.querySelector('.hero');
		expect(hero?.classList.contains('is-failed')).toBe(true);
		expect(hero?.classList.contains('is-loading')).toBe(false);
		// The fallback must stay readable: users without hardware acceleration get
		// an explanation, not a permanent "Preparing the studio" loader.
		const alert = container.querySelector('[role="alert"]');
		expect(alert?.textContent).toContain('The studio did not open.');
		expect(alert?.textContent).toContain('hardware acceleration');
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
