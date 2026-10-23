<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Tooltip } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	/**
	 * A small, keyboard-inclusive tooltip. The provider is mounted once in the
	 * root layout, so this wrapper only owns the trigger and the bubble.
	 */
	interface Props {
		/** The tooltip body. */
		text: string;
		/** The trigger content. */
		children: Snippet;
		/** Extra classes for the trigger wrapper. */
		class?: string;
		/** Which side the bubble appears on. */
		side?: 'top' | 'right' | 'bottom' | 'left';
	}

	let { text, children, class: className, side = 'top' }: Props = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger class={cn('inline-flex', className)}>
		{@render children()}
	</Tooltip.Trigger>
	<Tooltip.Portal>
		<Tooltip.Content
			{side}
			sideOffset={6}
			class="z-50 max-w-64 bg-slate px-2.5 py-1.5 text-micro text-ivory"
		>
			{text}
		</Tooltip.Content>
	</Tooltip.Portal>
</Tooltip.Root>