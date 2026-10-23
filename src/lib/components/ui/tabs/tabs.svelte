<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Tabs } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	/**
	 * Owned tabs primitive: a hairline underline marks the active tab, with the
	 * accent reserved for the indicator only (§5.1 "one accent colour").
	 */
	interface Item {
		value: string;
		label: string;
		/** Panel content, rendered lazily when the tab is selected. */
		content?: Snippet;
	}

	interface Props {
		/** Two-way selected value. */
		value: string;
		items: Item[];
		label: string;
		class?: string;
	}

	let { value = $bindable(), items, label, class: className }: Props = $props();
</script>

<Tabs.Root bind:value class={cn('flex w-full flex-col gap-4', className)}>
	<Tabs.List
		aria-label={label}
		class="flex items-center gap-6 border-b border-gray pb-0"
	>
		{#each items as item (item.value)}
			<Tabs.Trigger
				value={item.value}
				class="relative -mb-px border-b-2 border-transparent pb-2.5 text-small text-muted-text transition-colors duration-200 hover:text-slate data-[state=active]:border-slate data-[state=active]:text-slate"
			>
				{item.label}
			</Tabs.Trigger>
		{/each}
	</Tabs.List>

	{#each items as item (item.value)}
		<Tabs.Content value={item.value} class="focus-visible:outline-none">
			{@render item.content?.()}
		</Tabs.Content>
	{/each}
</Tabs.Root>