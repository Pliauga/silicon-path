<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, Clock } from '@lucide/svelte';
	import { handbookMeta } from '$lib/content/handbook-meta';
	import { inview } from '$lib/actions/inview';

	/**
	 * The C Handbook index: a second, independent reading track. It is a plain
	 * editorial table of contents — number, title, practice hint, reading time —
	 * and nothing about the CST1500 module list appears here.
	 */
	const firstChapter = handbookMeta[0];
</script>

<svelte:head>
	<title>The C Handbook — Silicon Path</title>
	<meta
		name="description"
		content="Twenty chapters on the C language itself: the memory model, pointers, strings, structures and the preprocessor, each paired with runnable exercises."
	/>
</svelte:head>

<article class="mx-auto w-full max-w-[72ch] px-6 py-8 lg:px-12 lg:py-10">
	<section use:inview>
		<div class="fade-text">
			<p class="mb-2 font-mono text-micro tracking-[0.06em] text-clay-ink uppercase">
				C Handbook — Twenty chapters
			</p>
			<h1 class="text-h1 leading-[1.1] text-slate">The C Handbook</h1>
			<p class="mt-4 max-w-[64ch] text-body leading-[1.65] text-dark-gray">
				The CST1500 modules explain the machine. This handbook explains the language that drives it,
				one chapter at a time: source to executable, expressions to pointers, structures to the
				preprocessor. Every chapter shows the same idea through money and through football, ships a
				complete program, and ends with three exercises you can run in the browser.
			</p>
			{#if firstChapter}
				<a
					href={resolve('/handbook/[slug]', { slug: firstChapter.slug })}
					class="btn-clay mt-6 inline-flex items-center gap-2"
				>
					Start with {firstChapter.title}
					<ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
				</a>
			{/if}
		</div>
	</section>

	<ol class="mt-10 list-none border-t border-gray/40 p-0">
		{#each handbookMeta as chapter, index (chapter.slug)}
			<li>
				<a
					href={resolve('/handbook/[slug]', { slug: chapter.slug })}
					class="group grid grid-cols-[2rem_1fr_auto] items-baseline gap-3 border-b border-gray/40 py-4"
				>
					<span class="font-mono text-micro text-muted-text tabular-nums">
						{String(index + 1).padStart(2, '0')}
					</span>
					<span class="min-w-0">
						<span class="block text-small text-slate transition-colors duration-200 group-hover:text-clay-ink">
							{chapter.title}
						</span>
						{#if chapter.hasExercise}
							<span class="mt-0.5 block font-mono text-micro tracking-[0.06em] text-muted-text uppercase">
								Practice included
							</span>
						{/if}
					</span>
					<span class="inline-flex items-center gap-1.5 text-micro text-muted-text">
						<Clock size={12} strokeWidth={1.5} aria-hidden="true" />
						{chapter.estimatedMinutes} min
					</span>
				</a>
			</li>
		{/each}
	</ol>
</article>