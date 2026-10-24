<script lang="ts">
	import { resolve } from '$app/paths';
	import ExerciseCard from '$lib/components/lesson/ExerciseCard.svelte';
	import WorksheetFigure from '$lib/components/lesson/WorksheetFigure.svelte';
	import { exerciseCount, worksheets } from '$lib/content/worksheets';
	import { assessments } from '$lib/stores/assessments.svelte';
	import type { PageData } from './$types';

	/**
	 * One lab worksheet, rendered like a lesson: header, figures, then the
	 * exercises in sheet order. Cards are keyed by exercise id so progress and
	 * editor state survive a re-render.
	 */
	let { data }: { data: PageData } = $props();

	const week = $derived(data.week);
	const total = $derived(exerciseCount(week));
	const introParagraphs = $derived(week.intro.split(/\n{2,}/));
	const codeIds = $derived(
		week.sections.flatMap((section) =>
			section.exercises.filter((exercise) => exercise.mode === 'code').map((exercise) => exercise.id)
		)
	);
	const noteIds = $derived(
		week.sections.flatMap((section) =>
			section.exercises.filter((exercise) => exercise.mode === 'note').map((exercise) => exercise.id)
		)
	);
	/** Verified counts graded code runs only; a note marked read never adds to it. */
	const verified = $derived(codeIds.filter((id) => assessments.isSolved(id)).length);
	const theoryRead = $derived(noteIds.filter((id) => assessments.isRead(id)).length);
	const nextWeek = $derived(worksheets.find((entry) => entry.week === week.week + 1));
</script>

<svelte:head>
	<title>Week {week.week} — {week.title} · Silicon Path</title>
	<meta
		name="description"
		content="CST1500 lab worksheet {week.week}: {week.title}. {total} exercises with in-browser C."
	/>
</svelte:head>

<article class="mx-auto w-full max-w-[72ch] px-6 py-8 lg:px-12 lg:py-10">
	<nav class="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2" aria-label="Worksheets">
		<a
			href={resolve('/worksheets')}
			class="font-mono text-micro tracking-[0.06em] text-muted-text uppercase transition-colors duration-200 hover:text-slate"
		>
			Lab Worksheets
		</a>
		{#each worksheets as entry (entry.week)}
			<a
				href={resolve('/worksheets/[week]', { week: String(entry.week) })}
				aria-current={entry.week === week.week ? 'page' : undefined}
				class="border border-gray/40 px-2 py-1 font-mono text-micro transition-colors duration-200 hover:border-gray hover:text-slate"
				class:bg-ivory-med={entry.week === week.week}
				class:text-slate={entry.week === week.week}
				class:text-dark-gray={entry.week !== week.week}
			>
				{String(entry.week).padStart(2, '0')}
			</a>
		{/each}
	</nav>

	<header>
		<p class="font-mono text-micro tracking-[0.08em] text-clay-ink uppercase">
			Week {String(week.week).padStart(2, '0')} · Lab Worksheet
		</p>
		<h1 class="mt-2 text-h1 leading-[1.1] text-slate">{week.title}</h1>
		<p class="mt-2 font-mono text-micro leading-relaxed text-muted-text">{week.lecture}</p>
		<p class="mt-3 font-mono text-micro text-muted-text">
			{total} exercises · {week.duration} · source <span class="text-dark-gray">{week.source}</span>
		</p>
		<div class="mt-4" role="group" aria-label="Week progress">
			<div class="flex flex-wrap gap-x-6 gap-y-1 font-mono text-micro text-dark-gray">
				<span>Code verified {verified} / {codeIds.length}</span>
				<span class="text-muted-text">Theory read {theoryRead} / {noteIds.length}</span>
			</div>
			<div
				class="mt-2 h-1 w-full bg-ivory-dark"
				role="progressbar"
				aria-label="Code exercises verified"
				aria-valuemin={0}
				aria-valuemax={codeIds.length}
				aria-valuenow={verified}
			>
				<div
					class="h-full bg-clay-ink transition-[width] duration-300"
					style:width="{codeIds.length ? (verified / codeIds.length) * 100 : 0}%"
				></div>
			</div>
			<p class="mt-1.5 text-micro text-muted-text">
				The bar counts code whose output was checked. Marking theory as read is tracked
				separately and does not fill it.
			</p>
		</div>
	</header>

	<div class="mt-6 space-y-4">
		{#each introParagraphs as paragraph, index (index)}
			<p class="text-prose leading-[1.65] text-dark-gray">{paragraph}</p>
		{/each}
	</div>

	{#each week.figures as figure (figure.caption)}
		<WorksheetFigure {figure} />
	{/each}

	{#each week.sections as section (section.id)}
		<section class="mt-12" aria-labelledby="section-{section.id}">
			<h2 id="section-{section.id}" class="text-h2 text-slate">{section.title}</h2>
			{#if section.note}
				<p class="mt-2 border-l-2 border-clay pl-4 text-small leading-[1.65] text-dark-gray">
					{section.note}
				</p>
			{/if}

			<div class="mt-6 space-y-8">
				{#each section.exercises as exercise (exercise.id)}
					<div>
						<p class="mb-2 font-mono text-micro tracking-[0.06em] text-muted-text uppercase">
							{exercise.label} · {exercise.title}
						</p>
						<ExerciseCard
							id={exercise.id}
							prompt={exercise.prompt}
							starter={exercise.starter}
							solution={exercise.solution}
							hints={exercise.hints}
							stdin={exercise.stdin}
							expectedStdout={exercise.expectedStdout}
							concept={exercise.concept}
							mode={exercise.mode}
						/>
					</div>
				{/each}
			</div>
		</section>
	{/each}

	<footer class="mt-14 flex items-center justify-between border-t border-gray/40 pt-5">
		<a
			href={resolve('/worksheets')}
			class="font-mono text-small text-dark-gray transition-colors duration-200 hover:text-slate"
		>
			All worksheets
		</a>
		{#if nextWeek}
			<a
				href={resolve('/worksheets/[week]', { week: String(nextWeek.week) })}
				class="text-right font-mono text-small text-dark-gray transition-colors duration-200 hover:text-slate"
			>
				Week {String(nextWeek.week).padStart(2, '0')} — {nextWeek.title} →
			</a>
		{/if}
	</footer>
</article>