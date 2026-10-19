/**
 * Safari regression guard: JavaScriptCore refuses linked programs that carry
 * DWARF custom sections ("can't get 11th custom section's ..."), so every
 * wasm-ld invocation must strip them.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { STRIP_FLAG, withStripFlag } from './link-flags';

describe('withStripFlag', () => {
	const argv = ['wasm-ld', '/home/user/main.o', '-o', '/home/user/main.wasm', '-lc'];

	it('appends --strip-all', () => {
		expect(withStripFlag(argv)).toEqual([...argv, STRIP_FLAG]);
	});

	it('is idempotent', () => {
		expect(withStripFlag(withStripFlag(argv)).filter((a) => a === STRIP_FLAG)).toHaveLength(1);
	});

	it('does not mutate its input', () => {
		const copy = [...argv];
		withStripFlag(argv);
		expect(argv).toEqual(copy);
	});
});

describe('emception backend wiring', () => {
	it('routes the C preset link step through withStripFlag', () => {
		const source = readFileSync(join(process.cwd(), 'src/lib/compiler/emception-backend.ts'), 'utf8');
		expect(source).toContain("from './link-flags'");
		expect(source).toMatch(/linkArgv = \(paths\) => withStripFlag\(/);
	});
});
