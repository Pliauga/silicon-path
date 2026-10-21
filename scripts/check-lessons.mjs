// Validates every lesson .mdx file before it reaches the build.
//
// MDX is not Markdown: `{...}` in prose is a Svelte expression and `<` starts a
// tag. Both fail in ways the build does not always catch — `{0, 1}` compiles
// and silently renders "1", while `<` throws at compile time. This script
// reports those, plus the frontmatter contract from agents.md §4.1.
//
// Read-only: it never rewrites a file. Run with: node scripts/check-lessons.mjs

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lessonsRoot = join(root, 'src', 'content', 'lessons');

const REQUIRED = [
	'id',
	'title',
	'module',
	'lecture',
	'slides',
	'estimatedMinutes',
	'prerequisites',
	'tags',
	'hasExercise',
	'hasQuiz'
];

/**
 * HTML elements Svelte accepts verbatim in markup. Any other `<word` in prose
 * is a mistake: Svelte tries to parse it as a component and throws.
 */
const SAFE_HTML = new Set(
	'div span p a em strong b i u s small sub sup code pre br hr img ul ol li dl dt dd blockquote q cite abbr time mark kbd samp var figure figcaption table thead tbody tfoot tr th td caption details summary section article aside header footer nav main picture source audio video track figure label button input select option optgroup textarea fieldset legend form h1 h2 h3 h4 h5 h6'
		.split(' ')
		.flatMap((name) => [name, `${name}`])
);

const problems = [];
const warnings = [];

/** Cross-file uniqueness: slugs become routes, ids become content keys. */
const seenIds = new Map();
const seenSlugs = new Map();

function fail(file, message) {
	problems.push({ file, message });
}

function warn(file, message) {
	warnings.push({ file, message });
}

/** Splits frontmatter from body. Returns null when the file has no fence. */
function splitFrontmatter(source) {
	if (!source.startsWith('---')) return null;
	const end = source.indexOf('\n---', 3);
	if (end === -1) return null;
	const raw = source.slice(source.indexOf('\n', 3) + 1, end + 1);
	return { raw, body: source.slice(source.indexOf('\n', end + 4) + 1) };
}

