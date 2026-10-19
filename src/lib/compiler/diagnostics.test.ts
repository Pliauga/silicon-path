import { describe, expect, it } from 'vitest';

import { hasBuildFailure, parseDiagnostics } from './diagnostics';

describe('parseDiagnostics', () => {
	it('parses a clang diagnostic with file, line and column', () => {
		const diagnostics = parseDiagnostics("/home/user/main.c:4:9: error: use of undeclared identifier 'x'");

		expect(diagnostics).toEqual([
			{
				severity: 'error',
				message: "use of undeclared identifier 'x'",
				line: 4,
				column: 9,
				source: 'main.c'
			}
		]);
	});

	it('parses a diagnostic without a column', () => {
		const diagnostics = parseDiagnostics('/home/user/main.c:7: warning: unused variable y');

		const [first] = diagnostics;
		expect(first).toMatchObject({ severity: 'warning', line: 7, column: 0 });
	});

	it('parses notes and keeps them in order', () => {
		const output = [
			"/home/user/main.c:4:9: error: use of undeclared identifier 'x'",
			"/home/user/main.c:4:9: note: did you mean 'y'?"
		].join('\n');

		const diagnostics = parseDiagnostics(output);

		expect(diagnostics).toHaveLength(2);
		expect(diagnostics.at(1)?.severity).toBe('note');
	});

	it('parses linker errors as diagnostics without a line', () => {
		const diagnostics = parseDiagnostics('wasm-ld: error: undefined symbol: helper');

		expect(diagnostics).toEqual([
			{
				severity: 'error',
				message: 'undefined symbol: helper',
				line: 0,
				column: 0,
				source: 'wasm-ld'
			}
		]);
	});

	it('drops the "N errors generated" summary and source-quote lines', () => {
		const output = [
			"/home/user/main.c:4:9: error: expected ';'",
			'    int x = 1',
			'            ^',
			'1 error generated.'
		].join('\n');

		const diagnostics = parseDiagnostics(output);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics.at(0)?.line).toBe(4);
	});

	it('strips ANSI colour codes', () => {
		const diagnostics = parseDiagnostics(
			'/home/user/main.c:2:3: \u001b[1;31merror: \u001b[0mexpected expression'
		);

		expect(diagnostics.at(0)).toMatchObject({ severity: 'error', message: 'expected expression' });
	});

	it('returns nothing for empty output', () => {
		expect(parseDiagnostics('')).toEqual([]);
		expect(parseDiagnostics('\n\n')).toEqual([]);
	});

	it('keeps a location-less error so nothing is lost', () => {
		const diagnostics = parseDiagnostics('error: unable to open output file');

		expect(diagnostics).toEqual([
			{ severity: 'error', message: 'unable to open output file', line: 0, column: 0, source: 'compiler' }
		]);
	});
});

describe('hasBuildFailure', () => {
	it('is true only when an error is present', () => {
		expect(hasBuildFailure([])).toBe(false);
		expect(
			hasBuildFailure([{ severity: 'warning', message: 'w', line: 1, column: 1, source: 'main.c' }])
		).toBe(false);
		expect(
			hasBuildFailure([{ severity: 'error', message: 'e', line: 1, column: 1, source: 'main.c' }])
		).toBe(true);
	});
});