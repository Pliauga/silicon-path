// Compiles every C Handbook exercise solution and compares its stdout with the
// exercise's expectedStdout, when one is declared.
//
// Exercise programs live in TypeScript modules as template literals (so blank
// lines and multi-line starter code survive editing). That format is simple
// enough to parse without running the app: every `solution` and
// `expectedStdout` value is one backtick-delimited literal with C escapes
// written as doubled backslashes. This script turns each pair back into real C
// and real output, then asks the host compiler to prove the claim.
//
// Usage: node scripts/verify-handbook.mjs [--verbose]

import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exercisesDir = join(root, 'src', 'lib', 'content', 'handbook', 'exercises');
const verbose = process.argv.includes('--verbose');

const work = mkdtempSync(join(tmpdir(), 'sp-handbook-'));

let files = 0;
let solutions = 0;
let compared = 0;
let compiled = 0;
const failures = [];

/** Unescapes the JavaScript string literal body used for C source. */
function unescapeC(body) {
	return body.replace(/\\(.)/g, (_, ch) => {
		if (ch === 'n') return '\n';
		if (ch === 't') return '\t';
		if (ch === '"') return '"';
		if (ch === '\\') return '\\';
		return `\\${ch}`;
	});
}

/**
 * Extracts `solution: \`…\`` and the neighbouring `expectedStdout: \`…\`` from
 * each exported object. Values are single-line-delimited template literals.
 */
function extractExercises(source) {
	const found = [];
	for (const chunk of source.split(/export const /).slice(1)) {
		const solution = /\bsolution:\s*`([\s\S]*?)`/.exec(chunk);
		if (!solution) continue;
		const id = /\bid:\s*'([^']+)'/.exec(chunk);
		const expected = /\bexpectedStdout:\s*`([\s\S]*?)`/.exec(chunk);
		found.push({
			id: id ? id[1] : 'unknown',
			solution: unescapeC(solution[1]),
			expected: expected ? unescapeC(expected[1]) : null
		});
	}
	return found;
}

/** Normalises trailing whitespace so comparison is about content, not spacing. */
function normalise(text) {
	return text
		.replace(/\r\n/g, '\n')
		.split('\n')
		.map((line) => line.trimEnd())
		.join('\n')
		.trim();
}

for (const file of readdirSync(exercisesDir).filter((name) => name.endsWith('.ts')).sort()) {
	files += 1;
	const source = readFileSync(join(exercisesDir, file), 'utf8');

	for (const exercise of extractExercises(source)) {
		solutions += 1;
		const stem = `${basename(file, '.ts')}-${exercise.id}`;
		const cFile = join(work, `${stem}.c`);
		const binFile = join(work, stem);
		writeFileSync(cFile, exercise.solution, 'utf8');

		try {
			execFileSync('/usr/bin/gcc', ['-std=c11', '-Wall', '-Wextra', '-o', binFile, cFile], {
				stdio: ['ignore', 'pipe', 'pipe']
			});
			compiled += 1;
		} catch (error) {
			failures.push(`${exercise.id}: does not compile\n${error.stderr?.toString() ?? error.message}`);
			continue;
		}

		if (!exercise.expected) {
			if (verbose) console.log(`compiled (no expected output)  ${exercise.id}`);
			continue;
		}

		let actual = '';
		try {
			actual = execFileSync(binFile, [], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
		} catch (error) {
			failures.push(`${exercise.id}: exited non-zero\n${error.stderr?.toString() ?? error.message}`);
			continue;
		}

		compared += 1;
		if (normalise(actual) !== normalise(exercise.expected)) {
			failures.push(
				`${exercise.id}: stdout mismatch\n--- expected ---\n${normalise(exercise.expected)}\n--- actual ---\n${normalise(actual)}`
			);
			continue;
		}

		if (verbose) console.log(`ok  ${exercise.id}`);
	}
}

rmSync(work, { recursive: true, force: true });

console.log(
	`${files} exercise modules · ${solutions} solutions · ${compiled} compiled · ${compared} compared · ${failures.length} failures`
);
for (const failure of failures) {
	console.error(`\n${failure}`);
}
process.exit(failures.length === 0 ? 0 : 1);