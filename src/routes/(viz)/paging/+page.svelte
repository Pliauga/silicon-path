<script lang="ts">
	import { resolve } from '$app/paths';
	import VirtualMemory3D from '$lib/components/viz/VirtualMemory3D.svelte';
</script>

<svelte:head>
	<title>Silicon Path — Virtual Memory</title>
	<meta
		name="description"
		content="An interactive 3D study of paging: sixteen physical frames, twenty disk pages, and a memory controller swapping pages under LRU or FIFO."
	/>
</svelte:head>

<div class="paging-page">
	<header class="topbar">
		<a class="brand" href={resolve('/')} aria-label="Silicon Path, back to the CPU study">
			<span class="brand-mark" aria-hidden="true"></span>
			<span class="brand-word">Silicon Path</span>
		</a>
		<div class="topbar-meta" aria-hidden="true">
			<span>Prototype / 02</span>
			<span class="topbar-sep"></span>
			<span>Virtual memory</span>
		</div>
		<a class="topbar-link" href={resolve('/')}>CPU study <span aria-hidden="true">↗</span></a>
	</header>

	<main>
		<VirtualMemory3D />
	</main>
</div>

<style>
	:global(html) {
		background: var(--rubin-ivory);
	}

	:global(body) {
		margin: 0;
		background: var(--rubin-ivory);
		overflow-x: hidden;
	}

	.paging-page {
		--bg: var(--rubin-ivory);
		--vm3d-top: 4.25rem;
		position: relative;
		--ink: var(--rubin-slate);
		--muted: var(--rubin-muted);
		--faint: var(--rubin-muted);
		--line: rgba(138, 130, 116, 0.42);
		--accent: var(--rubin-clay);
		min-height: 100svh;
		background: var(--bg);
		color: var(--ink);
		font-family: var(--font-sans);
	}

	.paging-page *,
	.paging-page *::before,
	.paging-page *::after {
		box-sizing: border-box;
	}

	.topbar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		height: 4.25rem;
		padding: 0 clamp(1.2rem, 5vw, 5rem);
		border-bottom: 1px solid rgba(138, 130, 116, 0.3);
		background: color-mix(in srgb, var(--rubin-ivory) 78%, transparent);
		backdrop-filter: blur(14px);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.7rem;
		color: var(--ink);
		text-decoration: none;
	}

	.brand-mark {
		width: 8px;
		height: 8px;
		border: 1px solid var(--accent);
		transform: rotate(45deg);
	}

	.brand-word {
		font-size: 0.62rem;
		font-weight: 500;
		letter-spacing: 0.24em;
		text-transform: uppercase;
	}

	.topbar-meta {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		margin-left: auto;
		color: var(--faint);
		font-family: var(--font-mono);
		font-size: 0.5rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	.topbar-sep {
		width: 1.8rem;
		height: 1px;
		background: var(--line);
	}

	.topbar-link {
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 0.5rem;
		letter-spacing: 0.13em;
		text-decoration: none;
		text-transform: uppercase;
		white-space: nowrap;
		transition: color 0.2s ease;
	}

	.topbar-link:hover {
		color: var(--accent);
	}

	@media (max-width: 860px) {
		.paging-page {
			--vm3d-top: 3.5rem;
		}
	}

	@media (max-width: 760px) {
		.topbar {
			height: 3.5rem;
			padding: 0 1.1rem;
		}

		.topbar-meta {
			display: none;
		}

		.topbar-link {
			margin-left: auto;
		}
	}
</style>
