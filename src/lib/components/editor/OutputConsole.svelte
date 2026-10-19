<script lang="ts">
	/**
	 * The compiler's mouth: status line, program output, diagnostics.
	 *
	 * Everything the student needs to know about a Run lives here. Errors are
	 * never toasts or modals (AGENTS.md §7) — they appear next to the code that
	 * caused them, and the gutter markers in the editor point at the same lines.
	 */
	import { CircleAlert, CircleCheck, Clock3, Loader } from '@lucide/svelte';

	import type { CompileResult } from '$lib/compiler';
	import { describeEnvironment, readPageEnvironment } from '$lib/compiler/environment';
	import type { RunState } from '$lib/stores/compiler.svelte';

	interface Props {
		state: RunState;
		phase: RunPhaseName | null;
		result: CompileResult | null;
		error: string | null;
	}

	type RunPhaseName = 'boot' | 'write' | 'compile' | 'link' | 'run';

	let { state, phase, result, error }: Props = $props();

	/** Measured when the failure is shown, so the panel reports the real page, not a guess. */
	const environment = $derived.by(() => {
		if (state !== 'backend-error') return null;
		const env = readPageEnvironment();
		return env ? describeEnvironment(env) : null;
	});

	const phaseLabel: Record<RunPhaseName, string> = {
		boot: 'Booting the C toolchain (first run only, ~1 s)',
		write: 'Writing source',
		compile: 'Compiling',
		link: 'Linking',
		run: 'Running'
	};

	let status = $derived.by(() => {
		if (state === 'booting' || state === 'running') {
			return {
				kind: 'busy' as const,
				text: phase ? phaseLabel[phase] : 'Working'
			};
		}
		if (state === 'backend-error') {
			return { kind: 'error' as const, text: 'The toolchain could not start' };
		}
		if (state === 'timeout') {
			return {
				kind: 'error' as const,
				text: `Stopped after 5 s — the program never finished`
			};
		}
		if (state === 'compile-error') {
			return { kind: 'error' as const, text: 'Compile error' };
		}
		if (state === 'runtime-error') {
			return { kind: 'error' as const, text: 'Runtime error' };
		}
		if (state === 'success') {
			const ms = result?.durationMs;
			return {
				kind: 'ok' as const,
				text: ms ? `Ran in ${(ms / 1000).toFixed(2)} s · exit 0` : 'Ran · exit 0'
			};
		}
		return { kind: 'idle' as const, text: 'Not run yet' };
	});

	let stdout = $derived(result?.stdout ?? '');
	let stderr = $derived(result?.stderr ?? '');
	let diagnostics = $derived(result?.diagnostics ?? []);
</script>

<section
	class="flex h-full min-h-0 flex-col bg-ivory-med"
	aria-labelledby="console-heading"
>
	<div class="flex items-center justify-between gap-3 border-b border-gray/40 px-4 py-3">
		<h2 id="console-heading" class="font-mono text-micro tracking-[0.08em] text-muted-text uppercase">
			Output
		</h2>
		<p
			class="flex items-center gap-1.5 text-small"
			class:text-clay-ink={status.kind === 'busy'}
			class:text-error={status.kind === 'error'}
			class:text-dark-gray={status.kind === 'idle'}
			class:text-success={status.kind === 'ok'}
			aria-live="polite"
		>
			{#if status.kind === 'busy'}
				<Loader size={14} strokeWidth={1.5} class="animate-spin" aria-hidden="true" />
			{:else if status.kind === 'ok'}
				<CircleCheck size={14} strokeWidth={1.5} aria-hidden="true" />
			{:else if status.kind === 'error'}
				<CircleAlert size={14} strokeWidth={1.5} aria-hidden="true" />
			{:else}
				<Clock3 size={14} strokeWidth={1.5} aria-hidden="true" />
			{/if}
			{status.text}
		</p>
	</div>

	<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
		{#if state === 'backend-error' && error}
			<div class="bg-ivory p-4">
				<p class="text-small text-slate">The C toolchain failed to start</p>
				<p class="mt-1 text-small leading-[1.6] text-dark-gray">
					{error}
				</p>
				{#if environment}
					<dl class="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-small">
						{#each environment.facts as fact (fact.label)}
							<dt class="font-mono text-micro tracking-[0.06em] text-muted-text uppercase">
								{fact.label}
							</dt>
							<dd class="font-mono text-code text-slate">{fact.value}</dd>
						{/each}
					</dl>
					<p class="mt-3 text-small leading-[1.6] text-dark-gray">{environment.hint}</p>
				{/if}
			</div>
		{/if}

		{#if state === 'timeout'}
			<div class="bg-ivory p-4">
				<p class="text-small text-slate">Killed at the 5 second limit</p>
				<p class="mt-1 text-small leading-[1.6] text-dark-gray">
					The program was still running after 5 seconds, so the toolchain was shut down. A loop like
					<code class="font-mono text-code">while (1);</code> or a <code class="font-mono text-code">scanf</code>
					waiting for input that never arrives will do this. The next Run boots a fresh compiler.
				</p>
			</div>
		{/if}

		{#if diagnostics.length > 0}
			<div>
				<h3 class="font-mono text-micro tracking-[0.08em] text-muted-text uppercase">Diagnostics</h3>
				<ul class="mt-2 flex flex-col gap-1.5">
					{#each diagnostics as diagnostic, index (index)}
						<li class="flex gap-2 px-2 py-1 text-small">
							<span
								class="mt-0.5 shrink-0 font-mono text-micro tracking-[0.06em] uppercase"
								class:text-error={diagnostic.severity === 'error'}
								class:text-warning={diagnostic.severity === 'warning'}
								class:text-muted-text={diagnostic.severity === 'note'}
							>
								{diagnostic.severity}
							</span>
							<span class="min-w-0 text-dark-gray">
								{#if diagnostic.line > 0}
									<span class="font-mono text-micro text-muted-text"
										>{diagnostic.source}:{diagnostic.line}{diagnostic.column > 0
											? `:${diagnostic.column}`
											: ''}</span
									>
								{/if}
								<span class="ml-1.5">{diagnostic.message}</span>
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if stdout || stderr || state === 'success'}
			<div class="min-h-0">
				<h3 class="font-mono text-micro tracking-[0.08em] text-muted-text uppercase">
					Program output
				</h3>
				<!-- Focusable so keyboard users can scroll long output (WCAG 2.1.1). -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<pre
					class="mt-2 overflow-x-auto bg-ivory p-3 font-mono text-code leading-[1.65] text-slate"
					tabindex="0"
					aria-label="Program standard output">{stdout || '(no output)'}</pre
				>
			</div>
		{/if}

		{#if stderr && state === 'runtime-error'}
			<div>
				<h3 class="font-mono text-micro tracking-[0.08em] text-muted-text uppercase">
					Standard error
				</h3>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<pre
					class="mt-2 overflow-x-auto bg-ivory p-3 font-mono text-code leading-[1.65] text-dark-gray"
					tabindex="0"
					aria-label="Program standard error">{stderr}</pre
				>
			</div>
		{/if}

		{#if state === 'idle'}
			<p class="text-small leading-[1.65] text-dark-gray">
				Press <kbd class="bg-ivory px-1.5 py-0.5 font-mono text-micro text-slate">Run</kbd> or
				<kbd class="bg-ivory px-1.5 py-0.5 font-mono text-micro text-slate">Ctrl/Cmd + Enter</kbd>.
				The first run boots Clang inside a Web Worker; later runs take well under a second.
			</p>
		{/if}
	</div>
</section>