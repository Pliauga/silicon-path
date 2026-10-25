#!/usr/bin/env node
/**
 * Silicon Path — bake the CSP inline-script hashes into `build/_headers`.
 *
 * The policy in `static/_headers` authorises the two inline scripts SvelteKit
 * prerenders — the theme bootstrap from `src/app.html`, and the hydration
 * bootstrap — with `'sha256-...'` source expressions. Those hashes are a function
 * of the emitted bytes, and SvelteKit derives the hydration global's name
 * (`__sveltekit_<id>`) from a per-build value, so they change on every build
 * even when no source changed. A hand-maintained list therefore rots
 * immediately, and once it is wrong the browser blocks the script and leaves the
 * page half-initialised — a blank screen, not a warning.
 *
 * So the build owns the list. This runs after `vite build`, reads every
 * prerendered HTML file, and rewrites the `script-src` hashes in the copied
 * `build/_headers`. It fails the build if a script it found did not make it into
 * the policy — a failure here is a broken site, not a warning.
 *
 * Run: node scripts/csp-hashes.mjs  (wired into `pnpm build`)
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BUILD = path.join(ROOT, 'build');
const BUILT_HEADERS = path.join(BUILD, '_headers');

/** An inline `<script>`: no `src`, captured attributes and body. */
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;

/** The policy line as written in `_headers` (`  Content-Security-Policy: …`). */
const CSP_LINE = /^([ \t]*Content-Security-Policy:[ \t]*)(.+)$/im;

/** Every `.html` file below `dir`, recursively. */
async function htmlFiles(dir) {
	const found = [];
	for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) found.push(...(await htmlFiles(full)));
		else if (entry.name.endsWith('.html')) found.push(full);
	}
	return found;
}

/** sha256 of every inline script body found in the prerendered pages. */
async function collectHashes() {
	const hashes = new Set();
	const files = await htmlFiles(BUILD);
	for (const file of files) {
		const html = await fs.readFile(file, 'utf8');
		for (const [, attrs, body] of html.matchAll(SCRIPT_TAG)) {
			if (/\bsrc\s*=/i.test(attrs)) continue;
			hashes.add(createHash('sha256').update(body, 'utf8').digest('base64'));
		}
	}
	return { hashes, files: files.length };
}

/**
 * Replace the `'sha256-…'` sources of `script-src`, keeping everything else in
 * the policy untouched — the non-script directives are hand-written and are not
 * this script's business.
 */
function withHashes(policy, hashes) {
	const tokens = hashes.map((hash) => `'sha256-${hash}'`);
	let patched = false;
	const directives = policy
		.split(';')
		.map((directive) => directive.trim())
		.filter((directive) => directive.length > 0)
		.map((directive) => {
			const [name, ...sources] = directive.split(/\s+/);
			if (name.toLowerCase() !== 'script-src') return directive;
			patched = true;
			const kept = sources.filter((source) => !source.startsWith("'sha256-"));
			return [name, ...kept, ...tokens].join(' ');
		});
	if (!patched) {
		throw new Error(`no script-src directive in ${path.relative(ROOT, BUILT_HEADERS)}`);
	}
	return directives.join('; ');
}

async function main() {
	let headers;
	try {
		headers = await fs.readFile(BUILT_HEADERS, 'utf8');
	} catch {
		throw new Error(
			`${path.relative(ROOT, BUILT_HEADERS)} is missing — run \`vite build\` first, or check that static/_headers exists`
		);
	}

	const { hashes, files } = await collectHashes();
	if (hashes.size === 0) {
		throw new Error(`no inline <script> found in ${files} prerendered pages under build/`);
	}

	const ordered = [...hashes].sort();
	const line = headers.match(CSP_LINE);
	if (!line) throw new Error(`no Content-Security-Policy header in ${path.relative(ROOT, BUILT_HEADERS)}`);

	const policy = withHashes(line[2].trim(), ordered);
	await fs.writeFile(BUILT_HEADERS, headers.replace(CSP_LINE, `${line[1]}${policy}`));

	// Read the file back: what ships is what gets checked, not what we think we wrote.
	const written = (await fs.readFile(BUILT_HEADERS, 'utf8')).match(CSP_LINE)?.[2] ?? '';
	const missing = ordered.filter((hash) => !written.includes(`'sha256-${hash}'`));
	if (missing.length > 0) {
		throw new Error(`script-src is missing ${missing.length} inline-script hash(es) after writing`);
	}
	console.log(
		`csp-hashes: ${ordered.length} inline-script hash(es) over ${files} pages, ${written.length} B policy`
	);
}

await main();
