<script lang="ts">
	/** The primary action of the playground. Enter always means "compile". */
	import { Loader, Play } from '@lucide/svelte';

	interface Props {
		onrun: () => void;
		busy?: boolean;
		disabled?: boolean;
	}

	let { onrun, busy = false, disabled = false }: Props = $props();
</script>

<button
	type="button"
	class="btn-editorial btn-clay px-4 py-3"
	onclick={onrun}
	disabled={disabled || busy}
	aria-busy={busy}
>
	{#if busy}
		<Loader size={14} strokeWidth={1.5} class="animate-spin" aria-hidden="true" />
		Running…
	{:else}
		<Play size={14} strokeWidth={1.5} aria-hidden="true" />
		Run
	{/if}
</button>