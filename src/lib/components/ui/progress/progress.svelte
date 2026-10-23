<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Progress } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	/**
	 * A thin determinate progress bar. 2px tall by default so it reads as a
	 * hairline measurement rather than a chunky widget.
	 */
	interface Props {
		/** 0–100. */
		value: number;
		/** Accessible label; required because there is no visible text. */
		label: string;
		class?: string;
		/** Track thickness in pixels. */
		height?: number;
		children?: Snippet;
	}

	let { value, label, class: className, height = 2, children }: Props = $props();

	const clamped = $derived(Math.max(0, Math.min(100, value)));
</script>

<Progress.Root
	{value}
	max={100}
	aria-label={label}
	class={cn('relative w-full overflow-hidden bg-gray/30', className)}
	style="height: {height}px"
>
	{#if children}
		{@render children()}
	{:else}
		<div
			class="h-full bg-slate transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)] motion-reduce:transition-none"
			style="width: {clamped}%"
		></div>
	{/if}
</Progress.Root>