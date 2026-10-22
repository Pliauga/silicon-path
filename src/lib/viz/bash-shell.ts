/**
 * The virtual filesystem and command interpreter behind `<BashTerminal />`.
 *
 * This is not a shell. It is a *state machine that behaves like one* for the
 * eight commands a CST1500 student needs on day one: `ls`, `cd`, `pwd`,
 * `mkdir`, `cat`, `echo`, `chmod`, and running a script. The single-user
 * permission model is real enough to teach: `chmod +x` is required to run
 * `./script.sh`, `cd` needs execute on the directory, `cat` needs read, and
 * `>` needs write. Nothing is canned — the same rules run every time.
 *
 * The module is deliberately free of Svelte and the DOM so the permission
 * matrix and the script runner can be unit-tested without a browser.
 */

export interface BashFile {
	kind: 'file';
	name: string;
	/** Permission bits, e.g. 0o644. Only the owner (user) class is enforced. */
	mode: number;
	content: string;
}

export interface BashDir {
	kind: 'dir';
	name: string;
	mode: number;
	children: Record<string, BashNode>;
}

export type BashNode = BashFile | BashDir;

export interface ShellState {
	root: BashDir;
	/** Absolute segments, e.g. ['home', 'student', 'lab']. */
	cwd: string[];
	/** `$HOME` as segments, so `~` can be expanded. */
	home: string[];
	/** Shell variables set by the student, merged over the built-in env. */
	vars: Record<string, string>;
}

export type OutputKind = 'stdout' | 'stderr' | 'info' | 'command';

export interface OutputLine {
	text: string;
	kind: OutputKind;
}

export interface CommandResult {
	state: ShellState;
	lines: OutputLine[];
	/** The component clears its scrollback; the state survives. */
	clear: boolean;
}

/** The user class of the mode: r=4, w=2, x=1. */
function canRead(node: BashNode): boolean {
	return (node.mode & 0o400) !== 0;
}

function canWrite(node: BashNode): boolean {
	return (node.mode & 0o200) !== 0;
}

function canExec(node: BashNode): boolean {
	return (node.mode & 0o100) !== 0;
}

/** `0o755` → `rwxr-xr-x`. */
export function formatMode(node: BashNode): string {
	const bits = ['400', '200', '100', '040', '020', '010', '004', '002', '001'] as const;
	const letters = ['r', 'w', 'x', 'r', 'w', 'x', 'r', 'w', 'x'] as const;
	const body = bits.map((bit, index) => ((node.mode & Number.parseInt(bit, 8)) !== 0 ? letters[index] : '-')).join('');
	return (node.kind === 'dir' ? 'd' : '-') + body;
}

function cloneNode(node: BashNode): BashNode {
	if (node.kind === 'file') return { ...node };
	const children: Record<string, BashNode> = {};
	for (const [name, child] of Object.entries(node.children)) children[name] = cloneNode(child);
	return { ...node, children };
}

function cloneRoot(root: BashDir): BashDir {
	return cloneNode(root) as BashDir;
}

function file(name: string, mode: number, content: string): BashFile {
	return { kind: 'file', name, mode, content };
}

function dir(name: string, mode: number, children: Record<string, BashNode>): BashDir {
	return { kind: 'dir', name, mode, children };
}

/**
 * The practice filesystem. It is small on purpose: three commands should be
 * enough to reach everything, and `ls` should never scroll.
 */
export function createShell(): ShellState {
	const homeDir = dir('student', 0o755, {
		'notes.txt': file(
			'notes.txt',
			0o644,
			'CST1500 — week 2\n\nbitwise   a & b masks bits\nlogical   a && b branches on truth\npointer   &x is an address, *p is the value there\n'
		),
		'greet.sh': file(
			'greet.sh',
			0o644,
			'#!/bin/bash\n# A first script: it is readable, but still not executable.\nname="world"\necho "hello, $name"\necho "you are $USER"\n'
		),
		'loop.sh': file(
			'loop.sh',
			0o644,
			'#!/bin/bash\nfor day in mon tue wed; do\n  echo "practise $day"\ndone\n'
		),
		lab: dir('lab', 0o755, {
			'data.txt': file('data.txt', 0o644, '10 11 12\n')
		}),
		reports: dir('reports', 0o755, {})
	});

	const root = dir('', 0o755, {
		home: dir('home', 0o755, { student: homeDir }),
		tmp: dir('tmp', 0o1777, {})
	});

	return {
		root,
		cwd: ['home', 'student'],
		home: ['home', 'student'],
		vars: {
			HOME: '/home/student',
			USER: 'student',
			SHELL: '/bin/bash'
		}
	};
}