/** Parses simple `key: value` frontmatter lines. */
function parseFrontmatter(raw) {
	const data = {};
	for (const line of raw.split('\n')) {
		if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
		const colon = line.indexOf(':');
		if (colon === -1) continue;
		data[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
	}
	return data;
}

/**
 * Blanks out regions where `{` and `<` are legitimate: `<script>` blocks,
 * fenced code blocks, inline code spans, and component tags (including
 * multi-line attribute lists). Done with a small scanner rather than one
 * regex because a regex cannot tell a `>` inside a string prop from the end
 * of a tag.
 */
function blankSafeRegions(body) {
	const chars = body.split('');
	const blankRange = (from, to) => {
		for (let i = from; i < to; i += 1) {
			if (chars[i] !== '\n') chars[i] = ' ';
		}
	};

	let i = 0;
	while (i < chars.length) {
		// <script> ... </script> — the whole block is Svelte, not prose.
		if (body.startsWith('<script', i)) {
			const end = body.indexOf('</script>', i);
			const stop = end === -1 ? body.length : end + '</script>'.length;
			blankRange(i, stop);
			i = stop;
			continue;
		}

		// Fenced code block: a line starting with ``` toggles it.
		if (body.startsWith('```', i) && (i === 0 || body[i - 1] === '\n')) {
			const lineEnd = body.indexOf('\n', i);
			let cursor = lineEnd === -1 ? body.length : lineEnd + 1;
			let closed = false;
			while (cursor < chars.length) {
				if (body.startsWith('```', cursor) && (cursor === 0 || body[cursor - 1] === '\n')) {
					const close = body.indexOf('\n', cursor);
					cursor = close === -1 ? body.length : close;
					closed = true;
					break;
				}
				cursor += 1;
			}
			blankRange(i, closed ? cursor : body.length);
			i = closed ? cursor : body.length;
			continue;
		}

		// Inline code span: `...` on a single line.
		if (chars[i] === '`') {
			const close = body.indexOf('`', i + 1);
			const newline = body.indexOf('\n', i + 1);
			if (close !== -1 && (newline === -1 || close < newline)) {
				blankRange(i, close + 1);
				i = close + 1;
				continue;
			}
		}

		// Component tag, possibly spanning lines: <Name ... /> or <Name ...>.
		// Closing tags (</Name>) are blanked by the same branch. Plain HTML
		// elements are blanked too, so that after this function has run, any
		// leftover `<` in the text is genuinely prose and therefore an error.
		const isClosingTag = chars[i] === '<' && body[i + 1] === '/';
		const isOpeningTag = chars[i] === '<' && /[A-Za-z]/.test(body[i + 1] ?? '');
		const tagName = isOpeningTag
			? (body.slice(i + 1).match(/^[A-Za-z][A-Za-z0-9-]*/) ?? [''])[0]
			: isClosingTag
				? (body.slice(i + 2).match(/^[A-Za-z][A-Za-z0-9-]*/) ?? [''])[0]
				: '';
		const isComponent = tagName !== '' && /^[A-Z]/.test(tagName);
		const isKnownHtml = tagName !== '' && SAFE_HTML.has(tagName.toLowerCase());

		if (isComponent || isKnownHtml) {
			let cursor = i + 1;
			let quote = null;
			while (cursor < chars.length) {
				const ch = body[cursor];
				if (quote) {
					if (ch === quote) quote = null;
				} else if (ch === '"' || ch === "'") {
					quote = ch;
				} else if (ch === '{') {
					// Attribute expression: skip to its matching brace.
					let depth = 1;
					cursor += 1;
					while (cursor < chars.length && depth > 0) {
						if (body[cursor] === '{') depth += 1;
						else if (body[cursor] === '}') depth -= 1;
						cursor += 1;
					}
					continue;
				} else if (ch === '>') {
					cursor += 1;
					break;
				}
				cursor += 1;
			}
			blankRange(i, cursor);
			i = cursor;
			continue;
		}

		i += 1;
	}

	return chars.join('');
}

/** Reports prose that MDX will read as a Svelte expression or a bad tag. */
function checkProseHazards(file, body) {
	const safe = blankSafeRegions(body);
	const safeLines = safe.split('\n');
	const originalLines = body.split('\n');

	safeLines.forEach((line, index) => {
		const lineNumber = originalLines[index] ?? '';

		for (const brace of ['{', '}']) {
			if (!line.includes(brace)) continue;
			const column = line.indexOf(brace) + 1;
			fail(
				file,
				`line ${index + 1}, col ${column}: bare "${brace}" in prose — MDX treats {…} as a Svelte expression and will silently render the wrong text or throw. Use &#123;/&#125; or put it in backticks. Context: ${lineNumber.trim().slice(0, 80)}`
			);
		}

		// Every legitimate tag has been blanked above, so any surviving `<` is
		// prose — and Svelte reads it as the start of a tag. This catches the
		// space-separated form too ("a < b"), which a tag-name regex misses but
		// the compiler rejects just the same.
		for (const match of line.matchAll(/</g)) {
			const after = line.slice(match.index + 1, match.index + 12).trimStart();
			fail(
				file,
				`line ${index + 1}, col ${match.index + 1}: "<" in prose is read as a tag start — Svelte fails with "Expected a valid element or component name". Write &lt; or put the comparison in backticks. Context: ${lineNumber.trim().slice(0, 80)}`
			);
			if (after === '') break;
		}
	});
}

/**
 * Reports component blocks whose children stayed raw Markdown.
 *
 * mdsvex only parses the body of a component block when the opening tag is
 * followed by a blank line. Without it, the block is emitted as literal text
 * inside a Svelte element, where backticks are inert and any `<` starts a tag:
 *
 *   <TheoryBlock label="x">
 *   `x << 3` compiles.        ← emitted raw; build fails on the `<<`
 *   </TheoryBlock>
 *
 * Adding a blank line after the opening tag fixes it. Verified against
 * mdsvex directly: "no blank after open" breaks, "blank after open" compiles.
 */
function checkComponentBodySpacing(file, body) {
	const lines = body.split('\n');
	const stack = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];

		const close = /^\s*<\/([A-Z][A-Za-z0-9]*)\s*>\s*$/.exec(line);
		if (close) {
			stack.pop();
			continue;
		}

		const open = /<([A-Z][A-Za-z0-9]*)(\s[^<>]*?)?(\/?)>\s*$/.exec(line);
		if (!open) continue;
		if (open[3] === '/') continue; // self-closing, nothing to parse

		stack.push(open[1]);
		const next = lines[index + 1];
		// A lone Svelte child (e.g. <LazyStudy>\n\t<CPUExplodedView />\n</LazyStudy>)
		// carries no Markdown, so mdsvex's blank-line rule does not apply to it.
		if (next !== undefined && /^\s*<[A-Z][A-Za-z0-9]*(\s[^<>]*)?\/>\s*$/.test(next)) continue;
		if (next !== undefined && next.trim() !== '') {
			fail(
				file,
				`line ${index + 1}: <${open[1]}> opens and the next line is not blank — mdsvex will not parse the body as Markdown, so backticks stay literal and any "<" in it breaks the build. Insert a blank line after the tag. Next line: ${next.trim().slice(0, 70)}`
			);
		}
	}
}

