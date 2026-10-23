<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Tooltip } from 'bits-ui';

	/** Mounted once in the root layout; every tooltip below inherits it. */
	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<Tooltip.Provider delayDuration={200}>
	{@render children()}
</Tooltip.Provider>