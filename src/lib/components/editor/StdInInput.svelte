<script lang="ts">
	/**
	 * Standard input for the program.
	 *
	 * A plain textarea: whatever the student types is fed to `scanf`/`getchar`
	 * byte by byte until EOF. Hidden behind a disclosure so the common case
	 * (programs that need no input) isn't cluttered with an empty box.
	 */
	interface Props {
		value?: string;
		onchange?: (value: string) => void;
	}

	let { value = $bindable(''), onchange }: Props = $props();

	// Several cards can sit on one page (worksheets), so ids must be per-instance.
	const uid = $props.id();
	const panelId = `stdin-panel-${uid}`;
	const textareaId = `stdin-textarea-${uid}`;

	let open = $state(false);
	let hasInput = $derived(value.trim().length > 0);

	function handleInput(event: Event): void {
		const next = (event.currentTarget as HTMLTextAreaElement).value;
		value = next;
		onchange?.(next);
	}
</script>

<div class="bg-ivory-med">
	<button
		type="button"
		class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-small text-dark-gray transition-colors duration-200 hover:text-slate"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-controls={panelId}
	>
		<span>Standard input</span>
		<span class="font-mono text-micro tracking-[0.06em] text-muted-text uppercase">
			{hasInput ? 'provided' : open ? 'hide' : 'none'}
		</span>
	</button>

	{#if open}
		<div id={panelId} class="border-t border-gray/40 px-3 py-3">
			<label for={textareaId} class="font-mono text-micro tracking-[0.06em] text-muted-text uppercase">
				Fed to the program until EOF
			</label>
			<textarea
				id={textareaId}
				class="mt-2 h-24 w-full resize-y rounded-[var(--radius-input)] border-0 bg-ivory p-2 font-mono text-code leading-[1.65] text-slate"
				spellcheck="false"
				autocomplete="off"
				placeholder="42, 7, hello"
				{value}
				oninput={handleInput}
			></textarea>
		</div>
	{/if}
</div>