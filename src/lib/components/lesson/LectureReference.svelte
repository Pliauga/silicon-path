<script lang="ts">
	import { Layers } from '@lucide/svelte';

	/**
	 * Points a lesson back at the slide deck it came from. Deliberately a
	 * footer element, not a banner: it is reference material, not a warning.
	 */
	interface Props {
		/** Exact deck title, e.g. "Lecture 01 — Data Representation 1". */
		lecture: string;
		/** Slide range, e.g. "5–17". */
		slides: string;
	}

	let { lecture, slides }: Props = $props();
</script>

<footer
	class="mt-10 flex items-start gap-3 border-t border-gray pt-5"
	aria-label="Source lecture"
>
	<Layers size={14} strokeWidth={1.5} aria-hidden="true" class="mt-0.5 shrink-0 text-muted-text" />
	<div class="min-w-0">
		<p class="text-micro text-muted-text">Read alongside</p>
		<p class="mt-0.5 text-small text-dark-gray">
			{lecture}
			{#if slides !== 'supplementary'}
				<span class="font-mono text-micro text-muted-text">· slides {slides}</span>
			{/if}
		</p>
	</div>
</footer>