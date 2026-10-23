<script lang="ts">
	import { resolve } from '$app/paths';
	import { Clock, Check } from '@lucide/svelte';
	import type { LoadedLesson } from '$lib/content';
	import { progress } from '$lib/stores/progress.svelte';
	import AnalogyToggle from '$lib/components/shell/AnalogyToggle.svelte';

	/**
	 * The header above a lesson body: where you are, what it costs, and the one
	 * action that matters (mark complete). Progress is local-only, so the
	 * button is a toggle rather than a one-way door.
	 */
	interface Props {
		lesson: LoadedLesson;
		position: { index: number; total: number };
	}

	let { lesson, position }: Props = $props();

	const fm = $derived(lesson.frontmatter);
	const done = $derived(progress.isComplete(lesson.slug));
	// "Lecture 02 — Data Representation 2" → "Lecture 02"; the topic is the h1's job.
	const lectureLabel = $derived(fm.lecture.split(' — ')[0]);

	function toggle(): void {
		if (done) progress.uncomplete(lesson.slug);
		else progress.complete(lesson.slug);
	}
</script>

<header>
	<p class="mb-2 font-mono text-micro tracking-[0.06em] text-clay-ink uppercase">
		{lectureLabel} — Lesson {position.index} of {position.total}
	</p>

	<h1 class="text-h1 leading-[1.1] text-slate">
		{fm.title}
	</h1>

	<div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
		<span class="inline-flex items-center gap-1.5 text-micro text-muted-text">
			<Clock size={12} strokeWidth={1.5} aria-hidden="true" />
			{fm.estimatedMinutes} min read
		</span>

		{#if fm.prerequisites.length > 0}
			<span class="text-micro text-muted-text">
				After
				{#each fm.prerequisites as prerequisite, i (prerequisite)}
					{#if i > 0}<span aria-hidden="true">, </span>{/if}
					<a
						href={resolve('/lesson/[...slug]', { slug: prerequisite })}
						class="text-dark-gray underline decoration-gray underline-offset-2 transition-colors duration-200 hover:text-clay-ink"
					>
						{prerequisite}
					</a>
				{/each}
			</span>
		{/if}

		<span class="ml-auto inline-flex items-center gap-2">
			<span class="text-micro text-muted-text">Analogy</span>
			<AnalogyToggle />
		</span>

		<button
			type="button"
			onclick={toggle}
			aria-pressed={done}
			class={[
				'inline-flex h-9 items-center gap-1.5 px-4 font-mono',
				'text-micro transition-colors duration-200 active:translate-y-px',
				done
					? 'bg-clay text-accent-text hover:bg-clay-hover'
					: 'bg-ivory-med text-dark-gray hover:bg-ivory-dark hover:text-slate'
			].join(' ')}
		>
			{#if done}
				<Check size={13} strokeWidth={1.5} aria-hidden="true" />
				Completed
			{:else}
				Mark complete
			{/if}
		</button>
	</div>
</header>
