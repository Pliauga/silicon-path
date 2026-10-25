// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { settings } from './settings.svelte';

describe('density setting', () => {
	beforeEach(() => {
		localStorage.clear();
		settings.setDensity('comfortable');
	});

	it('toggles between comfortable and dense', () => {
		settings.toggleDensity();
		expect(settings.density).toBe('dense');
		settings.toggleDensity();
		expect(settings.density).toBe('comfortable');
	});

	it('reflects onto <html data-density> and persists the choice', () => {
		settings.setDensity('dense');
		settings.apply();
		expect(document.documentElement.getAttribute('data-density')).toBe('dense');
		expect(localStorage.getItem('silicon-path:density')).toBe('dense');
	});
});
