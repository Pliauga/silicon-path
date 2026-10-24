<script lang="ts">
	import { resolve } from '$app/paths';
	import MemoryHierarchy3D from '$lib/components/viz/MemoryHierarchy3D.svelte';
</script>

<svelte:head>
	<title>Silicon Path — Memory Hierarchy</title>
	<meta
		name="description"
		content="A scroll-driven study of the memory hierarchy: follow a data packet from hard drive, through DDR5 and L3 cache, to the register file."
	/>
</svelte:head>

<div class="memory-page">
	<header class="topbar">
		<a class="brand" href={resolve('/')} aria-label="Silicon Path, CPU package">
			<span class="brand-mark" aria-hidden="true"></span>
			<span class="brand-word">Silicon Path</span>
		</a>

		<nav class="route-nav" aria-label="Prototypes">
			<a href={resolve('/')}>01 Package</a>
			<span class="route-sep" aria-hidden="true"></span>
			<a href={resolve('/memory/')} aria-current="page">02 Memory</a>
		</nav>

		<p class="topbar-status">
			<span class="status-dot" aria-hidden="true"></span>
			Latency, made visible
		</p>
	</header>

	<main id="top">
		<MemoryHierarchy3D />

		<section class="closing" aria-labelledby="closing-title">
			<div class="closing-grid">
				<div class="closing-lede">
					<p class="section-kicker">03 / The path continues</p>
					<h2 id="closing-title">Fast memory<br />is small.</h2>
					<p>
						Registers hold a handful of values. Cache holds megabytes. DRAM holds gigabytes. A
						hard drive holds terabytes. Each step down is larger, cheaper, and hundreds of times
						slower. The hierarchy exists so the core almost never has to take that step.
					</p>
					<p class="closing-measure" aria-hidden="true">
						<span>~5.2 ms</span>
						<i></i>
						<span>~0.3 ns</span>
					</p>
				</div>

				<div class="closing-notes">
					<article>
						<span class="note-index">01</span>
						<h3>Locality is the trick</h3>
						<p>
							Programs reuse the same instructions and data. Temporal and spatial locality let a
							small, fast cache serve most requests. The hierarchy is a bet on that predictability.
						</p>
					</article>
					<article>
						<span class="note-index">02</span>
						<h3>An economic argument</h3>
						<p>
							SRAM is fast but dense and expensive; DRAM is cheaper per bit; magnetic storage is
							cheapest of all. Every level is a different trade between speed, capacity, and cost.
						</p>
					</article>
					<article>
						<span class="note-index">03</span>
						<h3>The scroll is the clock</h3>
						<p>
							The storage leg deliberately takes the longest. The cache leg orbits once, and the
							register load snaps in a fraction of a frame — the latency difference is the lesson.
						</p>
					</article>
				</div>
			</div>

			<div class="specs" aria-label="Model specifications">
				<div>
					<span class="spec-label">Geometry</span>
					<span class="spec-value">34k triangles</span>
				</div>
				<div>
					<span class="spec-label">Package</span>
					<span class="spec-value">396 KB</span>
				</div>
				<div>
					<span class="spec-label">Textures</span>
					<span class="spec-value">7 × KTX2</span>
				</div>
				<div>
					<span class="spec-label">Compression</span>
					<span class="spec-value">Draco + ETC1S</span>
				</div>
				<div>
					<span class="spec-label">Motion</span>
					<span class="spec-value">Scroll-linked</span>
				</div>
			</div>

			<footer class="footer">
				<p>Silicon Path · Interactive component prototype</p>
				<p class="footer-muted">Offline-first · accessible by design</p>
			</footer>
		</section>
	</main>
</div>

