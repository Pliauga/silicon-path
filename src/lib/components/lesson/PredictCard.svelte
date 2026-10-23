<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Eye, Lock, RotateCcw } from '@lucide/svelte';
	import { predictions } from '$lib/stores/predictions.svelte';
	import { inlineSegments } from '$lib/utils/inline-markup';

	/**
	 * "Predict before you run": commit a guess, then compare.
	 *
	 * The model answers are NOT in the DOM until the learner commits (they sit
	 * behind an `{#if}`, not a CSS hide and not a closed `<details>`), so there
	 * is no scroll-and-peek path. Committing needs a non-empty guess for every
	 * question; what was typed is kept (and shown back beside the answer) so the
	 * comparison is with what the learner really thought, not a vague memory.
	 *
	 * `children` is the post-reveal material (expected-output blocks), rendered
	 * only after the commit as well.
	 */
	interface Props {
		/** Globally unique id; the commitment is persisted under it. */
		id: string;
		/** Questions, in order. Plain text with optional `code` and **bold**. */
		questions: string[];
		/** Model answers, same length and order as `questions`. */
		answers: string[];
		/** Revealed with the answers (e.g. the expected program output). */
		children?: Snippet;
	}

	let { id, questions, answers, children }: Props = $props();

	const headingId = $derived(`predict-${id}-heading`);
	const committed = $derived(predictions.get(id));

	let drafts = $state<string[]>([]);

	/** Every question needs some words before the guess can be locked in. */
	const ready = $derived(
		questions.length > 0 &&
			questions.every((_, index) => (drafts[index] ?? '').trim().length >= 2)
	);

	function commit(): void {
		if (!ready) return;
		predictions.commit(
			id,
			questions.map((_, index) => drafts[index] ?? '')
		);
	}

	function predictAgain(): void {
		drafts = [];
		predictions.clear(id);
	}
</script>

{#snippet rich(text: string)}
	{#each inlineSegments(text) as segment, position (position)}
		{#if segment.kind === 'code'}
			<code class="font-mono text-code">{segment.text}</code>
		{:else if segment.kind === 'bold'}
			<strong>{segment.text}</strong>
		{:else}
			{segment.text}
		{/if}
	{/each}
{/snippet}

<section class="callout my-6" aria-labelledby={headingId} data-predict-id={id}>
	<div class="mb-4 flex items-center justify-between gap-3">
		<p
			id={headingId}
			class="flex items-center gap-1.5 font-mono text-micro tracking-[0.06em] text-clay-ink uppercase"
		>
			<Eye size={12} strokeWidth={1.5} aria-hidden="true" />
			Predict before you run
		</p>
		{#if committed}
			<span class="flex items-center gap-1 font-mono text-micro text-muted-text">
				<Lock size={11} strokeWidth={1.5} aria-hidden="true" />
				Committed
			</span>
		{/if}
	</div>

	{#if !committed}
		<p class="mb-4 text-small text-dark-gray">
			Write what you expect for each question. The model answers stay hidden until you commit.
		</p>
	{/if}

	<ol class="m-0 flex list-none flex-col gap-5 p-0">
		{#each questions as question, index (index)}
			{@const fieldId = `predict-${id}-${index}`}
			<li>
				<label for={fieldId} class="mb-2 block text-body leading-[1.45] text-slate">
					<span class="mr-1 font-mono text-micro text-muted-text">{index + 1}.</span>
					{@render rich(question)}
				</label>
				{#if committed}
					<p class="m-0 border-b border-gray/40 bg-ivory px-3 py-2 text-small text-dark-gray">
						<span class="font-mono text-micro tracking-[0.06em] text-muted-text uppercase">
							You predicted
						</span><br />
						{committed.guesses[index] || 'No answer recorded.'}
					</p>
					<p class="m-0 mt-2 border-b border-gray/40 bg-ivory-dark px-3 py-2 text-small text-slate">
						<span class="font-mono text-micro tracking-[0.06em] text-clay-ink uppercase">
							Model answer
						</span><br />
						{@render rich(answers[index] ?? '')}
					</p>
				{:else}
					<textarea
						id={fieldId}
						rows="2"
						class="w-full resize-y border-b border-gray bg-ivory px-3 py-2 text-small leading-[1.45] text-slate"
						placeholder="Your prediction"
						value={drafts[index] ?? ''}
						oninput={(event) => {
							drafts[index] = event.currentTarget.value;
						}}
					></textarea>
				{/if}
			</li>
		{/each}
	</ol>

	<div class="mt-5 flex flex-wrap items-center gap-3">
		{#if committed}
			<button type="button" class="btn-editorial" onclick={predictAgain}>
				<RotateCcw size={13} strokeWidth={1.5} aria-hidden="true" />
				Predict again
			</button>
			<span class="text-micro text-muted-text">
				Where your guess and the model answer differ is the thing to learn.
			</span>
		{:else}
			<button type="button" class="btn-editorial btn-clay" disabled={!ready} onclick={commit}>
				<Lock size={13} strokeWidth={1.5} aria-hidden="true" />
				Commit prediction
			</button>
			{#if !ready}
				<span class="text-micro text-muted-text">Answer all {questions.length} to commit.</span>
			{/if}
		{/if}
	</div>

	{#if committed && children}
		<div class="mt-5">
			{@render children()}
		</div>
	{/if}
</section>
