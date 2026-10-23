<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { handbookMeta } from '$lib/content/handbook-meta';
	import { progress } from '$lib/stores/progress.svelte';
	import { cn } from '$lib/utils/cn';

	/**
	 * The C Handbook's chapter list for the drawer. It is deliberately flatter
	 * than ModuleNav: twenty chapters, one per row, in reading order — the rail
	 * and the prev/next pager carry the rest of the orientation.
	 */
	interface Props {
		/** Called after a navigation choice, e.g. to close the mobile drawer. */
		onNavigate?: () => void;
	}

	let { onNavigate }: Props = $props();

	const activeSlug = $derived(
		page.url.pathname.startsWith('/handbook/') ? page.url.pathname.split('/').pop() : undefined
	);
</script>

<nav aria-label="C Handbook chapters" class="flex flex-col">
	<ol class="m-0 list-none p-0">
		{#each handbookMeta as chapter, index (chapter.slug)}
			{@const active = activeSlug === chapter.slug}
			{@const done = progress.isComplete(`handbook/${chapter.slug}`)}
			<li>
				<a
					href={resolve('/handbook/[slug]', { slug: chapter.slug })}
					onclick={() => onNavigate?.()}
					aria-current={active ? 'page' : undefined}
					class={cn(
						'flex items-baseline gap-3 px-8 py-1.5 text-small leading-[1.35]',
						'transition-colors duration-200 hover:text-slate',
						active ? 'font-bold text-slate' : 'text-dark-gray'
					)}
				>
					<span class="w-5 shrink-0 font-mono text-micro tabular-nums text-muted-text">
						{String(index + 1).padStart(2, '0')}
					</span>
					<span class="min-w-0 truncate">{chapter.title}</span>
					{#if done}
						<span class="ml-auto shrink-0 font-mono text-micro text-teal-ink" aria-hidden="true">✓</span>
						<span class="sr-only">completed</span>
					{/if}
				</a>
			</li>
		{/each}
	</ol>
</nav>