/**
 * Reports `{` / `}` inside a quoted attribute value.
 *
 * Svelte interpolates braces inside attribute strings, so
 *   question="the loop is `while (x) { }`"
 * is parsed as an expression containing nothing — "Unexpected token", and the
 * build dies. Character references (`&#123;` / `&#125;`) render as the right
 * glyphs and are never re-parsed. Verified against the real compiler: raw
 * braces break, entities compile.
 *
 * Attribute lists routinely span several lines, so this tracks "inside a tag"
 * across line boundaries rather than judging each line alone.
 */
function checkAttributeBraces(file, body) {
	const lines = body.split('\n');
	let inFence = false;
	// True between a component tag's `<Name` and its closing `>`.
	let inTag = false;

	lines.forEach((line, index) => {
		if (/^```/.test(line)) {
			inFence = !inFence;
			return;
		}
		if (inFence) return;

		let cursor = 0;
		while (cursor < line.length) {
			if (!inTag) {
				const open = line.indexOf('<', cursor);
				if (open === -1) break;
				const after = line[open + 1] ?? '';
				if (!/[A-Za-z]/.test(after)) {
					cursor = open + 1;
					continue;
				}
				inTag = true;
				cursor = open + 1;
				continue;
			}

			// Inside a tag: report braces in quoted values, stop at `>`.
			const quoteStart = line.indexOf('"', cursor);
			const tagEnd = line.indexOf('>', cursor);

			if (tagEnd !== -1 && (quoteStart === -1 || tagEnd < quoteStart)) {
				inTag = false;
				cursor = tagEnd + 1;
				continue;
			}
			if (quoteStart === -1) break;

			const quoteEnd = line.indexOf('"', quoteStart + 1);
			if (quoteEnd === -1) break;

			const value = line.slice(quoteStart + 1, quoteEnd);
			const braceIndex = value.search(/[{}]/);
			if (braceIndex !== -1) {
				fail(
					file,
					`line ${index + 1}: "${value[braceIndex]}" inside a quoted attribute is interpolated by Svelte and breaks the build with "Unexpected token". Use &#123;/&#125; instead. Attribute: ${value.slice(0, 80)}`
				);
			}
			cursor = quoteEnd + 1;
		}
	});
}
function checkImports(file, body) {
	const used = new Set();
	for (const match of body.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) used.add(match[1]);

	const imported = new Set();
	// import X from '...'
	for (const match of body.matchAll(/import\s+([A-Z][A-Za-z0-9]*)\s+from/g)) imported.add(match[1]);
	// import { A, B } from '...'
	for (const match of body.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
		for (const part of match[1].split(',')) {
			const name = part.trim().split(/\s+as\s+/).pop()?.trim();
			if (name) imported.add(name);
		}
	}

	for (const component of used) {
		if (!imported.has(component)) {
			fail(file, `<${component}> is used but never imported — it will render blank. Add it to the <script> block.`);
		}
	}
}

