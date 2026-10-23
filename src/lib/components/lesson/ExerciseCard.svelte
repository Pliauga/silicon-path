<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Component } from 'svelte';
	import { Check, ChevronDown, Eye, Play, RotateCcw, SquarePen, TriangleAlert } from '@lucide/svelte';

	import type { Diagnostic } from '$lib/compiler';
	import OutputConsole from '$lib/components/editor/OutputConsole.svelte';
	import StdInInput from '$lib/components/editor/StdInInput.svelte';
	import { checkOutput, normaliseOutput, type OutputVerdict } from '$lib/content/assessment';
	import { assessments } from '$lib/stores/assessments.svelte';
	import { compiler } from '$lib/stores/compiler.svelte';

	/**
	 * A hands-on exercise with a real in-browser compiler.
	 *
	 * The loop is Predict → Observe → Explain with the student's own code:
	 * they write a C program, Run it to observe real Clang/WASI output, then
	 * Check it against the output the lesson authored. The expected output is
	 * always visible on request — auto-grading is only fair when the target is
	 * stateable — and a solution exists for every graded exercise, because
	 * "show me" is the escape hatch a stuck learner needs.
	 *
	 * CodeMirror is imported on demand: a lesson page with an exercise should
	 * not pay ~150 KB for an editor until "Open editor" is pressed.
	 */
	interface Props {
		/** Stable id, e.g. `"m02-neg-range"`. Used as the progress key. */
		id: string;
		/** The task, one short paragraph. */
		prompt?: string;
		/** Starter C, shown in the editor's initial buffer. */
		starter?: string;
		/** A complete reference program, revealed only on request. */
		solution?: string;
		/** Exact stdout expected from a correct program. */
		expectedStdout?: string;
		/**
		 * The authored stdin. It seeds the editable input box and is ALWAYS what
		 * `Check output` feeds the program, so grading stays deterministic even
		 * after the learner experiments with other input via `Run`.
		 */
		stdin?: string;
		/** Expected exit status. Defaults to 0. */
		expectedExitCode?: number;
		/** Progressive hints, from gentle to almost-the-answer. */
		hints?: string[];
		/** Concept label, e.g. "signed integer limits". */
		concept?: string;
		/**
		 * `code` renders the compiler loop. `note` renders a reading-and-reasoning
		 * task (identification, hand conversion, a batch script) where the
		 * deliverable is a written answer, not a program — the solution toggle
		 * replaces the editor.
		 */
		mode?: 'code' | 'note';
	}

	let {
		id,
		prompt,
		starter,
		solution,
		expectedStdout,
		stdin = '',
		expectedExitCode,
		hints = [],
		concept,
		mode = 'code'
	}: Props = $props();

	const isNote = $derived(mode === 'note');
	const promptParagraphs = $derived(prompt ? prompt.split(/\n{2,}/) : []);
	const solutionParagraphs = $derived(solution ? solution.split(/\n{2,}/) : []);

	interface EditorProps {
		value: string;
		diagnostics: Diagnostic[];
		onchange: (next: string) => void;
		onrun: () => void;
	}

	type EditorComponent = Component<EditorProps>;

	/** Verified = a graded run matched. A note being read is tracked apart (`isRead`). */
	const solved = $derived(!isNote && assessments.isSolved(id));
	const read = $derived(isNote && assessments.isRead(id));
	const attempts = $derived(assessments.attempts(id));
	const gradable = $derived(!isNote && Boolean(expectedStdout));

	// Lesson MDX never re-renders a card with a different starter, so capturing
	// the initial value here is intentional.
	// svelte-ignore state_referenced_locally
	let source = $state(starter ?? '');
	// svelte-ignore state_referenced_locally
	let liveStdin = $state(stdin);
	const hasStdin = $derived(stdin.length > 0);
	const stdinEdited = $derived(liveStdin !== stdin);
	let editorOpen = $state(false);
	let editorLoading = $state(false);
	let editorFailed = $state(false);
	let Editor = $state<EditorComponent | null>(null);

	let solutionOpen = $state(false);
	let hintsShown = $state(0);
	let expectedOpen = $state(false);

	let verdict = $state<OutputVerdict | null>(null);
	let booted = $state(false);
	let hasRun = $state(false);

	const headingId = $derived(`exercise-${id}-heading`);
	const outputVisible = $derived(hasRun || compiler.isBusy || compiler.result !== null);

	let openEditorPromise: Promise<void> | null = null;

	async function openEditor(): Promise<void> {
		editorOpen = true;
		if (Editor) return;
		if (openEditorPromise) return openEditorPromise;

		editorLoading = true;
		openEditorPromise = (async () => {
			try {
				const module = await import('$lib/components/editor/CodeEditor.svelte');
				Editor = module.default as EditorComponent;
			} catch {
				editorFailed = true;
			} finally {
				editorLoading = false;
			}
		})();
		return openEditorPromise;
	}

	/** `Run` feeds the learner's input; `check` passes the authored one explicitly. */
	async function run(input: string = liveStdin): Promise<void> {
		if (compiler.isBusy) return;
		verdict = null;
		booted = true;
		hasRun = true;
		await compiler.run(source, input);
	}

	async function check(): Promise<void> {
		if (!gradable || compiler.isBusy) return;
		await run(stdin);
		if (compiler.result === null) return;
		if (compiler.state === 'timeout' || compiler.state === 'backend-error') return;

		const next = checkOutput(
			{ stdout: compiler.result.stdout, exitCode: compiler.result.exitCode },
			{ stdout: expectedStdout ?? '', ...(expectedExitCode === undefined ? {} : { exitCode: expectedExitCode }) }
		);
		verdict = next;
		assessments.record(id, next.kind === 'match');
	}

	function reset(): void {
		source = starter ?? '';
		liveStdin = stdin;
		verdict = null;
	}

	function revealHint(): void {
		if (hintsShown < hints.length) hintsShown += 1;
	}

	// The compiler store owns one worker. Leaving a lesson should not leave a
	// ~1 GB WASM sandbox running behind the next page.
	onDestroy(() => {
		if (booted) void compiler.dispose();
	});
