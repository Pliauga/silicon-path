<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dialog } from 'bits-ui';
	import { cn } from '$lib/utils/cn';

	/**
	 * A centred modal with a backdrop. Used by the command palette and by the
	 * mobile drawer, so it owns focus trapping, escape-to-close, and scroll lock.
	 *
	 * Uses `bits-ui`'s dialog parts directly rather than hand-rolling: §8 says
	 * prefer `<dialog>` / owned accessible primitives over custom modals — this
	 * is the owned primitive.
	 */
	interface Props {
		open: boolean;
		onOpenChange?: (open: boolean) => void;
		/** Accessible name for the dialog. */
		label: string;
		children: Snippet;
		class?: string;
		/** Dialogs that hold a text input use `top` positioning. */
		position?: 'center' | 'top';
	}

	let { open = $bindable(), onOpenChange, label, children, class: className, position = 'center' }: Props =
		$props();
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-40 bg-ivory/80 data-[state=open]:animate-in data-[state=open]:fade-in"
		/>
		<Dialog.Content
			aria-label={label}
			aria-describedby={undefined}
			class={cn(
				'fixed left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 bg-ivory-med focus:outline-none',
				position === 'top' ? 'top-[15vh]' : 'top-1/2 -translate-y-1/2',
				className
			)}
		>
			{@render children()}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>