/** Reports C programs copied into the lesson without an expected output. */
function checkOutputBlocks(file, body) {
	const cFences = [...body.matchAll(/^```c[ \t]*$/gm)].length;
	const expected = /Expected output/i.test(body);
	if (cFences > 0 && !expected) {
		warn(file, `${cFences} C program(s) but no "Expected output" block.`);
	}
}

function visit(dir) {
	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			visit(full);
			continue;
		}
		if (!entry.name.endsWith('.mdx')) continue;

		const file = relative(root, full);
		const source = readFileSync(full, 'utf8');

		const split = splitFrontmatter(source);
		if (!split) {
			fail(file, 'missing or unclosed --- frontmatter fence');
			continue;
		}

		const data = parseFrontmatter(split.raw);
		for (const key of REQUIRED) {
			if (!(key in data)) fail(file, `frontmatter is missing "${key}"`);
		}

		const moduleId = Number((data.module ?? '').replace(/['"]/g, ''));
		if (!Number.isInteger(moduleId) || moduleId < 1 || moduleId > 23) {
			fail(file, `frontmatter module "${data.module}" is not 1..23`);
		}

		const minutes = Number((data.estimatedMinutes ?? '').replace(/['"]/g, ''));
		if (!Number.isInteger(minutes) || minutes <= 0) {
			fail(file, `frontmatter estimatedMinutes "${data.estimatedMinutes}" is not a positive integer`);
		}

		// The route slug is the file name, so two lessons anywhere in the tree
		// cannot share one — the loader keys lessons by slug and would silently
		// drop the second. The frontmatter `id` is a separate, human-facing key
		// and must at least carry its module's zero-padded prefix.
		const slug = entry.name.slice(0, -'.mdx'.length);
		const actualId = (data.id ?? '').replace(/['"]/g, '');
		if (moduleId >= 1 && moduleId <= 23) {
			const prefix = String(moduleId).padStart(2, '0');
			if (!actualId.startsWith(`${prefix}-`)) {
				fail(file, `frontmatter id "${actualId}" should start with "${prefix}-" (module ${moduleId})`);
			}
		}
		if (seenIds.has(actualId)) {
			fail(file, `frontmatter id "${actualId}" is already used by ${seenIds.get(actualId)}`);
		} else {
			seenIds.set(actualId, file);
		}
		if (seenSlugs.has(slug)) {
			fail(file, `route slug "${slug}" is already used by ${seenSlugs.get(slug)} — one would shadow the other`);
		} else {
			seenSlugs.set(slug, file);
		}

		checkProseHazards(file, split.body);
		checkComponentBodySpacing(file, split.body);
		checkAttributeBraces(file, split.body);
		checkImports(file, split.body);
		checkOutputBlocks(file, split.body);
	}
}

if (!existsSync(lessonsRoot)) {
	console.log('No lessons directory — nothing to check.');
	process.exit(0);
}

visit(lessonsRoot);

const fileCount = (() => {
	let count = 0;
	const walk = (dir) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) walk(join(dir, entry.name));
			else if (entry.name.endsWith('.mdx')) count += 1;
		}
	};
	walk(lessonsRoot);
	return count;
})();

for (const { file, message } of problems) console.log(`ERROR ${file}\n      ${message}`);
for (const { file, message } of warnings) console.log(`WARN  ${file}\n      ${message}`);

console.log(
	`\n${fileCount} lesson file(s): ${problems.length} error(s), ${warnings.length} warning(s)`
);

process.exit(problems.length > 0 ? 1 : 0);