<style>
	:global(html) {
		background: var(--rubin-ivory);
		scroll-behavior: smooth;
	}

	:global(body) {
		margin: 0;
		background: var(--rubin-ivory);
	}

	:global(::selection) {
		background: rgba(43, 130, 114, 0.28);
		color: var(--rubin-slate);
	}

	.memory-page {
		min-height: 100svh;
		background: var(--rubin-ivory);
		color: var(--rubin-slate);
		font-family: var(--font-sans);
		-webkit-font-smoothing: antialiased;
		text-rendering: optimizeLegibility;
	}

	.topbar {
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
		pointer-events: none;
		background: linear-gradient(180deg, color-mix(in srgb, var(--rubin-ivory) 76%, transparent), transparent);
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
		pointer-events: auto;
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

	.route-nav {
		position: absolute;
		left: 50%;
		display: flex;
		align-items: center;
		gap: 1rem;
		color: var(--rubin-muted);
		transform: translateX(-50%);
		pointer-events: auto;
	}

	.route-nav a {
		color: var(--rubin-muted);
		text-decoration: none;
		transition: color 0.3s ease;
	}

	.route-nav a:hover,
	.route-nav a:focus-visible {
		color: var(--rubin-slate);
	}

	.route-nav a[aria-current='page'] {
		color: var(--rubin-clay-ink);
	}

	.route-sep {
		width: 1px;
		height: 0.7rem;
		background: rgba(138, 130, 116, 0.54);
	}

	.topbar-status {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		margin: 0;
		color: var(--rubin-muted);
		letter-spacing: 0.14em;
	}

	.status-dot {
		width: 4px;
		height: 4px;
		border-radius: 0;
		background: var(--rubin-teal);
	}

	.closing {
		position: relative;
		padding: clamp(5rem, 10vw, 9rem) clamp(1.25rem, 5vw, 5rem) 2rem;
		border-top: 1px solid rgba(138, 130, 116, 0.38);
		background: var(--rubin-ivory);
	}

	.closing::before {
		content: '';
		position: absolute;
		top: -1px;
		left: clamp(1.25rem, 5vw, 5rem);
		width: clamp(3rem, 8vw, 8rem);
		height: 1px;
		background: var(--rubin-teal);
	}

	.closing-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
		gap: clamp(3rem, 9vw, 10rem);
		max-width: 78rem;
		margin: 0 auto;
	}

	.section-kicker {
		margin: 0 0 1.6rem;
		color: var(--rubin-muted);
		font-family: var(--font-mono);
		font-size: 0.58rem;
		letter-spacing: 0.22em;
		line-height: 1.5;
		text-transform: uppercase;
	}

	.closing-lede h2 {
		margin: 0;
		color: var(--rubin-slate);
		font-size: clamp(2.9rem, 5.4vw, 5.6rem);
		font-weight: 500;
		letter-spacing: -0.045em;
		line-height: 0.98;
	}

	.closing-lede > p {
		max-width: 27rem;
		margin: 2rem 0 0;
		color: var(--rubin-muted);
		font-size: 0.96rem;
		letter-spacing: -0.011em;
		line-height: 1.65;
	}

	.closing-measure {
		display: flex;
		align-items: center;
		gap: 1rem;
		max-width: 20rem !important;
		margin-top: 2.4rem !important;
		color: var(--rubin-clay-ink) !important;
		font-family: var(--font-mono);
		font-size: 0.6rem !important;
		letter-spacing: 0.12em;
	}

	.closing-measure i {
		position: relative;
		flex: 1;
		height: 1px;
		background: rgba(138, 130, 116, 0.46);
	}

	.closing-measure i::after {
		content: '';
		position: absolute;
		top: -2px;
		right: 0;
		width: 5px;
		height: 5px;
		border-radius: 0;
		background: var(--rubin-teal);
	}

	.closing-notes {
		display: grid;
		align-content: start;
		gap: 0;
	}

	.closing-notes article {
		display: grid;
		grid-template-columns: 2.4rem minmax(0, 1fr);
		column-gap: 1rem;
		padding: 1.5rem 0 1.7rem;
		border-top: 1px solid rgba(138, 130, 116, 0.38);
	}

	.closing-notes article:last-child {
		border-bottom: 1px solid rgba(138, 130, 116, 0.38);
	}

	.note-index {
		grid-row: 1 / span 2;
		padding-top: 0.2rem;
		color: var(--rubin-clay-ink);
		font-family: var(--font-mono);
		font-size: 0.52rem;
		letter-spacing: 0.1em;
	}

	.closing-notes h3 {
		margin: 0;
		color: var(--rubin-slate);
		font-size: 1.02rem;
		font-weight: 500;
		letter-spacing: -0.014em;
		line-height: 1.4;
	}

	.closing-notes p {
		max-width: 28rem;
		margin: 0.45rem 0 0;
		color: var(--rubin-muted);
		font-size: 0.88rem;
		letter-spacing: -0.006em;
		line-height: 1.65;
	}

	.specs {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 1.5rem;
		max-width: 78rem;
		margin: clamp(4.5rem, 9vw, 8rem) auto 0;
		padding: 1.4rem 0;
		border-top: 1px solid rgba(138, 130, 116, 0.38);
		border-bottom: 1px solid rgba(138, 130, 116, 0.38);
	}

	.specs > div {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.spec-label {
		color: var(--rubin-muted);
		font-family: var(--font-mono);
		font-size: 0.5rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.spec-value {
		color: var(--rubin-dark-gray);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		line-height: 1.4;
	}

	.footer {
		display: flex;
		justify-content: space-between;
		gap: 1.5rem;
		max-width: 78rem;
		margin: 0 auto;
		padding: 1.5rem 0 0.4rem;
		color: var(--rubin-muted);
		font-family: var(--font-mono);
		font-size: 0.52rem;
		letter-spacing: 0.12em;
		line-height: 1.6;
		text-transform: uppercase;
	}

	.footer p {
		margin: 0;
	}

	.footer-muted {
		color: var(--rubin-muted);
	}

	@media (max-width: 900px) {
		.route-nav {
			left: 50%;
		}

		.topbar-status {
			display: none;
		}

		.closing-grid {
			grid-template-columns: 1fr;
			gap: 3.5rem;
		}

		.specs {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 1.4rem 1rem;
		}
	}

	@media (max-width: 620px) {
		.topbar {
			height: 3.6rem;
			padding: 0 1.25rem;
		}

		.route-nav {
			position: static;
			gap: 0.45rem;
			transform: none;
			font-size: 0.44rem;
			letter-spacing: 0.08em;
		}

		.route-sep {
			display: none;
		}

		.brand-word {
			font-size: 0.54rem;
		}

		.specs {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.specs > div:last-child {
			grid-column: span 2;
		}

		.footer {
			flex-direction: column;
			gap: 0.4rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(html) {
			scroll-behavior: auto;
		}
	}
</style>