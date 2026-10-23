<script lang="ts">
	import { Check, CircleHelp, X } from '@lucide/svelte';
	import { isAnswerableQuiz, correctOptionIndex } from '$lib/content/assessment';
	import { assessments } from '$lib/stores/assessments.svelte';
	import { seededOrder } from '$lib/utils/shuffle';

	/**
	 * A knowledge checkpoint: multiple choice, one correct option, one
	 * explanation of *why* that option is right.
	 *
	 * Grading is instant — a deliberate choice. The learner is checking a
	 * mental model, not performing; withholding the verdict until the end of
	 * the lesson just lets a misunderstanding survive the next three
	 * paragraphs. The explanation is where the teaching happens, so it appears
	 * whichever option was picked.
	 *
	 * Authored inline in MDX:
	 *
	 *   <QuizCard
	 *     id="m02-quiz-wrap"
	 *     question="..."
	 *     options={['...', '...', '...']}
	 *     answer={1}
	 *     explanation="..."
	 *   />
	 *
	 * A quiz with no `options` renders as a prompt to self-check, which is what
	 * the un-authored call sites need for now.
	 *
	 * Options are authored with the answer wherever convenient (historically
	 * first) but DISPLAYED in a deterministic shuffle seeded by `id`: the order
	 * is stable across renders and reloads, yet no position is a tell. Every
	 * index below (`chosen`, `correctIndex`) is an index into the AUTHORED
	 * `options`; only the render loop goes through `displayOrder`.
	 *
	 * A solved quiz is never a locked trophy. "Ask me again" gives a blank slate
	 * (answer and explanation hidden) and a new submission is graded and
	 * recorded; the badge shows the current streak, not a permanent "Correct".
	 */
	interface Props {
		/** Stable id, e.g. `"m02-quiz-wrap"`. Used as the progress key. */
		id: string;
		/** The question itself. */
		question?: string;
		/** The candidate answers, in display order. */
		options?: string[];
		/** Index into `options`, or the exact text of the correct option. */
		answer?: number | string;
		/** One sentence on why the correct answer is correct. */
		explanation?: string;
	}

	let { id, question, options, answer, explanation }: Props = $props();

	const answerable = $derived(isAnswerableQuiz(options, answer));
	const correctIndex = $derived(correctOptionIndex(options, answer));
	const solved = $derived(assessments.isSolved(id));
	const attempts = $derived(assessments.attempts(id));
	const streak = $derived(assessments.streak(id));

	/** Authored indices in display order; stable for a given quiz id. */
	const displayOrder = $derived(seededOrder(options?.length ?? 0, id));

	let chosen = $state<number | null>(null);
	let checked = $state(false);
	/** True between "Ask me again" and the next correct submission. */
	let retrying = $state(false);

	/**
	 * Review mode: solved and not currently re-answering. The correct option is
	 * shown highlighted and the radios rest; "Ask me again" leaves review mode.
	 */
	const reviewing = $derived(solved && !retrying);
	const selected = $derived(chosen ?? (reviewing ? correctIndex : null));
	const wasWrong = $derived(checked && chosen !== null && chosen !== correctIndex);
	const showExplanation = $derived(reviewing || (checked && chosen !== null));

	const headingId = $derived(`quiz-${id}-heading`);

	function choose(index: number): void {
		if (reviewing) return;
		chosen = index;
		checked = false;
	}

	function check(): void {
		if (chosen === null || !answerable) return;
		checked = true;
		const correct = chosen === correctIndex;
		assessments.record(id, correct);
		if (correct) retrying = false;
	}

	/** Blank slate: forget the last pick and hide the answer until a new commitment. */
	function askAgain(): void {
		chosen = null;
		checked = false;
		retrying = true;
	}
</script>

<section
	class="callout my-6"
	aria-labelledby={headingId}
	data-quiz-id={id}
