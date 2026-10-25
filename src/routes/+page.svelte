<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, Clock } from '@lucide/svelte';
	import { modules, isModuleAvailable } from '$lib/content/curriculum';
	import HomeHero from '$lib/components/viz/HomeHero.svelte';
	import { getLesson, lessonsInOrder } from '$lib/content';
	import { progress } from '$lib/stores/progress.svelte';
	import { inview } from '$lib/actions/inview';

	/**
	 * The dashboard. Three bands, top to bottom: a hero that states the thesis,
	 * a resume card, and the 23-module grid. Every card is an `<a>` so it is
	 * keyboard-focusable and middle-clickable.
	 */

	const totalLessons = $derived(lessonsInOrder.length);

	/** Overall completion, 0–100. */
	const percentComplete = $derived(
		totalLessons === 0
			? 0
			: Math.round((progress.completed.filter((s) => getLesson(s)).length / totalLessons) * 100)
	);

	/** The lesson to resume: an unfinished visit, else the most recent finish. */
	const resumeSlug = $derived(
		progress.lastVisitedIncomplete() ?? progress.mostRecentlyCompleted() ?? undefined
	);

	const resumeLesson = $derived(resumeSlug ? getLesson(resumeSlug) : undefined);

	/** Per-module completion, used by the thin bars on each card. */
	function modulePercent(moduleSlug: string): number {
		const module = modules.find((entry) => entry.slug === moduleSlug);
		if (!module || module.lessons.length === 0) return 0;
		const done = module.lessons.filter((lesson) => progress.isComplete(lesson.slug)).length;
		return Math.round((done / module.lessons.length) * 100);
	}
</script>

<svelte:head>
	<title>Silicon Path — learn C from the metal up</title>
</svelte:head>

<!-- Section 1: the home hero. A silicon package explodes as the reader
     scrolls toward #module-grid, where the module index begins. -->
<HomeHero class="lg:-ml-10" />

<!-- Section 2: resume + the 23-module index, set like a table of contents. -->
<section
	id="module-grid"
	class="mx-auto w-full max-w-[72ch] px-6 py-12 lg:px-(--density-gutter)"
	use:inview={{ threshold: 0 }}
	aria-labelledby="modules-heading"
>
	<div class="fade-text">
		<h2
			id="resume-heading"
			class="mb-4 font-mono text-micro tracking-[0.08em] text-muted-text uppercase"
		>
			Continue
		</h2>

		{#if resumeLesson}
			<a
				href={resolve('/lesson/[...slug]', { slug: resumeLesson.slug })}
				class="group callout flex items-center gap-6 hover:bg-ivory-dark"
			>
				<div class="flex min-w-0 flex-col gap-1">
					<span class="truncate text-h3 leading-[1.3] text-slate">
						{resumeLesson.frontmatter.title}
					</span>
					<span class="truncate text-small text-dark-gray">
						{resumeLesson.module.title} · {resumeLesson.frontmatter.estimatedMinutes} min
					</span>
				</div>
				<ArrowRight
					size={18}
					strokeWidth={1.5}
					aria-hidden="true"
					class="ml-auto shrink-0 text-dark-gray transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-slate motion-reduce:transition-none"
				/>
			</a>
		{:else}
			<div class="callout">
				<p class="text-body text-slate">You haven’t started yet. Pick a module below.</p>
				<p class="mt-2 text-small text-dark-gray">
					Module 01 is the only one with a lesson written so far.
				</p>
			</div>
		{/if}

		<div class="mt-10 mb-3 flex items-baseline justify-between gap-4">
			<h2 id="modules-heading" class="font-mono text-micro tracking-[0.08em] text-muted-text uppercase">
				Contents
			</h2>
			{#if percentComplete > 0}
				<span class="font-mono text-micro tabular-nums text-muted-text">
					{percentComplete}% complete
				</span>
			{/if}
		</div>

		<ol class="border-t border-gray">
			{#each modules as module (module.id)}
				{@const available = isModuleAvailable(module)}
				{@const percent = modulePercent(module.slug)}
				{@const firstLesson = module.lessons[0]}
				{@const target =
					available && firstLesson ? resolve('/lesson/[...slug]', { slug: firstLesson.slug }) : null}
				<li class="border-b border-gray/40">
					<!-- Available modules are links. Locked ones are inert rows: a link would
					     need a destination that exists, and "coming soon" is a state, not a page. -->
					<svelte:element
						this={target ? 'a' : 'div'}
						href={target ?? undefined}
						data-available={available}
						aria-disabled={target ? undefined : 'true'}
						class={[
							'index-row group flex items-baseline gap-5',
							available ? 'text-slate' : 'cursor-default text-muted-text'
						].join(' ')}
					>
						<span class="w-8 shrink-0 pl-2 font-mono text-micro tabular-nums text-muted-text">
							{String(module.id).padStart(2, '0')}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block text-h3 leading-[1.3]">{module.title}</span>
							<span class="mt-1 block text-small leading-[1.4] text-dark-gray">
								{module.blurb}
							</span>
						</span>
						<span class="shrink-0 pr-2 font-mono text-micro tabular-nums text-muted-text">
							{#if available}
								{percent}%
							{:else if module.cHeavy}
								<span title="This module carries significant C exercises">C</span>
							{:else}
								soon
							{/if}
						</span>
					</svelte:element>
				</li>
			{/each}
		</ol>

		<a
			href={resolve('/handbook')}
			class="callout mt-8 flex items-center justify-between gap-6 hover:bg-ivory-dark"
		>
			<span class="min-w-0">
				<span class="font-mono text-micro tracking-[0.08em] text-clay-ink uppercase">
					Second track
				</span>
				<span class="mt-1 block text-h3 leading-[1.3] text-slate">The C Handbook</span>
				<span class="mt-1 block max-w-[58ch] text-small leading-[1.5] text-dark-gray">
					Twenty chapters on the language itself — variables to the preprocessor, each with money and
					football versions, runnable code and three exercises.
				</span>
			</span>
			<ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" class="shrink-0 text-dark-gray" />
		</a>

		<a
			href={resolve('/worksheets')}
			class="callout mt-4 flex items-center justify-between gap-6 hover:bg-ivory-dark"
		>
			<span class="min-w-0">
				<span class="font-mono text-micro tracking-[0.08em] text-clay-ink uppercase">
					Lab track
				</span>
				<span class="mt-1 block text-h3 leading-[1.3] text-slate">Lab Worksheets</span>
				<span class="mt-1 block max-w-[58ch] text-small leading-[1.5] text-dark-gray">
					The five CST1500 lab sheets as interactive pages: 63 exercises, live figures, and C
					programs that run in the browser.
				</span>
			</span>
			<ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" class="shrink-0 text-dark-gray" />
		</a>

		<footer class="mt-10 flex flex-wrap items-center gap-x-2 gap-y-1">
			<Clock size={13} strokeWidth={1.5} aria-hidden="true" class="text-muted-text" />
			<p class="text-small text-muted-text">
				Built as a personal learning project. Progress stays on this device.
				<a
					href={resolve('/about')}
					class="text-slate underline decoration-gray/60 underline-offset-4 transition-colors duration-200 hover:text-clay-ink"
					>Why it exists</a
				>.
			</p>
		</footer>
	</div>
</section>
