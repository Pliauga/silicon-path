<script lang="ts">
	import { Moon, Sun } from '@lucide/svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { cn } from '$lib/utils/cn';

	/**
	 * Switches `data-theme` on `<html>` between light and dark ("Dark Academia")
	 * and persists the choice. A first visit follows `prefers-color-scheme`,
	 * otherwise light; after that the stored choice always wins.
	 */
	interface Props {
		class?: string;
		/** Show the text label beside the icon. */
		showLabel?: boolean;
	}

	let { class: className, showLabel = false }: Props = $props();

	const isDark = $derived(settings.theme === 'dark');
	const nextLabel = $derived(isDark ? 'Switch to light theme' : 'Switch to dark theme');
</script>

<button
	type="button"
	onclick={() => settings.toggleTheme()}
	aria-label={nextLabel}
	aria-pressed={isDark}
	title={nextLabel}
	class={cn(
		'inline-flex items-center gap-2 px-2 py-1.5 text-small text-muted-text',
		'transition-colors duration-200 hover:text-slate',
		className
	)}
>
	{#if isDark}
		<Moon size={15} strokeWidth={1.75} aria-hidden="true" />
	{:else}
		<Sun size={15} strokeWidth={1.75} aria-hidden="true" />
	{/if}
	{#if showLabel}
		<span>{isDark ? 'Night reading' : 'Daylight'}</span>
	{/if}
</button>