/** The prompt's path: `~`, `~/lab`, or an absolute path outside home. */
export function promptPath(state: ShellState): string {
	const { cwd, home } = state;
	const inHome = home.every((segment, index) => cwd[index] === segment);
	if (inHome) return cwd.length === home.length ? '~' : `~/${cwd.slice(home.length).join('/')}`;
	return `/${cwd.join('/')}`;
}

/** Absolute path for display in output. */
export function absolutePath(state: ShellState): string {
	return `/${state.cwd.join('/')}`;
}

function lookup(root: BashDir, segments: string[]): BashNode | undefined {
	let node: BashNode = root;
	for (const segment of segments) {
		if (node.kind !== 'dir') return undefined;
		const next: BashNode | undefined = node.children[segment];
		if (!next) return undefined;
		node = next;
	}
	return node;
}

function parentOf(root: BashDir, segments: string[]): BashDir | undefined {
	const parent = lookup(root, segments.slice(0, -1));
	return parent?.kind === 'dir' ? parent : undefined;
}

/**
 * Resolve a user-typed path against the cwd. Returns absolute segments, or an
 * error message when `~user` (unsupported) is used.
 */
export function resolvePath(state: ShellState, input: string): string[] | { error: string } {
	let rest = input;
	let base: string[] = state.cwd;
	if (rest === '~' || rest.startsWith('~/')) {
		base = state.home;
		rest = rest.slice(1);
		if (rest.startsWith('/')) rest = rest.slice(1);
	} else if (rest.startsWith('/')) {
		base = [];
		rest = rest.slice(1);
	}
	const parts = rest === '' ? [] : rest.split('/');
	const out = [...base];
	for (const part of parts) {
		if (part === '' || part === '.') continue;
		if (part === '..') {
			out.pop();
			continue;
		}
		out.push(part);
	}
	return out;
}

/** Split a command line into words, honouring single and double quotes. */
export function tokenize(line: string): string[] {
	const tokens: string[] = [];
	let current = '';
	let quote: '"' | "'" | null = null;
	let hasWord = false;
	for (const char of line) {
		if (quote) {
			if (char === quote) quote = null;
			else current += char;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			hasWord = true;
			continue;
		}
		if (char === ' ' || char === '\t') {
			if (hasWord) {
				tokens.push(current);
				current = '';
				hasWord = false;
			}
			continue;
		}
		current += char;
		hasWord = true;
	}
	if (hasWord) tokens.push(current);
	return tokens;
}

/** Expand `$NAME` and `${NAME}` using the shell's variables. */
export function expandVars(text: string, vars: Record<string, string>): string {
	return text
		.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => vars[name] ?? '')
		.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => vars[name] ?? '');
}

function displayArg(state: ShellState, segments: string[]): string {
	const { home } = state;
	const inHome = home.every((segment, index) => segments[index] === segment);
	if (inHome) return segments.length === home.length ? '~' : `~/${segments.slice(home.length).join('/')}`;
	return `/${segments.join('/')}`;
}

function error(text: string): OutputLine {
	return { text, kind: 'stderr' };
}

function out(text: string): OutputLine {
	return { text, kind: 'stdout' };
}

function isPathToken(token: string | undefined): token is string {
	return typeof token === 'string' && token !== '';
}

/**
 * `chmod` mode parsing: `755` replaces the bits and `+x`, `u+x`, `a=rw`, `go-r`
 * adjust them, exactly like the real tool.
 */
export function applyMode(current: number, mode: string): number | null {
	if (/^[0-7]{1,4}$/.test(mode)) return Number.parseInt(mode, 8);
	const match = /^([ugoa]*)([+\-=])([rwx]*)$/.exec(mode);
	if (!match) return null;
	const [, whoRaw = '', op = '', perms = ''] = match;
	const whoMask =
		whoRaw === '' || whoRaw.includes('a')
			? 0o777
			: (whoRaw.includes('u') ? 0o700 : 0) |
				(whoRaw.includes('g') ? 0o070 : 0) |
				(whoRaw.includes('o') ? 0o007 : 0);
	let bits = 0;
	for (const perm of perms) bits |= perm === 'r' ? 0o444 : perm === 'w' ? 0o222 : 0o111;
	const masked = bits & whoMask;
	if (op === '+') return current | masked;
	if (op === '-') return current & ~masked;
	return (current & ~whoMask) | masked;
}

/**
 * Run a minimal Bash script: variables, `echo`, and a single-level `for`
 * loop. Returns stdout/stderr lines and the variables it set.
 */
