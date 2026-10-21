// Generates src/lib/content/curriculum.ts from lesson frontmatter.
//
// The curriculum is the authoritative module ↔ lesson mapping (agents.md §6.1).
// Module-level metadata (id, slug, title, lecture title, blurb, cHeavy) is owned
// here; lesson lists are derived from whatever .mdx files actually exist on disk.
// Run with: node scripts/gen-curriculum.mjs

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lessonsRoot = join(root, 'src', 'content', 'lessons');
const outFile = join(root, 'src', 'lib', 'content', 'curriculum.ts');

/** Module-level metadata, in lecture order. Lesson lists are never stored here. */
const MODULES = [
	{
		id: 1,
		slug: '01-what-is-data',
		title: 'What Is Data?',
		lectureTitle: 'Lecture 01 — Data Representation 1',
		blurb: 'Bits, bytes, ASCII, and Unicode — how meaning gets encoded as voltage.',
		cHeavy: false
	},
	{
		id: 2,
		slug: '02-number-systems',
		title: 'Number Systems',
		lectureTitle: 'Lecture 02 — Data Representation 2',
		blurb: 'Binary, hex, two’s complement, and IEEE 754 — why 0.1 + 0.2 is not 0.3.',
		cHeavy: true
	},
	{
		id: 3,
		slug: '03-architecture-1',
		title: 'Computer Architecture I',
		lectureTitle: 'Lecture 03 — Architecture 1',
		blurb: 'The CPU, memory, buses, and registers — what actually executes your code.',
		cHeavy: false
	},
	{
		id: 4,
		slug: '04-logic',
		title: 'Logic',
		lectureTitle: 'Lecture 04 — Boolean Logic',
		blurb: 'Gates, boolean algebra, and the combinatorial circuits that do arithmetic.',
		cHeavy: true
	},
	{
		id: 5,
		slug: '05-sequential-logic',
		title: 'Sequential Logic',
		lectureTitle: 'Lecture 05 — Sequential Logic',
		blurb: 'Latches, flip-flops, and counters — how a circuit remembers anything at all.',
		cHeavy: false
	},
	{
		id: 6,
		slug: '06-memory-storage',
		title: 'Memory & Storage',
		lectureTitle: 'Lecture 06 — Memory Systems',
		blurb: 'The memory hierarchy and caches — why traversal order changes performance.',
		cHeavy: true
	},
	{
		id: 7,
		slug: '07-io',
		title: 'I/O',
		lectureTitle: 'Lecture 07 — Input & Output',
		blurb: 'Peripherals, memory-mapped I/O, interrupts, and DMA.',
		cHeavy: false
	},
	{
		id: 8,
		slug: '08-control-unit',
		title: 'Control Unit',
		lectureTitle: 'Lecture 08 — Control & Microprogramming',
		blurb: 'Hardwired versus microprogrammed control, and the fetch-decode-execute cycle.',
		cHeavy: false
	},
	{
		id: 9,
		slug: '09-architecture-2',
		title: 'Computer Architecture II',
		lectureTitle: 'Lecture 09 — Architecture 2',
		blurb: 'RISC versus CISC, ARM, and the multicore reality your C code runs on.',
		cHeavy: true
	},
	{
		id: 10,
		slug: '10-os-intro',
		title: 'Introduction to OS',
		lectureTitle: 'Lecture 10 — Operating Systems',
		blurb: 'What an operating system does, and why syscalls are the only door out.',
		cHeavy: false
	},
	{
		id: 11,
		slug: '11-processes',
		title: 'Processes',
		lectureTitle: 'Lecture 11 — Processes',
		blurb: 'Process memory layout, fork and exec, and IPC with pipes.',
		cHeavy: true
	},
	{
		id: 12,
		slug: '12-threads',
		title: 'Threads',
		lectureTitle: 'Lecture 12 — Threads',
		blurb: 'Threads versus processes, pthreads, and the concurrency models behind them.',
		cHeavy: true
	},
	{
		id: 13,
		slug: '13-scheduling',
		title: 'CPU Scheduling',
		lectureTitle: 'Lecture 13 — Scheduling',
		blurb: 'Bursts, FCFS, SJF, and round-robin — who runs next, and why.',
		cHeavy: true
	},
	{
		id: 14,
		slug: '14-synchronization',
		title: 'Synchronization',
		lectureTitle: 'Lecture 14 — Synchronization',
		blurb: 'Race conditions, mutexes, semaphores, and monitors.',
		cHeavy: true
	},
	{
		id: 15,
		slug: '15-deadlocks',
		title: 'Deadlocks',
		lectureTitle: 'Lecture 15 — Deadlocks',
		blurb: 'The four conditions, prevention, avoidance, and detection.',
		cHeavy: false
	},
	{
		id: 16,
		slug: '16-memory-management',
		title: 'Memory Management',
		lectureTitle: 'Lecture 16 — Memory Management',
		blurb: 'Contiguous allocation, paging, and what malloc and free really do.',
		cHeavy: true
	},
	{
		id: 17,
		slug: '17-virtual-memory',
		title: 'Virtual Memory',
		lectureTitle: 'Lecture 17 — Virtual Memory',
		blurb: 'Demand paging, page replacement, and the mechanics of thrashing.',
		cHeavy: true
	},
	{
		id: 18,
		slug: '18-io-and-files',
		title: 'I/O & File Systems',
		lectureTitle: 'Lecture 18 — I/O & File Systems',
		blurb: 'The I/O subsystem, file systems, and protection.',
		cHeavy: true
	},
	{
		id: 19,
		slug: '19-security',
		title: 'Security',
		lectureTitle: 'Lecture 19 — Security',
		blurb: 'Threat models, crypto basics, and buffer overflows in real C.',
		cHeavy: true
	},
	{
		id: 20,
		slug: '20-networks',
		title: 'Networks',
		lectureTitle: 'Lecture 20 — Networks',
		blurb: 'The OSI model, TCP/IP, and sockets you can write in C.',
		cHeavy: true
	},
	{
		id: 21,
		slug: '21-cloud',
		title: 'Cloud Computing',
		lectureTitle: 'Lecture 21 — Cloud',
		blurb: 'Service models and deployment models — where all of this now runs.',
		cHeavy: false
	},
	{
		id: 22,
		slug: '22-revision',
		title: 'Revision',
		lectureTitle: 'Lecture 22 — Revision',
		blurb: 'The big picture, and a cheatsheet that ties C to the machine.',
		cHeavy: false
	},
	{
		id: 23,
		slug: '23-bash',
		title: 'Bash & Scripting',
		lectureTitle: 'Supplementary — The Linux Command Line',
		blurb: 'Navigation, permissions, and the first script — the shell as the operating system’s front door.',
		cHeavy: false
	}
];

