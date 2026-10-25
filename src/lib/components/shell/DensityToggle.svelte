<script lang="ts">
	import { Rows3, Rows4 } from '@lucide/svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { cn } from '$lib/utils/cn';

	/**
	 * Switches `data-density` on `<html>` between comfortable and dense and
	 * persists the choice. Density is an accessibility control, not a style
	 * flourish: some readers need generous space to keep their place, others
	 * want more of the page in view at once. The tokens it drives are defined in
	 * `app.css` ("Density — a dial, not a fixed value").
	 *
	 * One toggle button. The accessible name is constant ("Dense spacing") and
	 * `aria-pressed` carries the state; a label that also flipped would make a
	 * screen reader announce a contradiction ("Switch to comfortable, pressed").
	 */
	interface Props {
		class?: string;
		/** Show the text label beside the icon. */
		showLabel?: boolean;
	}

	let { class: className, showLabel = false }: Props = $props();

	const isDense = $derived(settings.density === 'dense');
	const label = 'Dense spacing';
	const hint = $derived(isDense ? 'Dense spacing is on. Click for comfortable.' : 'Click for dense spacing.');
</script>

<button
	type="button"
	onclick={() => settings.toggleDensity()}
	aria-label={label}
	aria-pressed={isDense}
	title={hint}
	class={cn(
		'inline-flex items-center gap-2 px-2 py-1.5 text-small text-muted-text',
		'transition-colors duration-200 hover:text-slate',
		className
	)}
>
	{#if isDense}
		<Rows4 size={15} strokeWidth={1.75} aria-hidden="true" />
	{:else}
		<Rows3 size={15} strokeWidth={1.75} aria-hidden="true" />
	{/if}
	{#if showLabel}
		<span>{isDense ? 'Dense' : 'Comfortable'}</span>
	{/if}
</button>
