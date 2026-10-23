<script lang="ts">
	import { Toaster } from 'svelte-sonner';
	import { settings } from '$lib/stores/settings.svelte';

	/**
	 * Mounted once in the layout. Colours come from the design tokens rather
	 * than svelte-sonner's defaults so a toast never looks like a different app.
	 */
</script>

<Toaster
	position="bottom-right"
	theme={settings.theme}
	offset={16}
	toastOptions={{
		style: 'background: var(--bg-raised); color: var(--text-primary); border: 0; border-radius: 0; font-family: var(--font-sans); font-size: var(--text-small);'
	}}
/>