/** Strips surrounding single or double quotes from a scalar. */
function unquote(value) {
	const v = value.trim();
	if (v.length >= 2 && ((v[0] === "'" && v.at(-1) === "'") || (v[0] === '"' && v.at(-1) === '"'))) {
		return v.slice(1, -1);
	}
	return v;
}

/** Parses a `['a', 'b']` list, or `[]`. */
function parseList(value) {
	const v = value.trim();
	if (!v.startsWith('[') || !v.endsWith(']')) return [];
	const inner = v.slice(1, -1).trim();
	if (inner === '') return [];
	return inner
		.split(',')
		.map((item) => unquote(item))
		.filter((item) => item !== '');
}

/** Parses the frontmatter block of one .mdx file into a plain object. */
function parseFrontmatter(source, file) {
	if (!source.startsWith('---')) {
		throw new Error(`${file}: does not start with a --- frontmatter fence`);
	}
	const end = source.indexOf('\n---', 3);
	if (end === -1) throw new Error(`${file}: frontmatter is never closed`);

	const block = source.slice(source.indexOf('\n', 3) + 1, end + 1);
	const data = {};

	for (const rawLine of block.split('\n')) {
		const line = rawLine.trimEnd();
		if (line === '' || line.startsWith('#')) continue;
		const colon = line.indexOf(':');
		if (colon === -1) throw new Error(`${file}: unparseable frontmatter line "${line}"`);
		data[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
	}

	const required = [
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
	for (const key of required) {
		if (!(key in data)) throw new Error(`${file}: frontmatter is missing "${key}"`);
	}

	const moduleId = Number(unquote(data.module));
	if (!Number.isInteger(moduleId) || moduleId < 1 || moduleId > 23) {
		throw new Error(`${file}: module "${data.module}" is not an integer 1..23`);
	}
	const minutes = Number(unquote(data.estimatedMinutes));
	if (!Number.isInteger(minutes) || minutes <= 0) {
		throw new Error(`${file}: estimatedMinutes "${data.estimatedMinutes}" is not a positive integer`);
	}

	return {
		id: unquote(data.id),
		title: unquote(data.title),
		module: moduleId,
		lecture: unquote(data.lecture),
		slides: unquote(data.slides),
		estimatedMinutes: minutes,
		prerequisites: parseList(data.prerequisites),
		tags: parseList(data.tags),
		hasExercise: unquote(data.hasExercise) === 'true',
		hasQuiz: unquote(data.hasQuiz) === 'true'
	};
}

/** Collects every lesson on disk, grouped by module id. */
function collectLessons() {
	const byModule = new Map(MODULES.map((module) => [module.id, []]));
	if (!existsSync(lessonsRoot)) return byModule;

	for (const dir of readdirSync(lessonsRoot, { withFileTypes: true })) {
		if (!dir.isDirectory()) continue;
		const dirPath = join(lessonsRoot, dir.name);
		for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
			if (!entry.isFile() || !entry.name.endsWith('.mdx')) continue;
			const file = join(dirPath, entry.name);
			const fm = parseFrontmatter(readFileSync(file, 'utf8'), file);
			byModule.get(fm.module).push({
				slug: entry.name.slice(0, -'.mdx'.length),
				id: fm.id,
				title: fm.title,
				estimatedMinutes: fm.estimatedMinutes,
				prerequisites: fm.prerequisites,
				hasExercise: fm.hasExercise,
				hasQuiz: fm.hasQuiz
			});
		}
	}

	for (const lessons of byModule.values()) {
		lessons.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
	}
	return byModule;
}

/** Renders a string literal for the generated TypeScript. */
function quote(value) {
	return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Renders a string-array literal with inline short lists. */
function quoteList(values) {
	return `[${values.map(quote).join(', ')}]`;
}

const byModule = collectLessons();

const moduleBlocks = MODULES.map((module) => {
	const lessons = byModule.get(module.id);
	const lessonBlocks = lessons
		.map(
			(lesson) => `\t\t\t{
\t\t\t\tid: ${quote(lesson.id)},
\t\t\t\tslug: ${quote(lesson.slug)},
\t\t\t\ttitle: ${quote(lesson.title)},
\t\t\t\testimatedMinutes: ${lesson.estimatedMinutes},
\t\t\t\tprerequisites: ${quoteList(lesson.prerequisites)},
\t\t\t\thasExercise: ${lesson.hasExercise},
\t\t\t\thasQuiz: ${lesson.hasQuiz}
\t\t\t}`
		)
		.join(',\n');

	return `\t{
\t\tid: ${module.id},
\t\tslug: ${quote(module.slug)},
\t\ttitle: ${quote(module.title)},
\t\tlectureTitle: ${quote(module.lectureTitle)},
\t\tblurb: ${quote(module.blurb)},
\t\tlessons: [${lessons.length === 0 ? '' : `\n${lessonBlocks}\n\t\t`}],
\t\tcHeavy: ${module.cHeavy}
\t}`;
}).join(',\n');

const header = `import type { Module } from './types';

/**
 * The authoritative curriculum ↔ lecture mapping (agents.md §6.1).
 *
 * All 22 CST1500 lectures are represented, plus module 23 (Bash & Scripting, a
 * supplementary tooling module outside the deck), so the shell, the home grid,
 * and the progress maths are complete from day one. A module whose \`lessons\` array is
 * empty is rendered as "coming soon" rather than as an error.
 *
 * GENERATED by scripts/gen-curriculum.mjs from the frontmatter of every file in
 * src/content/lessons/. Do not edit the lesson arrays by hand — edit the MDX
 * frontmatter or the MODULES table in the generator, then re-run it.
 */
export const modules: Module[] = [
${moduleBlocks}
];
`;

const footer = `
/** Looks up a module by its numeric lecture id. */
export function findModule(id: number): Module | undefined {
	return modules.find((module) => module.id === id);
}

/** Looks up a module by its slug. */
export function findModuleBySlug(slug: string): Module | undefined {
	return modules.find((module) => module.slug === slug);
}

/** Finds the module that owns a lesson slug. */
export function findModuleForLesson(lessonSlug: string): Module | undefined {
	return modules.find((module) => module.lessons.some((lesson) => lesson.slug === lessonSlug));
}

/** True when a module has at least one authored lesson. */
export function isModuleAvailable(module: Module): boolean {
	return module.lessons.length > 0;
}
`;

writeFileSync(outFile, header + footer, 'utf8');

let total = 0;
for (const module of MODULES) {
	const count = byModule.get(module.id).length;
	total += count;
	if (count > 0) console.log(`  module ${String(module.id).padStart(2, '0')}  ${count} lesson(s)`);
}
console.log(`\nWrote ${outFile}`);
console.log(`${total} lesson(s) across ${MODULES.filter((m) => byModule.get(m.id).length > 0).length}/${MODULES.length} modules`);