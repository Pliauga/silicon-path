<script lang="ts">
	import { resolve } from '$app/paths';
	import ProcessScheduler3D from '$lib/components/viz/ProcessScheduler3D.svelte';
</script>

<svelte:head>
	<title>Silicon Path — Process Scheduler</title>
	<meta
		name="description"
		content="An interactive 3D scheduler: watch processes queue, run on a single core, block on I/O, and retire under FCFS, SJF, and Round Robin dispatch."
	/>
</svelte:head>

<div class="page">
	<header class="bar">
		<a class="brand" href={resolve('/')} aria-label="Silicon Path, CPU study">
			<span class="brand-mark" aria-hidden="true"></span>
			<span class="brand-word">Silicon Path</span>
		</a>
		<p class="bar-meta" aria-hidden="true">
			<span>Prototype / 02</span>
			<span class="bar-sep"></span>
			<span>Process scheduling</span>
		</p>
		<a class="bar-link" href={resolve('/')}>CPU study <span aria-hidden="true">↗</span></a>
	</header>

	<main>
		<ProcessScheduler3D />
	</main>
</div>

<style>
	:global(html) {
		background: var(--rubin-ivory);
	}

	:global(body) {
		margin: 0;
		background: var(--rubin-ivory);
	}

	:global(::selection) {
		background: rgba(217, 119, 87, 0.3);
		color: var(--rubin-slate);
	}

	.page {
		min-height: 100svh;
		background: var(--rubin-ivory);
		color: var(--rubin-slate);
		font-family: var(--font-sans);
		-webkit-font-smoothing: antialiased;
		text-rendering: optimizeLegibility;
	}

	.bar {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 4.25rem;
		padding: 0 clamp(1.25rem, 5vw, 5rem);
		backdrop-filter: blur(14px);
		background: color-mix(in srgb, var(--rubin-ivory) 72%, transparent);
		border-bottom: 1px solid rgba(138, 130, 116, 0.3);
		font-family: var(--font-mono);
		font-size: 0.55rem;
		letter-spacing: 0.17em;
		line-height: 1;
		text-transform: uppercase;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.65rem;
		color: var(--rubin-slate);
		text-decoration: none;
	}

	.brand-mark {
		width: 13px;
		height: 13px;
		border: 1px solid rgba(217, 119, 87, 0.9);
		box-shadow:
			inset 0 0 0 3px var(--rubin-ivory),
			inset 0 0 0 4px rgba(43, 130, 114, 0.5);
		transform: rotate(45deg);
	}

	.brand-word {
		font-size: 0.6rem;
		letter-spacing: 0.22em;
	}

	.bar-meta {
		position: absolute;
		left: 50%;
		display: inline-flex;
		align-items: center;
		gap: 0.8rem;
		margin: 0;
		color: var(--rubin-muted);
		transform: translateX(-50%);
	}

	.bar-sep {
		width: 1.6rem;
		height: 1px;
		background: rgba(138, 130, 116, 0.5);
	}

	.bar-link {
		color: var(--rubin-muted);
		text-decoration: none;
		transition: color 0.25s ease;
	}

	.bar-link span {
		color: var(--rubin-clay-ink);
	}

	.bar-link:hover,
	.bar-link:focus-visible {
		color: var(--rubin-slate);
	}

	main {
		padding-top: 4.25rem;
	}

	@media (max-width: 720px) {
		.bar-meta {
			display: none;
		}
	}
</style>