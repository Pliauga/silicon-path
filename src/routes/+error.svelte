/**
 * Route-level error page. With `ssr = false` this is mostly reached through
 * `+error.svelte` boundaries and missing static files; it stays deliberately
 * plain — one headline, one sentence, one way back.
 */
<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

const status = $derived(page.status);
const heading = $derived(
	status === 404 ? 'This page does not exist' : 'Something went wrong'
);
const detail = $derived(
	status === 404
		? 'The lesson or route you asked for is not part of the course yet.'
		: 'The app hit an unexpected error. Reloading usually clears it.'
);
</script>

<svelte:head>
	<title>{heading} — Silicon Path</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-[72ch] flex-col items-start px-6 py-16 lg:px-12">
	<p class="mb-4 font-mono text-micro tabular-nums text-clay-ink">{status}</p>
	<h1 class="text-h2 text-slate">{heading}</h1>
	<p class="mt-3 max-w-[52ch] text-body leading-[1.55] text-dark-gray">{detail}</p>

	{#if page.error?.message}
		<pre
			class="mt-6 w-full overflow-x-auto bg-ivory-med p-3 font-mono text-micro text-muted-text">{page.error.message}</pre>
	{/if}

	<a href={resolve('/')} class="btn-editorial mt-8">Back to the dashboard</a>
</div>