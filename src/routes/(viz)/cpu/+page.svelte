<script lang="ts">
	import CPUExplodedView from '$lib/components/viz/CPUExplodedView.svelte';
</script>

<svelte:head>
	<title>Silicon Path — CPU Exploded View</title>
	<meta
		name="description"
		content="An interactive, scroll-driven study of a processor package: heat spreader, thermal interface, silicon die, substrate, and PCB."
	/>
</svelte:head>

<div class="test-page">
	<header class="topbar">
		<a class="brand" href="#top" aria-label="Silicon Path, back to top">
			<span class="brand-mark" aria-hidden="true"></span>
			<span class="brand-word">Silicon Path</span>
		</a>
		<div class="topbar-meta" aria-hidden="true">
			<span>Prototype / 01</span>
			<span class="topbar-sep"></span>
			<span>CPU package</span>
		</div>
		<span class="topbar-status">
			<span class="status-dot" aria-hidden="true"></span>
			A study in five layers
		</span>
	</header>

	<main id="top">
		<CPUExplodedView />

		<section class="closing" aria-labelledby="closing-title">
			<div class="closing-grid">
				<div class="closing-lede">
					<p class="section-kicker">02 / The path continues</p>
					<h2 id="closing-title">From C source<br />to copper.</h2>
					<p>
						A processor is not one thing. It is a stack of carefully chosen materials, each solving
						a different problem: heat, signal integrity, power delivery, and physical protection.
					</p>
				</div>

				<div class="closing-notes">
					<article>
						<span class="note-index">01</span>
						<h3>Abstraction is a stack</h3>
						<p>
							The same five layers map onto the way Silicon Path teaches computing. Source code
							becomes instructions; instructions become circuits; circuits become silicon.
						</p>
					</article>
					<article>
						<span class="note-index">02</span>
						<h3>Make it tangible</h3>
						<p>
							The package is rendered with PBR materials, an HDRI studio environment, and local
							Draco and KTX2 decoders. No network request, no external CDN.
						</p>
					</article>
					<article>
						<span class="note-index">03</span>
						<h3>Animation as explanation</h3>
						<p>
							Scrolling is the scrubber. The heat spreader lifts first, followed by the thermal
							interface, the die, the substrate, and finally the board.
						</p>
					</article>
				</div>
			</div>

			<div class="specs" aria-label="Model specifications">
				<div>
					<span class="spec-label">Geometry</span>
					<span class="spec-value">11.1k triangles</span>
				</div>
				<div>
					<span class="spec-label">Package</span>
					<span class="spec-value">511.9 KB</span>
				</div>
				<div>
					<span class="spec-label">Textures</span>
					<span class="spec-value">9 × KTX2</span>
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
		background: rgba(217, 119, 87, 0.3);
		color: var(--rubin-slate);
	}

	.test-page {
		min-height: 100svh;
		background: var(--rubin-ivory);
		color: var(--rubin-slate);
		font-family: var(--font-sans);
		font-feature-settings: 'cv11', 'ss03', 'tnum';
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
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
		font-size: 0.625rem;
		letter-spacing: 0.15em;
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
		font-size: 0.6875rem;
		letter-spacing: 0.2em;
	}

	.topbar-meta {
		position: absolute;
		left: 50%;
		display: flex;
		align-items: center;
		gap: 1rem;
		color: var(--rubin-muted);
		transform: translateX(-50%);
	}

	.topbar-sep {
		width: 1px;
		height: 0.7rem;
		background: rgba(138, 130, 116, 0.54);
	}

	.topbar-status {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		color: var(--rubin-muted);
		letter-spacing: 0.12em;
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
		background: var(--rubin-clay);
	}

	.closing-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
		gap: clamp(3rem, 9vw, 10rem);
		max-width: 78rem;
		margin: 0 auto;
	}

	.section-kicker {
		margin: 0 0 1.75rem;
		color: var(--rubin-muted);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.2em;
		line-height: 1.5;
		text-transform: uppercase;
	}

	.closing-lede h2 {
		margin: 0;
		color: var(--rubin-slate);
		font-size: clamp(2.9rem, 5.4vw, 5.6rem);
		font-weight: 400;
		letter-spacing: -0.05em;
		line-height: 0.96;
		text-wrap: balance;
	}

	.closing-lede > p:last-child {
		max-width: 28rem;
		margin: 2rem 0 0;
		color: var(--rubin-muted);
		font-size: 0.95rem;
		line-height: 1.65;
		text-wrap: pretty;
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
		font-size: 0.625rem;
		letter-spacing: 0.08em;
	}

	.closing-notes h3 {
		margin: 0;
		color: var(--rubin-slate);
		font-size: 1.0625rem;
		font-weight: 450;
		letter-spacing: -0.012em;
		line-height: 1.4;
	}

	.closing-notes p {
		max-width: 30rem;
		margin: 0.5rem 0 0;
		color: var(--rubin-muted);
		font-size: 0.875rem;
		line-height: 1.65;
		text-wrap: pretty;
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
		font-size: 0.625rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.spec-value {
		color: var(--rubin-dark-gray);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.02em;
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
		font-size: 0.625rem;
		letter-spacing: 0.1em;
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
		.topbar-meta {
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

		.topbar-status {
			font-size: 0.5625rem;
			letter-spacing: 0.06em;
		}

		.brand-word {
			font-size: 0.625rem;
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