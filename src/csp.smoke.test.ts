import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { preview, type PreviewServer } from 'vite';
import puppeteer, { type Browser } from 'puppeteer-core';
import { parseCspFromHeaders } from '../scripts/preview-csp.mjs';

/**
 * A-04: the production Content-Security-Policy must be exercised before deploy.
 *
 * jsdom does not enforce CSP, so this drives a real Chrome against `vite preview`,
 * which serves `build/` with the policy from `build/_headers` (see
 * `scripts/preview-csp.mjs`). Two routes are loaded and any `securitypolicyviolation`
 * event fails the test: a hash that went stale, a new inline script, or a new
 * remote origin shows up here instead of as a blank page in production.
 *
 * It needs `pnpm build` output and a Chrome/Chromium binary (`CHROME_PATH` to
 * override discovery). Without either it is skipped, with the reason in the title.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const BUILT_HEADERS = path.join(ROOT, 'build', '_headers');

const CHROME_CANDIDATES = [
	process.env.CHROME_PATH,
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/Applications/Chromium.app/Contents/MacOS/Chromium',
	'/usr/bin/google-chrome',
	'/usr/bin/google-chrome-stable',
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser'
];
const chrome = CHROME_CANDIDATES.find((candidate) => candidate && fs.existsSync(candidate));
const hasBuild = fs.existsSync(BUILT_HEADERS);

const ROUTES = ['/', '/about'];

describe('parseCspFromHeaders', () => {
	it('reads the policy and ignores comment lines that mention the header', () => {
		const file = [
			'# Content-Security-Policy: not-this-one',
			'/*',
			"  Content-Security-Policy: default-src 'self'; object-src 'none'",
			'  X-Frame-Options: DENY'
		].join('\n');
		expect(parseCspFromHeaders(file)).toBe("default-src 'self'; object-src 'none'");
	});

	it('returns null when there is no policy', () => {
		expect(parseCspFromHeaders('/*\n  X-Frame-Options: DENY\n')).toBeNull();
	});
});

describe.skipIf(!chrome || !hasBuild)(
	chrome && hasBuild
		? 'CSP smoke (preview + Chrome)'
		: `CSP smoke (skipped: ${hasBuild ? 'no Chrome found, set CHROME_PATH' : 'run pnpm build first'})`,
	() => {
		let server: PreviewServer;
		let browser: Browser;
		let origin: string;

		beforeAll(async () => {
			server = await preview({
				root: ROOT,
				preview: { port: 0, strictPort: false, open: false }
			});
			origin = server.resolvedUrls?.local[0]?.replace(/\/$/, '') ?? '';
			browser = await puppeteer.launch({
				executablePath: chrome,
				headless: true,
				args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
			});
		}, 60_000);

		afterAll(async () => {
			await browser?.close();
			await server?.close();
		});

		it('sends the production policy on preview responses', async () => {
			const expected = parseCspFromHeaders(fs.readFileSync(BUILT_HEADERS, 'utf8'));
			expect(expected).toBeTruthy();
			const response = await fetch(`${origin}/`);
			expect(response.headers.get('content-security-policy')).toBe(expected);
		});

		it.each(ROUTES)('route %s raises no securitypolicyviolation', async (route) => {
			const page = await browser.newPage();
			try {
				await page.evaluateOnNewDocument(() => {
					const w = window as unknown as { __csp: string[] };
					w.__csp = [];
					document.addEventListener('securitypolicyviolation', (event) => {
						w.__csp.push(`${event.violatedDirective} blocked ${event.blockedURI || 'inline'}`);
					});
				});
				await page.goto(`${origin}${route}`, { waitUntil: 'networkidle0', timeout: 45_000 });
				// Let deferred hydration and lazy chunks run before reading the log.
				await new Promise((resolve) => setTimeout(resolve, 1500));
				const violations = await page.evaluate(
					() => (window as unknown as { __csp: string[] }).__csp
				);
				expect(violations).toEqual([]);
			} finally {
				await page.close();
			}
		}, 60_000);
	}
);
