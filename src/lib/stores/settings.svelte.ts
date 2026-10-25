/**
 * Theme and density preferences.
 *
 * The first paint is handled by the inline bootstrap in `app.html` so there is
 * no flash; this store adopts whatever that script decided and then owns every
 * subsequent change. `localStorage` is the only persistence (§2 constraint 6).
 *
 * DOM writes happen inside `apply()`, which `+layout.svelte` calls from an
 * `$effect`, so the store stays free of import-time side effects.
 */

export type Theme = 'dark' | 'light';
export type Density = 'comfortable' | 'dense';
/** Which everyday metaphor the "explain it like I'm five" blocks use. */
export type AnalogyMode = 'football' | 'money';

const THEME_KEY = 'silicon-path:theme';
const DENSITY_KEY = 'silicon-path:density';
const ANALOGY_KEY = 'silicon-path:analogy';

/** Reads storage without assuming it exists (private mode, blocked storage). */
function readStored(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStored(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// A failed write must never break the interaction.
	}
}

/** Mirrors the `app.html` bootstrap: stored value wins, then the OS preference. */
function initialTheme(): Theme {
	const stored = readStored(THEME_KEY);
	if (stored === 'dark' || stored === 'light') return stored;
	// `matchMedia` is absent in jsdom and in some embedded webviews, so the
	// existence check matters as much as the `window` one.
	if (
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-color-scheme: dark)').matches
	) {
		return 'dark';
	}
	return 'light';
}

function initialDensity(): Density {
	return readStored(DENSITY_KEY) === 'dense' ? 'dense' : 'comfortable';
}

function initialAnalogy(): AnalogyMode {
	return readStored(ANALOGY_KEY) === 'money' ? 'money' : 'football';
}

class SettingsStore {
	theme = $state<Theme>(initialTheme());
	density = $state<Density>(initialDensity());
	analogyMode = $state<AnalogyMode>(initialAnalogy());

	/** Reflects the current preferences onto `<html>` and persists them. */
	apply(): void {
		if (typeof document !== 'undefined') {
			document.documentElement.setAttribute('data-theme', this.theme);
			document.documentElement.setAttribute('data-density', this.density);
			document.documentElement.setAttribute('data-analogy', this.analogyMode);
			// Keep the browser chrome in step: form controls, scrollbars and the mobile address bar.
			document
				.querySelector('meta[name="color-scheme"]')
				?.setAttribute('content', this.theme);
			document
				.querySelector('meta[name="theme-color"]')
				?.setAttribute('content', this.theme === 'dark' ? '#141210' : '#f5f2eb');
		}
		writeStored(THEME_KEY, this.theme);
		writeStored(DENSITY_KEY, this.density);
		writeStored(ANALOGY_KEY, this.analogyMode);
	}

	toggleTheme(): void {
		this.theme = this.theme === 'dark' ? 'light' : 'dark';
	}

	setTheme(theme: Theme): void {
		this.theme = theme;
	}

	toggleDensity(): void {
		this.density = this.density === 'dense' ? 'comfortable' : 'dense';
	}

	setDensity(density: Density): void {
		this.density = density;
	}

	setAnalogyMode(mode: AnalogyMode): void {
		this.analogyMode = mode;
	}
}

export const settings = new SettingsStore();