</script>

<section
	class="callout exercise-card my-6"
	aria-labelledby={headingId}
	data-exercise-id={id}
	data-exercise-mode={mode}
>
	<div class="mb-4 flex items-center justify-between gap-3">
		<p
			id={headingId}
			class="flex items-center gap-1.5 font-mono text-micro tracking-[0.06em] text-clay-ink uppercase"
		>
			<SquarePen size={12} strokeWidth={1.5} aria-hidden="true" />
			Exercise
			{#if concept}
				<span class="normal-case tracking-normal text-muted-text">· {concept}</span>
			{/if}
		</p>
		{#if solved}
			<span
				class="flex items-center gap-1 font-mono text-micro text-success"
			>
				<Check size={11} strokeWidth={1.5} aria-hidden="true" />
				Solved
			</span>
		{:else if read}
			<span class="font-mono text-micro text-muted-text">Theory read · not verified</span>
		{/if}
	</div>

	{#each promptParagraphs as paragraph, index (index)}
		<p class="mb-3 text-body leading-[1.55] text-slate">{paragraph}</p>
	{/each}

	{#if !isNote && !starter}
		<p class="mb-3 text-micro text-muted-text">
			No starter code for this exercise — begin with
			<code class="font-mono text-code">#include &lt;stdio.h&gt;</code>.
		</p>
	{/if}

	<div class="mb-3 flex flex-wrap items-center gap-2">
		{#if isNote && !read}
			<button type="button" class="btn-editorial" onclick={() => assessments.markRead(id)}>
				<Check size={12} strokeWidth={1.5} aria-hidden="true" />
				Mark theory as read
			</button>
		{/if}
		{#if !isNote && starter && !editorOpen}
			<button
				type="button"
				class="btn-editorial"
				onclick={() => void openEditor()}
			>
				<SquarePen size={12} strokeWidth={1.5} aria-hidden="true" />
				Open editor
			</button>
		{:else if !isNote && !editorOpen}
			<button
				type="button"
				class="btn-editorial"
				onclick={() => void openEditor()}
			>
				<SquarePen size={12} strokeWidth={1.5} aria-hidden="true" />
				Write code
			</button>
		{/if}

		{#if !isNote && editorOpen}
			<button
				type="button"
				class="btn-editorial btn-clay"
				disabled={compiler.isBusy}
				onclick={() => void run()}
			>
				<Play size={12} strokeWidth={1.5} aria-hidden="true" />
				{compiler.isBusy ? 'Running…' : 'Run'}
			</button>

			{#if gradable}
				<button
					type="button"
					class="btn-editorial"
					disabled={compiler.isBusy}
					onclick={() => void check()}
				>
					<Check size={12} strokeWidth={1.5} aria-hidden="true" />
					Check output
				</button>
			{/if}

			<button
				type="button"
				class="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-micro text-dark-gray transition-colors duration-200 hover:text-slate"
				onclick={reset}
			>
				<RotateCcw size={12} strokeWidth={1.5} aria-hidden="true" />
				Reset
			</button>
		{/if}

		{#if solution}
			<button
				type="button"
				class="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-micro text-dark-gray transition-colors duration-200 hover:text-slate"
				aria-expanded={solutionOpen}
				onclick={() => (solutionOpen = !solutionOpen)}
			>
				<Eye size={12} strokeWidth={1.5} aria-hidden="true" />
				{solutionOpen ? 'Hide solution' : 'Show solution'}
			</button>
		{/if}
	</div>

	{#if !isNote && editorOpen}
		<div
			class="mb-4 h-[280px] overflow-hidden"
			data-density="dense"
		>
			{#if Editor}
				<Editor
					value={source}
					diagnostics={compiler.diagnostics}
					onchange={(next) => (source = next)}
					onrun={() => void run()}
				/>
			{:else if editorLoading}
				<p class="p-3 text-micro text-muted-text">Loading the editor…</p>
			{:else if editorFailed}
				<p class="flex items-start gap-1.5 p-3 text-small text-error">
					<TriangleAlert size={13} strokeWidth={1.5} aria-hidden="true" />
					The editor could not load. Your code is still checked against the expected output if you
					Run it from the playground.
				</p>
			{/if}
		</div>
	{/if}

	{#if !isNote && editorOpen && hasStdin}
		<div class="mb-3">
			<StdInInput bind:value={liveStdin} />
			{#if stdinEdited}
				<p class="mt-1.5 text-micro text-muted-text">
					Run uses your input. Check output always uses the authored input
					<code class="font-mono text-code">{stdin.replace(/\n/g, ' / ')}</code>, so edit freely.
				</p>
			{:else}
				<p class="mt-1.5 text-micro text-muted-text">
					Pre-filled with the authored input. Change it and Run to test other cases.
				</p>
			{/if}
		</div>
	{/if}

	{#if !isNote && outputVisible}
		<div class="mb-3 min-h-[160px]">
			<OutputConsole
				state={compiler.state}
				phase={compiler.phase}
				result={compiler.result}
				error={compiler.error}
			/>
		</div>
	{/if}

	{#if !isNote && verdict}
		<div
			class="mb-4 border-t border-gray pt-3"
			aria-live="polite"
		>
			{#if verdict.kind === 'match'}
				<p class="flex items-center gap-1.5 text-small text-success">
					<Check size={13} strokeWidth={1.5} aria-hidden="true" />
					Output matches the expected result.
				</p>
			{:else if verdict.kind === 'exit'}
				<p class="flex items-center gap-1.5 text-small text-error">
					<TriangleAlert size={13} strokeWidth={1.5} aria-hidden="true" />
					Program exited with status {verdict.actualExitCode}, expected {verdict.expectedExitCode}.
				</p>
			{:else if verdict.kind === 'mismatch'}
				<p class="flex items-center gap-1.5 text-small text-error">
					<TriangleAlert size={13} strokeWidth={1.5} aria-hidden="true" />
					Output does not match
					{#if verdict.line}
						— first difference on line {verdict.line}.
					{:else}
						— check trailing lines.
					{/if}
				</p>
				<div class="mt-2 grid gap-2 sm:grid-cols-2">
					<div>
						<p class="mb-1 text-micro tracking-[0.06em] text-muted-text uppercase">Expected</p>
						<pre
							class="overflow-x-auto whitespace-pre-wrap bg-ivory px-3 py-2.5 font-mono text-code leading-[1.6] text-dark-gray">{verdict.expected}</pre>
					</div>
					<div>
						<p class="mb-1 text-micro tracking-[0.06em] text-muted-text uppercase">Your output</p>
						<pre
							class="overflow-x-auto whitespace-pre-wrap bg-ivory px-3 py-2.5 text-code leading-[1.6] font-mono text-slate">{verdict.actual ||
								'(nothing printed)'}</pre>
					</div>
				</div>
			{/if}
			{#if verdict.kind === 'match' && attempts > 1}
				<p class="mt-1.5 text-micro text-muted-text">Solved on attempt {attempts}.</p>
			{/if}
		</div>
	{/if}

	{#if !isNote && gradable}
		<div class="mb-1">
			<button
				type="button"
				class="flex items-center gap-1 font-mono text-micro tracking-[0.06em] text-muted-text uppercase transition-colors duration-200 hover:text-slate"
				aria-expanded={expectedOpen}
				onclick={() => (expectedOpen = !expectedOpen)}
			>
				<span
					class="inline-flex transition-transform duration-200"
					class:rotate-180={expectedOpen}
				>
					<ChevronDown size={12} strokeWidth={1.5} aria-hidden="true" />
				</span>
				Expected output
			</button>
			{#if expectedOpen}
				<pre
					class="mt-1.5 overflow-x-auto whitespace-pre-wrap bg-ivory px-3 py-2.5 font-mono text-code leading-[1.6] text-dark-gray">{normaliseOutput(
						expectedStdout ?? ''
					) || '(no output)'}</pre>
			{/if}
		</div>
	{/if}

	{#if hints.length > 0}
		<div class="mt-2 flex flex-wrap items-center gap-2">
			{#if hintsShown < hints.length}
				<button
					type="button"
					class="btn-editorial"
					onclick={revealHint}
				>
					Show hint {hintsShown + 1} of {hints.length}
				</button>
			{/if}
			{#each hints.slice(0, hintsShown) as hint, index (hint)}
				<p class="basis-full text-small leading-[1.6] text-dark-gray">
					<span class="font-mono text-micro text-muted-text uppercase">Hint {index + 1}</span>
					<span class="ml-1.5">{hint}</span>
				</p>
			{/each}
		</div>
	{/if}

	{#if solutionOpen && solution}
		<div class="mt-3">
			<p class="mb-1 font-mono text-micro tracking-[0.06em] text-muted-text uppercase">
				Solution
			</p>
			{#if isNote}
				<div class="space-y-2 text-small leading-[1.65] text-dark-gray">
					{#each solutionParagraphs as paragraph, index (index)}
						<p>{paragraph}</p>
					{/each}
				</div>
			{:else}
				<pre
					class="overflow-x-auto bg-ivory px-3 py-2.5 font-mono text-code leading-[1.6] text-slate"><code
						>{solution}</code
					></pre>
			{/if}
			<p class="mt-1.5 text-micro text-muted-text">
				Reading the answer is not cheating; copying it without typing it once is.
			</p>
		</div>
	{/if}

	{#if !isNote && !gradable && editorOpen}
		<p class="mt-2 text-micro text-muted-text">
			This exercise has no automated check yet — Run it and compare by eye.
		</p>
	{/if}
</section>