export function runScript(
	content: string,
	vars: Record<string, string>,
	name = 'script.sh'
): { lines: OutputLine[]; vars: Record<string, string> } {
	const local: Record<string, string> = { ...vars };
	const lines: OutputLine[] = [];
	const source = content.split('\n');

	/** Expand a command body and execute the handful of built-ins we support. */
	function runLine(raw: string, lineNumber: number): void {
		const text = raw.trim();
		if (text === '' || text.startsWith('#')) return;

		const assignment = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(text);
		if (assignment) {
			const [, name = '', rawValue = ''] = assignment;
			const value = rawValue.trim().replace(/^(['"])(.*)\1$/, '$2');
			local[name] = expandVars(value, local);
			return;
		}

		const tokens = tokenize(text);
		const [command = ''] = tokens;
		if (command === 'echo') {
			lines.push(out(expandVars(tokens.slice(1).join(' '), local)));
			return;
		}
		if (command === ':') return;
		lines.push(error(`${name}: line ${lineNumber}: ${command}: command not found`));
	}

	for (let index = 0; index < source.length; index += 1) {
		const raw = source[index] ?? '';
		const text = raw.trim();
		if (text === '' || text.startsWith('#')) continue;

		const forMatch = /^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.*?);?\s*do$/.exec(text);
		if (forMatch) {
			const [, variable = '', itemsRaw = ''] = forMatch;
			const items = expandVars(itemsRaw, local).split(/\s+/).filter(Boolean);
			const body: { text: string; line: number }[] = [];
			let closed = false;
			while (index + 1 < source.length) {
				index += 1;
				const inner = source[index] ?? '';
				if (inner.trim() === 'done') {
					closed = true;
					break;
				}
				body.push({ text: inner, line: index + 1 });
			}
			if (!closed) {
				lines.push(error(`${name}: line ${index + 1}: syntax error: unexpected end of file`));
				continue;
			}
			for (const item of items) {
				local[variable] = item;
				for (const bodyLine of body) runLine(bodyLine.text, bodyLine.line);
			}
			continue;
		}

		if (text === 'done') continue;
		runLine(raw, index + 1);
	}

	return { lines, vars: local };
}

/** The command list `help` prints, kept next to the parser so they cannot drift. */
export const HELP_LINES = [
	'ls [-l] [path]        list files',
	'cd [path]             change directory (~ for home)',
	'pwd                   print the working directory',
	'mkdir [-p] name       create a directory',
	'touch name            create an empty file',
	'cat file              print a file',
	'echo text [> file]    print text, optionally write it to a file',
	'chmod MODE file       change permissions (+x, 755, u+x, …)',
	'./script.sh           run an executable script',
	'bash script.sh        run a script through the interpreter',
	'help                  this list',
	'clear                 clear the scrollback'
];

function osError(command: string, arg: string, message: string): OutputLine {
	return error(`${command}: ${arg}: ${message}`);
}

function listDirectory(
	name: string,
	node: BashDir,
	state: ShellState,
	long: boolean,
	showAll: boolean
): OutputLine[] {
	if (!canRead(node)) return [osError('ls', name, 'Permission denied')];
	const names = Object.keys(node.children)
		.filter((child) => showAll || !child.startsWith('.'))
		.sort((a, b) => a.localeCompare(b));
	if (names.length === 0) return [];
	if (!long) return [out(names.map((child) => `${child}${node.children[child]?.kind === 'dir' ? '/' : ''}`).join('  '))];
	return names.map((child) => {
		const entry = node.children[child];
		if (!entry) return out(child);
		return out(`${formatMode(entry)}  ${child}${entry.kind === 'dir' ? '/' : ''}`);
	});
}

/**
 * Execute one command line. Pure: the returned state is a fresh copy, so the
 * component can keep undo/restart for free by keeping the old value.
 */
export function execute(state: ShellState, input: string): CommandResult {
	const root = cloneRoot(state.root);
	const next: ShellState = { ...state, root, vars: { ...state.vars } };
	const lines: OutputLine[] = [];
	const tokens = tokenize(input);
	if (tokens.length === 0) return { state: next, lines, clear: false };

	const command = tokens[0] ?? '';
	const args = tokens.slice(1);

	/**
	 * Run a file as a script. `requireExec` is the difference between `./x` and
	 * `bash x`: the kernel needs the execute bit, the interpreter only needs read.
	 */
	const runFile = (raw: string | undefined, label: string, requireExec: boolean, commandName: string): void => {
		if (!isPathToken(raw)) {
			lines.push(error(`${commandName}: missing script name`));
			return;
		}
		const resolved = resolvePath(next, raw);
		if ('error' in resolved) {
			lines.push(osError(commandName, label, resolved.error));
			return;
		}
		const node = lookup(root, resolved);
		if (!node) {
			lines.push(error(`bash: ${label}: No such file or directory`));
			return;
		}
		if (node.kind === 'dir') {
			lines.push(error(`bash: ${label}: Is a directory`));
			return;
		}
		if (!canRead(node)) {
			lines.push(error(`bash: ${label}: Permission denied`));
			return;
		}
		if (requireExec && !canExec(node)) {
			lines.push(error(`bash: ${label}: Permission denied`));
			return;
		}
		const script = runScript(node.content, next.vars, node.name);
		lines.push(...script.lines);
		next.vars = script.vars;
	};

	switch (command) {
		case 'pwd': {
			lines.push(out(absolutePath(next)));
			break;
		}

		case 'whoami': {
			lines.push(out(next.vars.USER ?? 'student'));
			break;
		}

		case 'help': {
			for (const line of HELP_LINES) lines.push({ text: line, kind: 'info' });
			break;
		}

		case 'clear': {
			return { state: next, lines: [], clear: true };
		}

		case 'exit': {
			lines.push({ text: 'This sandbox has no exit; close the tab to leave.', kind: 'info' });
			break;
		}

		case 'ls': {
			const long = args.some((arg) => arg.startsWith('-') && arg.includes('l'));
			const showAll = args.some((arg) => arg.startsWith('-') && arg.includes('a'));
			const targets = args.filter((arg) => !arg.startsWith('-'));
			const scope = targets.length > 0 ? targets : ['.'];
			for (const target of scope) {
				const resolved = resolvePath(next, target);
				if ('error' in resolved) {
					lines.push(osError('ls', target, resolved.error));
					continue;
				}
				const node = lookup(root, resolved);
				if (!node) {
					lines.push(osError('ls', target, 'No such file or directory'));
					continue;
				}
				if (node.kind === 'file') {
					lines.push(out(long ? `${formatMode(node)}  ${node.name}` : node.name));
					continue;
				}
				if (scope.length > 1) lines.push({ text: `${displayArg(next, resolved)}:`, kind: 'info' });
				lines.push(...listDirectory(target, node, next, long, showAll));
			}
			break;
		}

		case 'cd': {
			const target = args[0] ?? '~';
			const resolved = resolvePath(next, target);
			if ('error' in resolved) {
				lines.push(error(`cd: ${target}: ${resolved.error}`));
				break;
			}
			const node = lookup(root, resolved);
			if (!node) {
				lines.push(error(`cd: ${target}: No such file or directory`));
				break;
			}
			if (node.kind !== 'dir') {
				lines.push(error(`cd: ${target}: Not a directory`));
				break;
			}
			if (!canExec(node)) {
				lines.push(error(`cd: ${target}: Permission denied`));
				break;
			}
			next.cwd = resolved;
			break;
		}

		case 'mkdir': {
			const parents = args.includes('-p');
			const targets = args.filter((arg) => !arg.startsWith('-'));
			if (targets.length === 0) {
				lines.push(error('mkdir: missing operand'));
				break;
			}
			for (const target of targets) {
				const resolved = resolvePath(next, target);
				if ('error' in resolved) {
					lines.push(osError('mkdir', target, resolved.error));
					continue;
				}
				if (lookup(root, resolved)) {
					if (parents) continue;
					lines.push(osError('mkdir', target, 'File exists'));
					continue;
				}
				// Walk down, creating intermediates by hand so `-p` can fail on a file.
				let cursor: BashDir = root;
				let failed = false;
				for (let index = 0; index < resolved.length; index += 1) {
					const segment = resolved[index] ?? '';
					const existing = cursor.children[segment];
					const isLast = index === resolved.length - 1;
					if (existing) {
						if (existing.kind !== 'dir') {
							lines.push(osError('mkdir', target, 'Not a directory'));
							failed = true;
							break;
						}
						if (isLast) {
							if (parents) {
								failed = true;
								break;
							}
							lines.push(osError('mkdir', target, 'File exists'));
							failed = true;
							break;
						}
						cursor = existing;
						continue;
					}
					if (!canWrite(cursor) || !canExec(cursor)) {
						lines.push(osError('mkdir', target, 'Permission denied'));
						failed = true;
						break;
					}
					if (!parents && !isLast) {
						lines.push(osError('mkdir', target, 'No such file or directory'));
						failed = true;
						break;
					}
					const created = dir(segment, 0o755, {});
					cursor.children[segment] = created;
					cursor = created;
				}
				void failed;
			}
			break;
		}

		case 'touch': {
			const targets = args.filter((arg) => !arg.startsWith('-'));
			if (targets.length === 0) {
				lines.push(error('touch: missing file operand'));
				break;
			}
			for (const target of targets) {
				const resolved = resolvePath(next, target);
				if ('error' in resolved) {
					lines.push(osError('touch', target, resolved.error));
					continue;
				}
				if (lookup(root, resolved)) continue;
				const parent = parentOf(root, resolved);
				if (!parent) {
					lines.push(osError('touch', target, 'No such file or directory'));
					continue;
				}
				if (!canWrite(parent) || !canExec(parent)) {
					lines.push(osError('touch', target, 'Permission denied'));
					continue;
				}
				parent.children[resolved.at(-1) ?? target] = file(resolved.at(-1) ?? target, 0o644, '');
			}
			break;
		}

		case 'cat': {
			const targets = args.filter((arg) => !arg.startsWith('-'));
			if (targets.length === 0) {
				lines.push(error('cat: missing operand'));
				break;
			}
			for (const target of targets) {
				const resolved = resolvePath(next, target);
				if ('error' in resolved) {
					lines.push(osError('cat', target, resolved.error));
					continue;
				}
				const node = lookup(root, resolved);
				if (!node) {
					lines.push(osError('cat', target, 'No such file or directory'));
					continue;
				}
				if (node.kind === 'dir') {
					lines.push(osError('cat', target, 'Is a directory'));
					continue;
				}
				if (!canRead(node)) {
					lines.push(osError('cat', target, 'Permission denied'));
					continue;
				}
				for (const text of node.content.replace(/\n$/, '').split('\n')) lines.push(out(text));
			}
			break;
		}

		case 'echo': {
			const redirectAt = args.findIndex((arg) => arg === '>' || arg === '>>');
			if (redirectAt === -1) {
				lines.push(out(expandVars(args.join(' '), next.vars)));
				break;
			}
			const append = args[redirectAt] === '>>';
			const target = args[redirectAt + 1];
			const words = args.slice(0, redirectAt);
			const text = expandVars(words.join(' '), next.vars);
			if (!isPathToken(target)) {
				lines.push(error('bash: syntax error near unexpected token `newline`'));
				break;
			}
			const resolved = resolvePath(next, target);
			if ('error' in resolved) {
				lines.push(osError('bash', target, resolved.error));
				break;
			}
			const existing = lookup(root, resolved);
			if (existing?.kind === 'dir') {
				lines.push(osError('bash', target, 'Is a directory'));
				break;
			}
			if (existing) {
				if (!canWrite(existing)) {
					lines.push(osError('bash', target, 'Permission denied'));
					break;
				}
				existing.content = append ? `${existing.content}${text}\n` : `${text}\n`;
				break;
			}
			const parent = parentOf(root, resolved);
			if (!parent) {
				lines.push(osError('bash', target, 'No such file or directory'));
				break;
			}
			if (!canWrite(parent) || !canExec(parent)) {
				lines.push(osError('bash', target, 'Permission denied'));
				break;
			}
			parent.children[resolved.at(-1) ?? target] = file(resolved.at(-1) ?? target, 0o644, `${text}\n`);
			break;
		}

		case 'chmod': {
			const modeArg = args[0];
			const targets = args.slice(1);
			if (!isPathToken(modeArg) || targets.length === 0) {
				lines.push(error('chmod: missing operand'));
				break;
			}
			if (applyMode(0o644, modeArg) === null) {
				lines.push(error(`chmod: invalid mode: '${modeArg}'`));
				break;
			}
			for (const target of targets) {
				const resolved = resolvePath(next, target);
				if ('error' in resolved) {
					lines.push(osError('chmod', target, resolved.error));
					continue;
				}
				const node = lookup(root, resolved);
				if (!node) {
					lines.push(osError('chmod', target, 'No such file or directory'));
					continue;
				}
				const updated = applyMode(node.mode, modeArg);
				if (updated === null) {
					lines.push(error(`chmod: invalid mode: '${modeArg}'`));
					continue;
				}
				node.mode = updated & 0o777;
			}
			break;
		}

		case 'bash':
		case 'sh': {
			runFile(args[0], args[0], false, command);
			break;
		}

		default: {
			// Only ./name and `bash name` run files; a bare name is not on PATH.
			if (command.startsWith('./')) {
				runFile(command.slice(2), command, true, 'bash');
				break;
			}
			if (command.includes('/')) {
				lines.push(error(`bash: ${command}: No such file or directory`));
				break;
			}
			lines.push(error(`bash: ${command}: command not found`));
			break;
		}
	}

	return { state: next, lines, clear: false };
}