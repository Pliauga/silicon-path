<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import LessonHeader from '$lib/components/lesson/LessonHeader.svelte';
	import LessonPager from '$lib/components/lesson/LessonPager.svelte';
	import { getLesson, lessonsInOrder } from '$lib/content';
	import { compiler } from '$lib/stores/compiler.svelte';
	import { inview } from '$lib/actions/inview';
	import { revealParagraphs } from '$lib/actions/reveal';

	/**
	 * Renders one MDX lesson inside the reading column. The layout supplies the
	 * shell; this file owns only the article frame, so every lesson gets the
	 * same measure and the same header treatment.
	 */

	// The loader is synchronous and already in the bundle, so resolve the
	// lesson here rather than serialising the component through `load`.
	const lesson = $derived(getLesson((page.params.slug ?? '').replace(/\/+$/, '').split('/').pop() ?? ''));

	/**
	 * A lesson that ships an exercise will need Clang the moment the student
	 * presses Run, so boot the toolchain while they are still reading. The
	 * check is DOM-based on purpose: `ExerciseCard` renders a
	 * `[data-exercise-id]` section, which avoids importing every lesson's raw
	 * MDX just to look for a tag. The effect re-runs when the slug changes so
	 * lesson-to-lesson navigation pre-warms the new page and releases the old
	 * worker.
	 */
	$effect(() => {
		const current = lesson;
		if (!current) return;

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

	const position = $derived.by(() => {
		if (!lesson) return { index: 0, total: lessonsInOrder.length };
		const index = lessonsInOrder.findIndex((entry) => entry.slug === lesson.slug);
		return { index: index + 1, total: lessonsInOrder.length };
	});

	const previousLesson = $derived(lessonsInOrder[position.index - 2]);
	const nextLesson = $derived(lessonsInOrder[position.index]);
</script>

<svelte:head>
	{#if lesson}
		<title>{lesson.frontmatter.title} — Silicon Path</title>
		<meta
			name="description"
			content="{lesson.frontmatter.title}: {lesson.module.blurb}"
		/>
	{/if}
</svelte:head>

{#if lesson}
	<!-- The title, then the body flows straight underneath so the first paragraph
	     sits close to the title. No scroll snapping: the window scrolls freely.
	     The body is far taller than the viewport, so its observer uses threshold 0
	     — a 10% intersection ratio of a multi-screen element could never be reached. Previous / next live at the
	     very end of the lesson, not between the title and the text. -->
	<article class="mx-auto w-full max-w-[72ch] px-6 py-8 lg:px-12 lg:py-10">
		<section use:inview>
			<div class="fade-text">
				<LessonHeader {lesson} {position} />
			</div>
		</section>

		{#key lesson.slug}
			<section class="prose-path mt-6" use:inview={{ threshold: 0 }} use:revealParagraphs>
				<div class="fade-text">
					<lesson.component />
				</div>
			</section>
		{/key}

		<LessonPager
			previous={previousLesson && {
				slug: previousLesson.slug,
				title: previousLesson.frontmatter.title
			}}
			next={nextLesson && { slug: nextLesson.slug, title: nextLesson.frontmatter.title }}
		/>
	</article>
{:else}
	<div class="mx-auto w-full max-w-[72ch] px-6 py-16 lg:px-12">
		<h1 class="text-h1 text-slate">Lesson not found</h1>
		<p class="mt-3 text-body text-dark-gray">
			That lesson does not exist yet. The dashboard lists everything that is written.
		</p>
		<a href={resolve('/')} class="btn-editorial mt-8">Back to the dashboard</a>
	</div>
{/if}
