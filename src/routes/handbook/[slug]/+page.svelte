<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Check, Clock } from '@lucide/svelte';
	import LessonPager from '$lib/components/lesson/LessonPager.svelte';
	import AnalogyToggle from '$lib/components/shell/AnalogyToggle.svelte';
	import { chapters, chapterNeighbours, getChapter } from '$lib/content/handbook';
	import { compiler } from '$lib/stores/compiler.svelte';
	import { progress } from '$lib/stores/progress.svelte';
	import { inview } from '$lib/actions/inview';
	import { revealParagraphs } from '$lib/actions/reveal';

	/**
	 * One C Handbook chapter. Same reading column as a lesson — the URL family
	 * is the only thing that differs — so the two tracks feel like one app while
	 * their curricula stay completely separate.
	 */
	const chapter = $derived(getChapter(page.params.slug ?? ''));
	const index = $derived(chapter ? chapters.findIndex((entry) => entry.slug === chapter.slug) : -1);
	const total = chapters.length;

	/** Handbook completion uses a namespaced key so course progress stays exact. */
	const progressKey = $derived(chapter ? `handbook/${chapter.slug}` : '');
	const done = $derived(progressKey !== '' && progress.isComplete(progressKey));

	const neighbours = $derived(
		chapter ? chapterNeighbours(chapter.slug) : { previous: undefined, next: undefined }
	);
	const previous = $derived(
		neighbours.previous
			? { slug: neighbours.previous.slug, title: neighbours.previous.frontmatter.title }
			: undefined
	);
	const next = $derived(
		neighbours.next
			? { slug: neighbours.next.slug, title: neighbours.next.frontmatter.title }
			: undefined
	);

	/**
	 * A chapter that ships an exercise boots Clang while the reader is still
	 * reading, and releases the worker when they navigate away. Same contract as
	 * the lesson route.
	 */
	$effect(() => {
		if (!chapter) return;
		// Visiting writes reactive state; keep that write out of the effect's
		// dependency graph or the effect would re-trigger itself.
		untrack(() => progress.visit(progressKey));

		let armed = true;
		void tick().then(() => {
			if (!armed) return;
			if (document.querySelector('[data-exercise-id]')) void compiler.prewarm();
		});

		return () => {
			armed = false;
			void compiler.dispose();
		};
	});

	function toggleComplete(): void {
		if (done) progress.uncomplete(progressKey);
		else progress.complete(progressKey);
	}
</script>

<svelte:head>
	{#if chapter}
		<title>{chapter.frontmatter.title} — C Handbook — Silicon Path</title>
		<meta
			name="description"
			content="C Handbook chapter {index + 1}: {chapter.frontmatter.title}"
		/>
	{/if}
</svelte:head>

{#if chapter}
	<article class="mx-auto w-full max-w-[72ch] px-6 py-8 lg:px-12 lg:py-10">
		<section use:inview>
			<div class="fade-text">
				<header>
					<p class="mb-2 font-mono text-micro tracking-[0.06em] text-clay-ink uppercase">
						C Handbook — Chapter {String(index + 1).padStart(2, '0')} of {String(
							total
						).padStart(2, '0')}
					</p>

					<h1 class="text-h1 leading-[1.1] text-slate">
						{chapter.frontmatter.title}
					</h1>

					<div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
						<span class="inline-flex items-center gap-1.5 text-micro text-muted-text">
							<Clock size={12} strokeWidth={1.5} aria-hidden="true" />
							{chapter.frontmatter.estimatedMinutes} min read
						</span>

						<span class="ml-auto inline-flex items-center gap-2">
							<span class="text-micro text-muted-text">Analogy</span>
							<AnalogyToggle />
						</span>

						<button
							type="button"
							onclick={toggleComplete}
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
			</div>
		</section>

		{#key chapter.slug}
			<section class="prose-path mt-6" use:inview={{ threshold: 0 }} use:revealParagraphs>
				<div class="fade-text">
					<chapter.component />
				</div>
			</section>
		{/key}

		<LessonPager base="handbook" {previous} {next} />
	</article>
{:else}
	<div class="mx-auto w-full max-w-[72ch] px-6 py-16 lg:px-12">
		<h1 class="text-h1 text-slate">Chapter not found</h1>
		<p class="mt-3 text-body text-dark-gray">
			That chapter does not exist yet. The handbook index lists everything that is written.
		</p>
		<a href={resolve('/handbook')} class="btn-editorial mt-8">Back to the C Handbook</a>
	</div>
{/if}