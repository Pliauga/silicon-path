<script lang="ts">
	import {
		createShell,
		execute,
		promptPath,
		type OutputLine,
		type ShellState
	} from '$lib/viz/bash-shell';

	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();

	/** Commands worth trying first; clicking one fills the prompt, it does not run it. */
	const HINTS = ['ls -l', 'cd lab', 'cat notes.txt', 'chmod +x greet.sh', './greet.sh'];

	function banner(): OutputLine[] {
		return [
			{ text: 'Silicon Path — practice shell', kind: 'info' },
			{
				text: 'A simulated bash. Files live in memory, so a wrong command cannot break anything.',
				kind: 'info'
			},
			{ text: '', kind: 'stdout' }
		];
	}

	let shell = $state<ShellState>(createShell());
	let lines = $state<OutputLine[]>(banner());
	let input = $state('');
	let history = $state<string[]>([]);
	let historyIndex = $state(0);
	let scrollback = $state<HTMLDivElement | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);

	let prompt = $derived(promptPath(shell));

	$effect(() => {
		// Reading the length makes this effect follow the scrollback, not the shell.
		const count = lines.length;
		if (count >= 0 && scrollback) scrollback.scrollTop = scrollback.scrollHeight;
	});

	function focusInput(): void {
		inputEl?.focus();
	}

	function run(): void {
		const command = input;
		const at = prompt;
		const result = execute(shell, command);
		const echoed: OutputLine = {
			text: `student@silicon-path:${at}$ ${command}`,
			kind: 'command'
		};
		lines = result.clear ? [] : [...lines, echoed, ...result.lines];
		shell = result.state;
		if (command.trim() !== '') {
			history = [...history, command];
			historyIndex = history.length;
		}
		input = '';
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			if (history.length === 0) return;
			historyIndex = Math.max(0, historyIndex - 1);
			input = history[historyIndex] ?? '';
			return;
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			if (historyIndex >= history.length) return;
			historyIndex += 1;
			input = history[historyIndex] ?? '';
			return;
		}
		if (event.key.toLowerCase() === 'l' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			lines = [];
		}
	}

	function useHint(command: string): void {
		input = command;
		historyIndex = history.length;
		focusInput();
	}

	function reset(): void {
		shell = createShell();
		lines = banner();
		history = [];
		historyIndex = 0;
		input = '';
		focusInput();
	}
</script>

<section class={['bash-terminal', className]} aria-label="Bash practice terminal">
	<header class="bash-head">
		<p class="bash-title">bash — practice terminal</p>
		<button type="button" class="bash-reset" onclick={reset}>reset session</button>
	</header>

	<div class="bash-scroll" bind:this={scrollback} role="log" aria-live="polite" aria-label="Terminal output">
		{#each lines as line, index (index)}
			{#if line.kind === 'command'}
				<p class="bash-line bash-command">{line.text}</p>
			{:else}
				<p
					class="bash-line"
					class:bash-stderr={line.kind === 'stderr'}
					class:bash-info={line.kind === 'info'}
				>
					{line.text || ' '}
				</p>
			{/if}
		{/each}
	</div>

	<form
		class="bash-input-row"
		onsubmit={(event) => {
			event.preventDefault();
			run();
		}}
	>
		<label class="sr-only" for="bash-command">Terminal command</label>
		<span class="bash-prompt" aria-hidden="true">student@silicon-path:{prompt}$</span>
		<input
			id="bash-command"
			bind:this={inputEl}
			bind:value={input}
			class="bash-input"
			type="text"
			autocomplete="off"
			autocapitalize="off"
			autocorrect="off"
			spellcheck="false"
			placeholder="help"
			aria-describedby="bash-hint"
			onkeydown={onKeydown}
		/>
	</form>

	<div class="bash-chips" id="bash-hint">
		<span class="bash-hint-label">try</span>
		{#each HINTS as hint (hint)}
			<button type="button" class="bash-chip" onclick={() => useHint(hint)}>{hint}</button>
		{/each}
	</div>
</section>

<style>
	.bash-terminal {
		margin: 24px 0;
		border: 1px solid rgba(138, 130, 116, 0.35);
		background: var(--color-paper);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		line-height: 1.55;
		overflow: hidden;
	}

	.bash-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 14px;
		border-bottom: 1px solid rgba(138, 130, 116, 0.2);
	}

	.bash-title {
		margin: 0;
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-dark-gray);
	}

	.bash-reset {
		font-family: inherit;
		font-size: 0.75rem;
		color: var(--color-dark-gray);
		background: transparent;
		border: 0;
		padding: 2px 4px;
		cursor: pointer;
	}

	.bash-reset:hover {
		color: var(--color-slate);
		text-decoration: underline;
	}

	.bash-reset:focus-visible,
	.bash-chip:focus-visible {
		outline: 2px solid var(--color-slate);
		outline-offset: 2px;
	}

	.bash-scroll {
		max-height: 320px;
		overflow-y: auto;
		padding: 12px 14px;
		scrollbar-width: thin;
	}

	.bash-line {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--color-slate);
	}

	.bash-command {
		color: var(--color-slate);
		font-weight: 700;
	}

	.bash-stderr {
		color: var(--color-error);
	}

	.bash-info {
		color: var(--color-dark-gray);
	}

	.bash-input-row {
		display: flex;
		align-items: baseline;
		gap: 6px;
		padding: 10px 14px;
		border-top: 1px solid rgba(138, 130, 116, 0.2);
		background: var(--color-ivory-med);
	}

	.bash-input-row:focus-within {
		outline: 2px solid var(--color-slate);
		outline-offset: -2px;
	}

	.bash-prompt {
		color: var(--color-clay-ink);
		font-weight: 700;
		white-space: nowrap;
	}

	.bash-input {
		flex: 1;
		min-width: 0;
		font-family: inherit;
		font-size: inherit;
		color: var(--color-slate);
		background: transparent;
		border: 0;
		outline: none;
		caret-color: var(--color-clay-ink);
	}

	.bash-input::placeholder {
		color: var(--color-gray);
	}

	.bash-chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding: 8px 14px 12px;
		border-top: 1px solid rgba(138, 130, 116, 0.2);
	}

	.bash-hint-label {
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.bash-chip {
		font-family: inherit;
		font-size: 0.75rem;
		color: var(--color-dark-gray);
		background: transparent;
		border: 1px solid rgba(138, 130, 116, 0.35);
		padding: 1px 7px;
		cursor: pointer;
	}

	.bash-chip:hover {
		background: var(--color-ivory-dark);
		color: var(--color-slate);
	}

	@media (prefers-reduced-motion: reduce) {
		.bash-chip,
		.bash-reset {
			transition: none;
		}
	}
</style>