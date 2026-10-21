// Compiles every ```c fence in the lessons and compares real stdout with the
// "Expected output" block that follows it.
//
// Lessons claim their output was captured from a real run. This script is the
// only thing that keeps that claim true as content is edited. A fence that is
// deliberately not runnable (needs a live peer, is unsafe) opts out with a
// comment on its first line:
//
//   ```c notrun
//
// Everything else must compile with -std=c11 -Wall -Wextra, with zero warnings,
// and — when the lesson shows an expected-output block — produce that output.
//
// Usage: node scripts/verify-lessons.mjs [--verbose]

import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lessonsRoot = join(root, 'src', 'content', 'lessons');
const verbose = process.argv.includes('--verbose');

const work = mkdtempSync(join(tmpdir(), 'sp-verify-'));

let files = 0;
let fences = 0;
let runnable = 0;
let skipped = 0;
let compiled = 0;
const failures = [];

/** Collects .mdx paths in a stable order. */
function collect(dir, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) collect(full, out);
		else if (entry.name.endsWith('.mdx')) out.push(full);
	}
	return out;
}

/**
 * Extracts C fences with the "Expected output" text that follows, if any.
 * Only fenced blocks with the `c` info string are considered.
 */
function extractFences(body) {
	const lines = body.split('\n');
	const found = [];
	let i = 0;

	while (i < lines.length) {
		const opening = /^```(c|C)(\s+.*)?$/.exec(lines[i]);
		if (!opening) {
			i += 1;
			continue;
		}

		const info = (opening[2] ?? '').trim();
		const startLine = i + 1;
		const code = [];
		i += 1;
		while (i < lines.length && !/^```\s*$/.test(lines[i])) {
			code.push(lines[i]);
			i += 1;
		}
		i += 1; // closing fence

		// Look ahead for an "Expected output" heading and its fenced block.
		let expected = null;
		for (let j = i; j < Math.min(i + 12, lines.length); j += 1) {
			if (/^#{1,6}\s*Expected output/i.test(lines[j]) || /^\*\*Expected output/i.test(lines[j])) {
				let k = j + 1;
				while (k < lines.length && lines[k].trim() === '') k += 1;
				const fence = /^```/.exec(lines[k] ?? '');
				if (fence) {
					const out = [];
					k += 1;
					while (k < lines.length && !/^```\s*$/.test(lines[k])) {
						out.push(lines[k]);
						k += 1;
					}
					expected = out.join('\n');
				}
				break;
			}
			// Stop if another code fence or heading intervenes.
			if (/^#{1,6}\s/.test(lines[j]) || /^```/.test(lines[j])) break;
		}

		found.push({ code: code.join('\n'), startLine, info, expected });
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

for (const path of collect(lessonsRoot)) {
	const relative = path.slice(root.length + 1);
	const source = readFileSync(path, 'utf8');
	files += 1;

	// Body only — frontmatter is not Markdown.
	const body = source.replace(/^---\n[\s\S]*?\n---\n/, '');

	for (const fence of extractFences(body)) {
		fences += 1;

		if (/\bnotrun\b/.test(fence.info)) {
			skipped += 1;
			continue;
		}

		// A fence that is not a complete program cannot be run standalone.
		if (!/\bmain\s*\(/.test(fence.code)) {
			skipped += 1;
			if (verbose) console.log(`skip (fragment)  ${relative}:${fence.startLine}`);
			continue;
		}

		runnable += 1;
		const stem = `${basename(path, '.mdx')}-${fence.startLine}`;
		const cFile = join(work, `${stem}.c`);
		const binFile = join(work, stem);
		writeFileSync(cFile, fence.code, 'utf8');

		let compileErr = null;
		try {
			execFileSync('/usr/bin/gcc', ['-std=c11', '-Wall', '-Wextra', '-o', binFile, cFile], {
				stdio: ['ignore', 'pipe', 'pipe'],
				timeout: 30000
			});
		} catch (error) {
			compileErr = (error.stderr?.toString() || error.message || '').trim();
		}

		if (compileErr) {
			failures.push({ relative, line: fence.startLine, kind: 'compile', detail: compileErr });
			continue;
		}
		compiled += 1;

		if (fence.expected === null) {
			if (verbose) console.log(`ok (no expected) ${relative}:${fence.startLine}`);
			continue;
		}

		let stdout = '';
		let runErr = null;
		try {
			stdout = execFileSync(binFile, [], {
				stdio: ['ignore', 'pipe', 'pipe'],
				timeout: 5000,
				input: ''
			}).toString();
		} catch (error) {
			// A non-zero exit is legitimate; keep whatever it printed.
			stdout = error.stdout?.toString() ?? '';
			if (typeof error.status !== 'number') runErr = String(error.message);
		}

		if (runErr) {
			failures.push({ relative, line: fence.startLine, kind: 'run', detail: runErr });
			continue;
		}

		const got = normalise(stdout);
		const want = normalise(fence.expected);
		if (got !== want) {
			failures.push({
				relative,
				line: fence.startLine,
				kind: 'output',
				detail: `--- expected ---\n${want}\n--- actual ---\n${got}`
			});
		} else if (verbose) {
			console.log(`ok               ${relative}:${fence.startLine}`);
		}
	}
}

rmSync(work, { recursive: true, force: true });

console.log(
	`${files} lesson file(s), ${fences} C fence(s): ${runnable} runnable, ${skipped} skipped (fragment/notrun)`
);
console.log(`${compiled}/${runnable} compiled clean with -std=c11 -Wall -Wextra`);

if (failures.length > 0) {
	console.log(`\n${failures.length} failure(s):\n`);
	for (const failure of failures) {
		console.log(`[${failure.kind}] ${failure.relative}:${failure.line}`);
		console.log(indent(failure.detail));
		console.log('');
	}
	process.exit(1);
}

console.log('all runnable programs compile clean and match their expected output');

function indent(text) {
	return text
		.split('\n')
		.map((line) => `    ${line}`)
		.join('\n');
}