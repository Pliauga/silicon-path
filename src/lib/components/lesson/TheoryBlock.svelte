<script lang="ts">
	import type { Snippet } from 'svelte';
	import { BookOpen } from '@lucide/svelte';

	/**
	 * A framed aside for the "why this matters" hardware connection. It is the
	 * one place the app is allowed to interrupt prose, so it must earn it: a
	 * label, a title, and a short body the author supplies inline in MDX.
	 */
	interface Props {
		/** Small caps label, e.g. "Why it matters". */
		label?: string;
		/** Optional headline for the block. */
		title?: string;
		children: Snippet;
	}

	let { label = 'Why it matters', title, children }: Props = $props();
</script>

<aside
	class="callout callout-clay my-6"
	aria-label={label}
>
	<p class="mb-3 flex items-center gap-1.5 font-mono text-micro tracking-[0.06em] text-clay-ink uppercase">
		<BookOpen size={12} strokeWidth={1.5} aria-hidden="true" />
		{label}
	</p>
	{#if title}
		<p class="mb-3 font-display text-h3 leading-[1.3] text-slate">{title}</p>
	{/if}
	<div class="text-body leading-[1.55] text-slate">
		{@render children()}
	</div>
</aside>