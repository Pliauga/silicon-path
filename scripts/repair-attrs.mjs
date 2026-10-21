// One-off repair: rewrite JSX-style template-literal attributes as ordinary
// quoted attributes, flattened onto a single line.
//
// Authors wrote  starter={`#include <stdio.h>\n…`}  which is valid JSX but not
// valid here. Two independent problems, both confirmed against mdsvex:
//
//  1. mdsvex parses Markdown *before* Svelte, so the backticks of a template
//     literal are read as an inline code span and the tag collapses.
//  2. Once quoted, a raw newline is tolerated but a BLANK line inside the value
//     ends the paragraph and truncates the attribute ("Unexpected end of
//     input"). C starter code is full of blank lines.
//
// So the value is escaped and flattened: newline becomes `&#10;`, which renders
// as a real line break and is invisible to the Markdown parser. Whole-file
// read, whole-file write — no stream editing.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lessonsRoot = join(root, 'src', 'content', 'lessons');

/** Escapes text for a single-line double-quoted attribute value. */
function escapeAttr(value) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/\{/g, '&#123;')
		.replace(/\}/g, '&#125;')
		.replace(/\r\n|\n|\r/g, '&#10;');
}

// Matches  name={` … `}  where the body may contain anything but an unescaped
// backtick. The leading name token keeps prose from matching.
const PATTERN = /(\s[A-Za-z_][\w-]*)=\{`((?:[^`\\]|\\.)*)`\}/g;

let filesChanged = 0;
let attrsChanged = 0;

function fixFile(path) {
	const source = readFileSync(path, 'utf8');

	const result = source.replace(PATTERN, (whole, prefix, body) => {
		// Undo JS escape sequences that a template literal would have
		// interpreted, so the rendered text matches what the author meant.
		const unescaped = body
			.replace(/\\n/g, '\n')
			.replace(/\\t/g, '\t')
			.replace(/\\`/g, '`')
			.replace(/\\\\/g, '\\');

		attrsChanged += 1;
		return `${prefix}="${escapeAttr(unescaped)}"`;
	});

	if (result !== source) {
		writeFileSync(path, result, 'utf8');
		filesChanged += 1;
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
console.log(`rewrote ${attrsChanged} attribute(s) across ${filesChanged} file(s)`);