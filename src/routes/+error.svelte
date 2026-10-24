<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import { page } from '$app/state';

	/**
	 * Route-level error page. A 404 gets the full "Signal Lost" treatment: the
	 * technical-manual plate behind a dark veil. Any other status stays plain,
	 * because "this timeline does not exist" would be the wrong joke for a crash.
	 */
	const status = $derived(page.status);
	const isMissing = $derived(status === 404);

	const cover = asset('/images/technical-manual-cover.jpg');
</script>

<svelte:head>
	<title>{isMissing ? 'Signal Lost' : 'Something went wrong'} — Silicon Path</title>
</svelte:head>

{#if isMissing}
	<!-- Covers the reading area but leaves the rail and mobile bar reachable, so the
	     way back is never only one button. The veil is fixed dark in both themes. -->
	<div class="lost" style:--cover="url({cover})">
		<div class="lost-body">
			<p class="lost-kicker">ERROR 404</p>
			<h1 class="lost-title">Signal Lost.</h1>
			<p class="lost-copy">The page you're looking for doesn't exist in this timeline.</p>
			<a href={resolve('/')} class="btn-editorial btn-clay lost-action">Return to Safety</a>
		</div>
	</div>
{:else}
	<div class="mx-auto flex w-full max-w-[72ch] flex-col items-start px-6 py-16 lg:px-12">
		<p class="mb-4 font-mono text-micro tabular-nums text-clay-ink">{status}</p>
		<h1 class="text-h2 text-slate">Something went wrong</h1>
		<p class="mt-3 max-w-[52ch] text-body leading-[1.55] text-dark-gray">
			The app hit an unexpected error. Reloading usually clears it.
		</p>

		{#if page.error?.message}
			<pre
				class="mt-6 w-full overflow-x-auto bg-ivory-med p-3 font-mono text-micro text-muted-text">{page.error.message}</pre>
		{/if}

		<a href={resolve('/')} class="btn-editorial mt-8">Back to the dashboard</a>
	</div>
{/if}

<style>
	/* Local palette: this screen is dark whatever the theme, so it cannot borrow the
	   tokens that flip. Worst case (a white pixel under the veil, #373634):
	   title 9.8:1, copy 6.9:1, kicker 5.0:1. */
	.lost {
		--lost-title: #ebe7df;
		--lost-copy: #c9c3bb;
		--lost-kicker: #ec8e73;

		position: fixed;
		inset: 3rem 0 0 0;
		z-index: 20;
		display: grid;
		place-items: center;
		padding: 1.5rem;
		text-align: center;
		background-image: var(--cover);
		background-size: cover;
		background-position: center 42%;
		background-repeat: no-repeat;
	}

	/* The veil is its own layer so it is a plain colour, not a gradient. */
	.lost::before {
		content: '';
		position: absolute;
		inset: 0;
		background-color: rgba(20, 18, 16, 0.85);
	}

	.lost-body {
		position: relative;
	}

	@media (min-width: 1024px) {
		.lost {
			inset: 0 0 0 2.5rem;
		}
	}

	.lost-body {
		display: flex;
		max-width: 36rem;
		flex-direction: column;
		align-items: center;
	}

	.lost-kicker {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.24em;
		color: var(--lost-kicker);
	}

	.lost-title {
		margin: 1rem 0 0;
		font-family: var(--font-display);
		font-weight: 400;
		font-size: clamp(3.25rem, 11vw, 6.25rem);
		line-height: 1.02;
		letter-spacing: -0.01em;
		color: var(--lost-title);
	}

	.lost-copy {
		margin: 1.5rem 0 0;
		max-width: 34ch;
		font-family: var(--font-sans);
		font-size: 1.0625rem;
		line-height: 1.6;
		color: var(--lost-copy);
		text-wrap: balance;
	}

	.lost-action {
		margin-top: 2.5rem;
		padding: 0.8125rem 1.5rem;
		letter-spacing: 0.04em;
	}
</style>