>
	<div class="mb-4 flex items-center justify-between gap-3">
		<p
			id={headingId}
			class="flex items-center gap-1.5 font-mono text-micro tracking-[0.06em] text-clay-ink uppercase"
		>
			<CircleHelp size={12} strokeWidth={1.5} aria-hidden="true" />
			Check yourself
		</p>
		{#if solved && !retrying}
			{#if streak > 0}
				<span class="flex items-center gap-1 font-mono text-micro text-success">
					<Check size={11} strokeWidth={1.5} aria-hidden="true" />
					Correct{streak > 1 ? ` · ${streak} in a row` : ''}
				</span>
			{:else}
				<span class="font-mono text-micro text-muted-text">Missed last time</span>
			{/if}
		{/if}
	</div>

	{#if question}
		<p class="mb-5 font-display text-h3 leading-[1.35] text-slate">{question}</p>
	{:else}
		<p class="mb-5 font-display text-h3 leading-[1.35] text-slate">
			The question for this checkpoint has not been written yet.
		</p>
	{/if}

	{#if answerable && options}
		<fieldset class="m-0 border-0 p-0">
			<legend class="sr-only">Answer options</legend>
			<ul class="mb-5 flex list-none flex-col p-0">
				{#each displayOrder as index (index)}
					{@const option = options[index] ?? ''}
					{@const isPicked = selected === index}
					{@const isRight = checked && index === correctIndex}
					{@const isWrongPick = checked && isPicked && index !== correctIndex}
					<li>
						<label
							class="flex items-start gap-3 border-b border-gray/40 px-3 py-3 text-body leading-[1.45] transition-colors duration-200 {isPicked || isRight
								? 'bg-ivory-dark text-slate'
								: 'text-dark-gray hover:bg-ivory-dark hover:text-slate'} {reviewing
								? 'cursor-default'
								: 'cursor-pointer'}"
						>
							<input
								type="radio"
								name={`quiz-${id}`}
								value={index}
								checked={isPicked}
								disabled={reviewing}
								onchange={() => choose(index)}
								class="mt-2 accent-[var(--rubin-clay-ink)]"
							/>
							<span class="min-w-0 flex-1">
								{option}
								{#if isRight}
									<span class="ml-1.5 inline-flex align-middle text-success">
										<Check size={13} strokeWidth={1.75} aria-hidden="true" />
										<span class="sr-only">Correct answer</span>
									</span>
								{:else if isWrongPick}
									<span class="ml-1.5 inline-flex align-middle text-error">
										<X size={13} strokeWidth={1.75} aria-hidden="true" />
										<span class="sr-only">Not this one</span>
									</span>
								{/if}
							</span>
						</label>
					</li>
				{/each}
			</ul>

			{#if reviewing}
				<div class="flex flex-wrap items-center gap-3">
					<button type="button" class="btn-editorial" onclick={askAgain}>
						Ask me again
					</button>
					<span class="text-micro text-muted-text">
						Pull it from memory again; the answer hides until you commit.
					</span>
				</div>
			{:else}
				<div class="flex flex-wrap items-center gap-3">
					<button
						type="button"
						class="btn-editorial btn-clay"
						disabled={chosen === null}
						onclick={check}
					>
						Check answer
					</button>
					{#if wasWrong}
						<span class="text-micro text-muted-text">
							Not quite. The explanation is below; try again afterwards without looking.
						</span>
					{/if}
				</div>
			{/if}
		</fieldset>

		{#if showExplanation && explanation}
			<div
				class="mt-5 border-t border-gray pt-4"
				aria-live="polite"
			>
				<p class="mb-1 font-mono text-micro tracking-[0.06em] text-muted-text uppercase">Why</p>
				<p class="text-body leading-[1.55] text-slate">{explanation}</p>
			</div>
		{/if}

		{#if solved && attempts > 1}
			<p class="mt-2 text-micro text-muted-text">{attempts} attempts so far.</p>
		{/if}
	{:else}
		<p class="text-body leading-[1.55] text-dark-gray">
			Answer options for this checkpoint have not been authored yet. Say the answer out loud
			before reading on — the pause is the point.
		</p>
	{/if}
</section>