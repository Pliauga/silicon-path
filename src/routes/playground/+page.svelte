<script lang="ts">
	/**
	 * The playground: a real C editor backed by Clang-in-WASM.
	 *
	 * Layout is the editor-and-console split from AGENTS.md §5.4 (60/40 on
	 * desktop, stacked on narrow screens). The compiler boots on first Run and
	 * is torn down when the student leaves the route.
	 */
	import { onDestroy, onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { RotateCcw } from '@lucide/svelte';

	import CodeEditor from '$lib/components/editor/CodeEditor.svelte';
	import OutputConsole from '$lib/components/editor/OutputConsole.svelte';
	import RunButton from '$lib/components/editor/RunButton.svelte';
	import StdInInput from '$lib/components/editor/StdInInput.svelte';
	import { compiler, DEFAULT_SOURCE } from '$lib/stores/compiler.svelte';

	let source = $state(DEFAULT_SOURCE);
	let stdin = $state('');
	let isolated = $state(true);

	onMount(() => {
		isolated = window.crossOriginIsolated;
		// Pay the cold-boot cost while the student is reading, not after they
		// click Run. Silent: this must never look like a build they started.
		void compiler.prewarm();
	});

	onDestroy(() => {
		void compiler.dispose();
	});

	function run(): void {
		void compiler.run(source, stdin);
	}

	function reset(): void {
		source = DEFAULT_SOURCE;
		stdin = '';
	}
</script>

<svelte:head>
	<title>Playground — Silicon Path</title>
	<meta
		name="description"
		content="Write C, compile it with Clang in WebAssembly, and see exactly what the machine does."
	/>
</svelte:head>

<!-- Full-height workbench: header strip on top, then editor | console filling the
     remaining viewport. The window scrolls on narrow screens. -->
<div class="flex min-h-dvh w-full flex-col bg-ivory">
	<header
		class="flex flex-wrap items-end justify-between gap-4 border-b border-gray px-6 py-8 lg:px-12"
	>
		<div>
			<p class="mb-2 font-mono text-micro tracking-[0.08em] text-clay-ink uppercase">Playground</p>
			<h1 class="text-h1 leading-[1.15] text-slate">
				Write C. Watch it run.
			</h1>
			<p class="mt-2 max-w-[62ch] text-small leading-[1.6] text-dark-gray">
				Real Clang, compiled to WebAssembly and running in a worker — on this machine, with no
				network and no server. Programs are stopped after five seconds.
			</p>
		</div>

		<div class="flex flex-wrap items-center justify-end gap-3">
			{#if compiler.warmup === 'warming'}
				<span
					class="inline-flex items-center gap-2 font-mono text-micro tracking-[0.08em] text-muted-text uppercase"
					role="status"
					aria-live="polite"
				>
					<span class="size-1.5 bg-clay motion-safe:animate-pulse" aria-hidden="true"></span>
					Warming up compiler...
				</span>
			{:else if compiler.warmup === 'failed'}
				<span class="text-micro leading-[1.4] text-muted-text" role="status">
					Warm-up did not finish; the first Run will retry.
				</span>
			{/if}

			<button
				type="button"
				class="btn-editorial disabled:opacity-50"
				onclick={reset}
				disabled={compiler.isBusy}
			>
				<RotateCcw size={14} strokeWidth={1.5} aria-hidden="true" />
				Reset example
			</button>
			<RunButton onrun={run} busy={compiler.isBusy} />
		</div>
	</header>

	{#if !isolated}
		<p class="bg-ivory-med px-6 py-3 text-small leading-[1.6] text-dark-gray lg:px-12">
			This page is not cross-origin isolated, so programs that read
			<code class="font-mono text-code">stdin</code> may see end-of-input immediately. Compiling and
			running output-only programs works either way.
		</p>
	{/if}

	<div
		class="grid min-h-[560px] flex-1 grid-cols-1 gap-px bg-gray/40 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
	>
		<div class="flex min-h-[420px] flex-col gap-4 bg-ivory p-4">
			<div class="min-h-0 flex-1 overflow-hidden" data-density="dense">
				<CodeEditor
					value={source}
					diagnostics={compiler.diagnostics}
					onchange={(next) => (source = next)}
					onrun={run}
				/>
			</div>

			<div class="border-t border-gray/40">
				<StdInInput bind:value={stdin} onchange={(next) => (stdin = next)} />
			</div>
		</div>

		<div class="min-h-[320px] lg:min-h-0">
			<OutputConsole
				state={compiler.state}
				phase={compiler.phase}
				result={compiler.result}
				error={compiler.error}
			/>
		</div>
	</div>

	<footer class="flex flex-wrap items-center justify-between gap-3 px-6 py-6 lg:px-12">
		<p class="max-w-[72ch] text-small leading-[1.6] text-muted-text">
			The toolchain warms up in the background while you read this page, so the first Run is
			usually a second or two; later Runs are faster. Nothing leaves this browser.
		</p>
		<a
			href={resolve('/')}
			class="text-small text-dark-gray underline decoration-gray underline-offset-4 transition-colors duration-200 hover:text-slate"
		>
			Back to the dashboard
		</a>
	</footer>
</div>
