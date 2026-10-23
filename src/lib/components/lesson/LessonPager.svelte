<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowLeft, ArrowRight } from '@lucide/svelte';

	/**
	 * Previous / next reading links, placed at the very end of a page.
	 *
	 * Shared by the CST1500 lessons and the C Handbook chapters so both reading
	 * tracks end with the same quiet footer; `base` selects the route family.
	 */
	export interface PagerEntry {
		slug: string;
		title: string;
	}

	interface Props {
		previous?: PagerEntry;
		next?: PagerEntry;
		base?: 'lesson' | 'handbook';
	}

	let { previous, next, base = 'lesson' }: Props = $props();

</script>

{#if previous || next}
	<nav aria-label="Reading navigation" class="mt-12 flex flex-col items-stretch gap-px bg-gray/40 sm:flex-row">
		{#if previous}
			<a
				href={resolve(base === 'handbook' ? '/handbook/[slug]' : '/lesson/[...slug]', {
					slug: previous.slug
				})}
				class="group flex min-w-0 flex-1 flex-col gap-1 bg-ivory px-6 py-5 transition-colors duration-200 hover:bg-ivory-med"
			>
				<span class="inline-flex items-center gap-1.5 text-micro text-muted-text">
					<ArrowLeft size={12} strokeWidth={1.5} aria-hidden="true" /> Previous
				</span>
				<span class="block max-w-full truncate text-small text-slate">
					{previous.title}
				</span>
			</a>
		{/if}

		{#if next}
			<a
				href={resolve(base === 'handbook' ? '/handbook/[slug]' : '/lesson/[...slug]', {
					slug: next.slug
				})}
				class="group flex min-w-0 flex-1 flex-col gap-1 bg-ivory px-6 py-5 text-right transition-colors duration-200 hover:bg-ivory-med"
			>
				<span class="inline-flex items-center justify-end gap-1.5 text-micro text-muted-text">
					Next <ArrowRight size={12} strokeWidth={1.5} aria-hidden="true" />
				</span>
				<span class="block max-w-full truncate text-small text-slate">
					{next.title}
				</span>
			</a>
		{/if}
	</nav>
{/if}