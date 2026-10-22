import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Guards the Dark Academia palette: every text pairing the app uses must clear
 * WCAG AA on the surfaces it sits on. The values are read from `app.css`, so a
 * token edit that breaks contrast fails here instead of in a reader's eyes.
 */
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const darkBlock = css.match(/:root\[data-theme='dark'\] \{([\s\S]*?)\n\}/)?.[1] ?? '';

function token(name: string): string {
	const match = darkBlock.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
	if (!match) throw new Error(`dark token ${name} not found`);
	return match[1];
}

function channel(value: number): number {
	const c = value / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

describe('dark theme contrast', () => {
	const surfaces = ['--rubin-ivory', '--rubin-ivory-med', '--rubin-ivory-dark', '--rubin-warm-tint'];

	it.each([
		['--rubin-slate', 4.5],
		['--rubin-dark-gray', 4.5],
		['--rubin-muted', 4.5],
		['--rubin-clay-ink', 4.5],
		['--rubin-cyan-ink', 4.5],
		['--rubin-teal-ink', 4.5],
		['--rubin-olive-ink', 4.5],
		['--warning', 4.5],
		['--error', 4.5]
	])('%s clears AA on every surface', (name, minimum) => {
		for (const surface of surfaces) {
			expect(ratio(token(name), token(surface))).toBeGreaterThanOrEqual(minimum);
		}
	});

	it('keeps text on the terracotta fill readable', () => {
		expect(ratio(token('--accent-text'), token('--rubin-clay'))).toBeGreaterThanOrEqual(4.5);
		expect(ratio(token('--accent-text'), token('--rubin-clay-hover'))).toBeGreaterThanOrEqual(4.5);
	});

	it('keeps every syntax ink readable on the code surface with grid and active-line wash', () => {
		// Worst case measured in the design pass: 5% clay grid under a 10% stone wash.
		const worst = '#2b2420';
		for (const name of [
			'--rubin-clay-code',
			'--rubin-cyan-code',
			'--rubin-teal-code',
			'--rubin-olive-code',
			'--syntax-operator'
		]) {
			expect(ratio(token(name), token('--rubin-paper'))).toBeGreaterThanOrEqual(4.5);
			expect(ratio(token(name), worst)).toBeGreaterThanOrEqual(4.5);
		}
	});

	it('uses no pure black or white surface', () => {
		for (const surface of surfaces) {
			expect(token(surface).toLowerCase()).not.toBe('#000000');
			expect(token(surface).toLowerCase()).not.toBe('#ffffff');
		}
	});
});
