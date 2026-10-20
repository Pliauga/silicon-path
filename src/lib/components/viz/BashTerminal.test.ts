// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import BashTerminal from './BashTerminal.svelte';

/**
 * Wiring test for the terminal shell: it proves the component talks to the
 * model, that a denied command renders stderr, and that the chmod gate is the
 * real one (the lesson's own exercise sequence).
 */
describe('BashTerminal', () => {
	afterEach(cleanup);

	async function run(command: string): Promise<void> {
		const input = screen.getByLabelText('Terminal command') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: command } });
		await fireEvent.submit(input.closest('form') as HTMLFormElement);
	}

	function output(): string {
		return screen.getByRole('log').textContent ?? '';
	}

	it('runs a command and prints its output', async () => {
		render(BashTerminal);
		await run('pwd');
		expect(output()).toContain('/home/student');
	});

	it('refuses to execute a script without the execute bit', async () => {
		render(BashTerminal);
		await run('./greet.sh');
		expect(output()).toContain('Permission denied');

		await run('chmod +x greet.sh');
		await run('./greet.sh');
		expect(output()).toContain('hello, world');
		expect(output()).toContain('you are student');
	});

	it('respects directory permissions', async () => {
		render(BashTerminal);
		await run('chmod 000 reports');
		await run('cd reports');
		expect(output()).toContain('Permission denied');
		// The prompt still reads ~, i.e. the failed cd left the working directory alone.
		expect(output()).toContain('student@silicon-path:~$ cd reports');
	});
});