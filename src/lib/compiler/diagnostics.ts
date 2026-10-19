/**
 * Clang/wasm-ld diagnostic text → structured diagnostics.
 *
 * The compiler runs driver-less (`clang -cc1`), so its stderr is raw
 * diagnostics, one per line, in the classic format:
 *
 *   /home/user/main.c:4:9: error: use of undeclared identifier 'x'
 *   /home/user/main.c:4:9: note: did you mean 'y'?
 *   wasm-ld: error: undefined symbol: foo
 *
 * Clang also prints the offending source line, a caret line, and a
 * "N errors generated." summary. Those are presentation, not diagnostics —
 * CodeMirror draws its own gutter markers, so they are dropped here.
 */

import type { Diagnostic } from './types';

// eslint-disable-next-line no-control-regex -- ANSI escapes are control characters by definition
const ANSI_ESCAPE = /\u001b\[[0-9;]*[A-Za-z]/g;

/** `file:line:col: error: message` (column optional; the marker may be spaced). */
const FILE_DIAGNOSTIC =
	/^(?<file>[^\s:][^:]*):(?<line>\d+):(?:(?<column>\d+):)?\s*(?<marker>fatal error|error|warning|note|remark):\s*(?<message>.+)$/;

/** Linker style: `wasm-ld: error: undefined symbol: foo`. */
const TOOL_DIAGNOSTIC =
	/^(?<tool>[A-Za-z0-9_.-]+):\s*(?<marker>fatal error|error|warning|note):\s*(?<message>.+)$/;

const SUMMARY = /^\d+ (?:errors?|warnings?)(?: and \d+ (?:errors?|warnings?))? generated\.$/;

function toSeverity(marker: string): Diagnostic['severity'] {
	switch (marker) {
		case 'warning':
			return 'warning';
		case 'note':
		case 'remark':
			return 'note';
		default:
			return 'error';
	}
}

function baseName(file: string): string {
	const trimmed = file.trim();
	return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

/**
 * Parse compiler output into diagnostics. Never throws; unknown lines are
 * skipped, and a diagnostic without a location is still returned so nothing
 * the compiler said is silently lost.
 */
export function parseDiagnostics(raw: string): Diagnostic[] {
	if (!raw) return [];

	const clean = raw.replace(ANSI_ESCAPE, '');
	const diagnostics: Diagnostic[] = [];

	for (const line of clean.split('\n')) {
		const text = line.replace(/\r$/, '');
		if (!text.trim()) continue;
		if (SUMMARY.test(text.trim())) continue;

		const file = FILE_DIAGNOSTIC.exec(text)?.groups as
			| { file: string; line: string; column?: string; marker: string; message: string }
			| undefined;
		if (file) {
			diagnostics.push({
				severity: toSeverity(file.marker),
				message: file.message.trim(),
				line: Number.parseInt(file.line, 10),
				column: file.column ? Number.parseInt(file.column, 10) : 0,
				source: baseName(file.file)
			});
			continue;
		}

		const tool = TOOL_DIAGNOSTIC.exec(text)?.groups as
			| { tool: string; marker: string; message: string }
			| undefined;
		if (tool) {
			diagnostics.push({
				severity: toSeverity(tool.marker),
				message: tool.message.trim(),
				line: 0,
				column: 0,
				source: tool.tool
			});
			continue;
		}

		// A stray `error:` with no tool or file prefix (rare, but clang emits it
		// for driver-level problems such as a missing input file).
		const bare = /^\s*(?<marker>error|warning):\s*(?<message>.+)$/.exec(text)?.groups as
			| { marker: string; message: string }
			| undefined;
		if (bare) {
			diagnostics.push({
				severity: toSeverity(bare.marker),
				message: bare.message.trim(),
				line: 0,
				column: 0,
				source: 'compiler'
			});
		}
	}

	return diagnostics;
}

/**
 * `false` when the program compiled and linked; `true` when at least one
 * diagnostic prevents a binary from being produced.
 */
export function hasBuildFailure(diagnostics: Diagnostic[]): boolean {
	return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}