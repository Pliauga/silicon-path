import { describe, expect, it } from 'vitest';
import {
	applyMode,
	createShell,
	execute,
	expandVars,
	formatMode,
	promptPath,
	runScript,
	tokenize
} from './bash-shell';

/**
 * The permission matrix is the whole point of the sandbox: if `chmod` stops
 * gating `./script.sh`, the file-permissions lesson teaches a lie. These tests
 * pin the behaviour students will actually type.
 */
describe('bash shell', () => {
	it('starts in the practice home and shows it as ~', () => {
		const shell = createShell();
		expect(promptPath(shell)).toBe('~');
		const { lines } = execute(shell, 'pwd');
		expect(lines[0]?.text).toBe('/home/student');
	});

	it('lists the practice files with directories marked', () => {
		const shell = createShell();
		const { lines } = execute(shell, 'ls');
		const text = lines.map((line) => line.text).join('\n');
		expect(text).toContain('notes.txt');
		expect(text).toContain('greet.sh');
		expect(text).toContain('lab/');
		expect(text).toContain('reports/');
	});

	it('refuses to execute a script that is not executable', () => {
		const shell = createShell();
		const { lines } = execute(shell, './greet.sh');
		expect(lines[0]).toEqual({ text: 'bash: ./greet.sh: Permission denied', kind: 'stderr' });
	});

	it('runs the script after chmod +x', () => {
		const shell = createShell();
		const chmod = execute(shell, 'chmod +x greet.sh');
		expect(chmod.lines).toEqual([]);
		const run = execute(chmod.state, './greet.sh');
		const text = run.lines.map((line) => line.text);
		expect(text).toContain('hello, world');
		expect(text).toContain('you are student');
	});

	it('sets permissions from an octal mode', () => {
		const shell = createShell();
		const octal = execute(shell, 'chmod 755 greet.sh');
		const userOnly = execute(octal.state, 'chmod 700 greet.sh');
		expect(userOnly.lines).toEqual([]);
		const ls = execute(userOnly.state, 'ls -l greet.sh');
		expect(ls.lines[0]?.text).toBe('-rwx------  greet.sh');
	});

	it('does not mutate the previous state', () => {
		const shell = createShell();
		const after = execute(shell, 'chmod 600 notes.txt').state;
		const before = shell.root.children['home'];
		const node = before?.kind === 'dir' ? before.children['student'] : undefined;
		const notes = node?.kind === 'dir' ? node.children['notes.txt'] : undefined;
		expect(notes?.mode).toBe(0o644);
		expect(after).not.toBe(shell);
	});

	it('walks directories with cd and rejects files', () => {
		const shell = createShell();
		const lab = execute(shell, 'cd lab');
		expect(promptPath(lab.state)).toBe('~/lab');
		const back = execute(lab.state, 'cd ..');
		expect(promptPath(back.state)).toBe('~');
		const file = execute(shell, 'cd notes.txt');
		expect(file.lines[0]).toEqual({ text: 'cd: notes.txt: Not a directory', kind: 'stderr' });
	});

	it('creates nested directories with mkdir -p', () => {
		const shell = createShell();
		const made = execute(shell, 'mkdir -p a/b/c');
		expect(made.lines).toEqual([]);
		const cd = execute(made.state, 'cd a/b/c');
		expect(promptPath(cd.state)).toBe('~/a/b/c');
	});

	it('reports an existing directory', () => {
		const shell = createShell();
		const { lines } = execute(shell, 'mkdir reports');
		expect(lines[0]).toEqual({ text: 'mkdir: reports: File exists', kind: 'stderr' });
	});

	it('writes with > and reads back with cat', () => {
		const shell = createShell();
		const wrote = execute(shell, 'echo hello > out.txt');
		expect(wrote.lines).toEqual([]);
		const read = execute(wrote.state, 'cat out.txt');
		expect(read.lines[0]?.text).toBe('hello');
	});

	it('honours the write bit on redirection', () => {
		const shell = createShell();
		const locked = execute(shell, 'chmod 400 notes.txt');
		const write = execute(locked.state, 'echo hi > notes.txt');
		expect(write.lines[0]).toEqual({ text: 'bash: notes.txt: Permission denied', kind: 'stderr' });
		const read = execute(locked.state, 'cat notes.txt');
		expect(read.lines[0]?.kind).toBe('stdout');
	});

	it('runs a script through bash without the execute bit', () => {
		const shell = createShell();
		const run = execute(shell, 'bash loop.sh');
		expect(run.lines.map((line) => line.text)).toEqual(['practise mon', 'practise tue', 'practise wed']);
	});

	it('reports unknown commands like bash does', () => {
		const shell = createShell();
		expect(execute(shell, 'frobnicate').lines[0]?.text).toBe('bash: frobnicate: command not found');
	});
});

describe('mode parsing', () => {
	it('adds and removes execute for the user class', () => {
		expect(applyMode(0o644, '+x')).toBe(0o755);
		expect(applyMode(0o755, '-x')).toBe(0o644);
		expect(applyMode(0o644, 'u+x')).toBe(0o744);
		expect(applyMode(0o777, 'go-r')).toBe(0o733);
	});

	it('formats a mode the way ls -l does', () => {
		const shell = createShell();
		const home = shell.root.children['home'];
		const student = home?.kind === 'dir' ? home.children['student'] : undefined;
		const file = student?.kind === 'dir' ? student.children['notes.txt'] : undefined;
		if (!file) throw new Error('notes.txt missing from the fixture');
		expect(formatMode(file)).toBe('-rw-r--r--');
	});
});

describe('script runner', () => {
	it('expands variables set earlier in the script', () => {
		const result = runScript('name="Ada"\necho "hi $name"\necho "${name}!"\n', {});
		expect(result.lines.map((line) => line.text)).toEqual(['hi Ada', 'Ada!']);
		expect(result.vars['name']).toBe('Ada');
	});

	it('loops over words', () => {
		const result = runScript('for n in 1 2; do\n  echo $n\ndone\n', {});
		expect(result.lines.map((line) => line.text)).toEqual(['1', '2']);
	});
});

describe('tokenizer', () => {
	it('keeps quoted words together', () => {
		expect(tokenize('echo "a b" c')).toEqual(['echo', 'a b', 'c']);
	});

	it('expands known vars and leaves unknown ones empty', () => {
		expect(expandVars('$USER at $NOPE', { USER: 'student' })).toBe('student at ');
	});
});