import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settings } from './settings.svelte';

/**
 * The store is a module singleton and reads `localStorage` at import time.
 * These tests exercise the in-memory behaviour only; there is no DOM here, so
 * `apply()` must also be safe to call with `document` undefined.
 */
describe('settings store', () => {
	beforeEach(() => {
		settings.setAnalogyMode('football');
	});

	it('defaults to the football analogy', () => {
		expect(settings.analogyMode).toBe('football');
	});

	it('switches to the money analogy', () => {
		settings.setAnalogyMode('money');
		expect(settings.analogyMode).toBe('money');
	});

	it('survives apply() without a DOM', () => {
		settings.setAnalogyMode('money');
		expect(() => settings.apply()).not.toThrow();
		expect(settings.analogyMode).toBe('money');
	});

	it('mirrors the theme onto <html> and the browser chrome meta tags', () => {
		const attrs: Record<string, string> = {};
		const meta = (name: string) => ({
			setAttribute: (key: string, value: string) => (attrs[`${name}.${key}`] = value)
		});
		vi.stubGlobal('document', {
			documentElement: { setAttribute: (key: string, value: string) => (attrs[key] = value) },
			querySelector: (selector: string) =>
				selector.includes('color-scheme') ? meta('scheme') : meta('chrome')
		});
		try {
			settings.setTheme('dark');
			settings.apply();
			expect(attrs['data-theme']).toBe('dark');
			expect(attrs['scheme.content']).toBe('dark');
			expect(attrs['chrome.content']).toBe('#141210');
			settings.setTheme('light');
			settings.apply();
			expect(attrs['data-theme']).toBe('light');
			expect(attrs['chrome.content']).toBe('#f5f2eb');
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('toggles the theme between dark and light', () => {
		const start = settings.theme;
		settings.toggleTheme();
		expect(settings.theme).not.toBe(start);
		settings.toggleTheme();
		expect(settings.theme).toBe(start);
	});
});
