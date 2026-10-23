<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Command } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	/**
	 * A keyboard-first command list. Filtering, arrow-key navigation, and
	 * `Enter` selection come from `bits-ui`; this wrapper owns the visual shell.
	 *
	 * Rendered two ways: inside a `Dialog` for Cmd/Ctrl+K, or inline on a page.
	 */
	interface Item {
		value: string;
		label: string;
		/** Optional trailing hint, e.g. a route path. */
		hint?: string;
		onSelect: () => void;
	}

	interface Group {
		heading: string;
		items: Item[];
	}

	interface Props {
		groups: Group[];
		label: string;
		placeholder?: string;
		class?: string;
		/** Extra footer node, e.g. a hint about the escape key. */
		footer?: Snippet;
	}

	let { groups, label, placeholder = 'Type a command…', class: className, footer }: Props = $props();

	let selected = $state('');
</script>

<Command.Root {label} bind:value={selected} class={cn('flex flex-col', className)}>
	<div class="flex items-center gap-2 border-b border-gray px-4">
		<Command.Input
			{placeholder}
			class="h-12 w-full bg-transparent text-small text-slate placeholder:text-muted-text focus:outline-none"
		/>
	</div>

	<Command.List class="max-h-80 overflow-y-auto p-2">
		<Command.Empty class="px-3 py-6 text-center text-small text-muted-text">
			No matching command.
		</Command.Empty>

		{#each groups as group (group.heading)}
			{#if group.items.length > 0}
				<Command.Group value={group.heading}>
					<Command.GroupHeading class="px-2 pt-3 pb-1 text-micro tracking-[0.06em] text-muted-text uppercase">
						{group.heading}
					</Command.GroupHeading>
					<Command.GroupItems>
						{#each group.items as item (item.value)}
							<Command.Item
								value={item.value}
								keywords={[item.label, item.hint ?? '']}
								onSelect={() => item.onSelect()}
								class="flex cursor-pointer items-center justify-between gap-4 px-2 py-2 text-small text-dark-gray data-[selected=true]:bg-ivory-dark data-[selected=true]:text-slate"
							>
								<span>{item.label}</span>
								{#if item.hint}
									<span class="font-mono text-micro text-muted-text">{item.hint}</span>
								{/if}
							</Command.Item>
						{/each}
					</Command.GroupItems>
				</Command.Group>
			{/if}
		{/each}
	</Command.List>

	{#if footer}
		<div class="border-t border-gray px-4 py-2 text-micro text-muted-text">
			{@render footer()}
		</div>
	{/if}
</Command.Root>