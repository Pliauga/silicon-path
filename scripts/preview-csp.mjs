/**
 * Read the production Content-Security-Policy for `vite preview`.
 *
 * `static/_headers` is the single source of truth for the policy and
 * `scripts/csp-hashes.mjs` bakes the per-build inline-script hashes into
 * `build/_headers`. `vite.config.ts` serves that policy from preview responses so
 * `pnpm preview` behaves like production: a violation shows up locally, not as a
 * blank page after deploy.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Extract the `Content-Security-Policy` value from the text of a `_headers` file.
 * Comment lines (`# ...`) are skipped so prose that mentions the header cannot match.
 *
 * @param {string} source
 * @returns {string | null}
 */
export function parseCspFromHeaders(source) {
	for (const line of source.split('\n')) {
		const match = /^[ \t]*Content-Security-Policy:[ \t]*(.+?)[ \t]*$/i.exec(line);
		if (match) return match[1];
	}
	return null;
}

/**
 * Returns a reader for `<root>/<outDir>/_headers`' policy. The file is read per
 * call because `pnpm build` rewrites it while a preview server may be running; a
 * missing file (no build yet) yields `null` so no header is added.
 *
 * @param {string} root
 * @param {string} [outDir]
 * @returns {() => string | null}
 */
export function previewCspReader(root, outDir = 'build') {
	const headersFile = path.resolve(root, outDir, '_headers');
	return () => {
		try {
			return parseCspFromHeaders(fs.readFileSync(headersFile, 'utf8'));
		} catch {
			return null;
		}
	};
}
