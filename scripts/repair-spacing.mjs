// One-off repair: insert a blank line after any component opening tag whose
// body was emitted as raw Markdown (mdsvex requires the blank line to parse
// component children). Reads each file whole, transforms the text, writes the
// whole file back — no stream editing, no in-place sed.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lessonsRoot = join(root, 'src', 'content', 'lessons');

let changed = 0;

function fixFile(path) {
	const source = readFileSync(path, 'utf8');
	const lines = source.split('\n');
	const out = [];
	let inFence = false;

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		out.push(line);

		if (/^```/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;

		// An opening component tag on its own line, not self-closing.
		const open = /^\s*<([A-Z][A-Za-z0-9]*)(\s[^<>]*?)?(\/?)>\s*$/.exec(line);
		if (!open || open[3] === '/') continue;

		const next = lines[i + 1];
		if (next !== undefined && next.trim() !== '') {
			// Insert exactly one blank line; the loop then continues normally.
			out.push('');
		}
	}

	const result = out.join('\n');
	if (result !== source) {
		writeFileSync(path, result, 'utf8');
		changed += 1;
	}
}

function visit(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) visit(full);
		else if (entry.name.endsWith('.mdx')) fixFile(full);
	}
}

visit(lessonsRoot);
console.log(`rewrote ${changed} lesson file(s)`);