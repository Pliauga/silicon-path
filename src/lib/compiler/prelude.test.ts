/**
 * The prelude fixes two real-browser bugs (unflushed stdout, trapping exit()).
 * It must never shift the student's line numbers or hide a missing #include,
 * so these tests compile it natively and check the diagnostics.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LINE_RESET, PRELUDE, withPrelude } from './prelude';

function hasCompiler(): boolean {
	try {
		execFileSync('cc', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function diagnose(source: string): string {
	const dir = mkdtempSync(join(tmpdir(), 'prelude-'));
	const file = join(dir, 'main.c');
	writeFileSync(file, withPrelude(source));
	const result = spawnSync(
		'cc',
		['-std=c11', '-Wall', '-Wextra', '-Wno-unknown-attributes', '-fsyntax-only', file],
		{ encoding: 'utf8' }
	);
	return `${result.stdout}${result.stderr}`;
}

describe('withPrelude', () => {
	it('puts the line reset last so the student starts at line 1', () => {
		expect(PRELUDE.trimEnd().endsWith(LINE_RESET)).toBe(true);
		expect(withPrelude('int main(void){}')).toBe(`${PRELUDE}int main(void){}`);
	});

	it('includes no header, so a missing #include is still the student error', () => {
		expect(PRELUDE).not.toMatch(/#include/);
	});

	it('wires exit to WASI proc_exit and makes stdout unbuffered', () => {
		expect(PRELUDE).toContain('proc_exit');
		expect(PRELUDE).toContain('__asm__("exit")');
		expect(PRELUDE).toContain('__sp_setvbuf(__sp_stdout, 0, 2, 0)');
	});
});

describe.skipIf(!hasCompiler())('prelude against a real compiler', () => {
	it('compiles a normal program with no diagnostics', () => {
		const out = diagnose(
			'#include <stdio.h>\n#include <stdlib.h>\nint main(void) { printf("Hello"); exit(0); }\n'
		);
		expect(out).not.toMatch(/error|warning/);
	});

	it('keeps error line numbers aligned with the student source', () => {
		const out = diagnose('#include <stdio.h>\n\nint main(void) {\n  int x = ;\n  return 0;\n}\n');
		expect(out).toMatch(/main\.c:4:\d+: error: expected expression/);
	});

	it('still reports a missing #include on the student line', () => {
		const out = diagnose('int main(void) { printf("x"); return 0; }\n');
		expect(out).toMatch(/main\.c:1:\d+: (error|warning): .*printf/);
	});
});
