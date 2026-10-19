/**
 * Guards the vendored toolchain payload.
 *
 * The 40 MB of pruned Emception assets in `static/emception/cdn` are the only
 * thing standing between the app and a non-functional playground. They are
 * downloaded once at build-automation time and committed; nothing in CI
 * regenerates them. If a bundle is deleted, or the manifest stops pointing at a
 * file that exists, this test fails before a student ever presses Run.
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const CDN_DIR = join(process.cwd(), 'static', 'emception', 'cdn');
const MANIFEST_PATH = join(CDN_DIR, 'manifest.json');

/** Bundles touched by a C compile → link → run cycle. */
const REQUIRED_BUNDLES = [
	'clang',
	'lld',
	'cache-core',
	'cache-crt',
	'clang-headers',
	'usr-include'
] as const;

interface BundleEntry {
	files: string[];
	url: string;
	size: number;
	hash: string;
}

interface Manifest {
	schemaVersion: number;
	baseUrl: string;
	bundles: Record<string, BundleEntry>;
}

async function loadManifest(): Promise<Manifest> {
	const { readFile } = await import('node:fs/promises');
	return JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Manifest;
}

describe('vendored toolchain payload', () => {
	it('ships a manifest', () => {
		expect(existsSync(MANIFEST_PATH)).toBe(true);
	});

	it('keeps the manifest and its bundle files in sync', async () => {
		const manifest = await loadManifest();

		expect(manifest.schemaVersion).toBe(2);
		expect(manifest.baseUrl).toBe('/emception/cdn');

		for (const name of REQUIRED_BUNDLES) {
			const bundle = manifest.bundles[name];
			if (!bundle) throw new Error(`manifest is missing bundle: ${name}`);

			// Bundle URLs keep the adapter's baked `/cdn` prefix; the payload is
			// served from `/emception/cdn` (see boot() in the adapter, which
			// re-prefixes the manifest directory), so `/cdn/x` lives at
			// `static/emception/cdn/x`.
			const url = new URL(bundle.url, 'http://localhost');
			const onDisk = join(process.cwd(), 'static', 'emception', url.pathname.slice(1));

			expect(existsSync(onDisk), `missing tarball for ${name}: ${bundle.url}`).toBe(true);
			expect(statSync(onDisk).size).toBe(bundle.size);
		}
	});
});