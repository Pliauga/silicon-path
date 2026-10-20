<script lang="ts">
	import { resolve } from '$app/paths';
	import { setContext, type Snippet } from 'svelte';
	import { STUDY_FRAME } from './frame-mode';

	type Props = {
		/** Shown until the study is near the viewport, so the reserved space reads as deliberate. */
		label?: string;
		/** Links to the standalone gallery route for the study, when one exists. */
		href?: '/cpu/' | '/memory/' | '/scheduler/' | '/paging/';
		/** Figure number shown in the caption, e.g. "09" renders "Fig. 09". */
		fig?: string;
		/** Caption text that follows the figure number. */
		caption?: string;
		/** `tall` reserves room for studies with a full HUD (stack/heap, compiler pipeline). */
		size?: 'default' | 'tall';
		children: Snippet;
	};

	let { label = 'Interactive 3D study', href, fig, caption, size = 'default', children }: Props = $props();

	// Tell the study it is framed by an article, not standing alone.
	setContext(STUDY_FRAME, { embedded: true });

	let host: HTMLElement | undefined = $state();
	let visible = $state(false);


	// Mount the heavy study (three.js, GSAP, loaders) only when the reader is
	// close to it. The component's own scroll choreography stays inside this
	// frame, so the lesson's scrollbar and reading column are untouched.
	$effect(() => {
		const element = host;
		if (!element || visible) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					visible = true;
					observer.disconnect();
				}
			},
			{ rootMargin: '600px 0px' }
		);
		observer.observe(element);
		return () => observer.disconnect();
	});
</script>

<figure class="study-frame" class:is-tall={size === 'tall'} bind:this={host}>
	<div class="study-body">
		{#if visible}
			{@render children()}
		{:else}
			<div class="study-placeholder" role="status">
				<p class="study-eyebrow">{label}</p>
				<p class="study-hint">Builds as you scroll — move down to load the model.</p>
			</div>
		{/if}
	</div>

	{#if caption || href}
		<figcaption class="study-caption">
			<span class="study-caption__text">
				{fig ? `Fig. ${fig} — ${caption ?? label}` : (caption ?? label)}
			</span>
			{#if href}
				<a href={resolve(href)}>Open full screen</a>
			{/if}
		</figcaption>
	{/if}
</figure>

<style>
	.study-frame {
		position: relative;
		margin-block: 1.5rem;
		/* Seamless: no frame, no tint, no border. The WebGL canvas is transparent
		   (alpha + clear alpha 0), so the model floats on the page itself. The figure
		   breaks out of the 68ch prose column on wide screens (see the media query). */
		width: 100%;
		max-width: 1100px;
		margin-inline: auto;
		background: none;
		border: 0;
	}

	.study-body {
		height: clamp(460px, 48vw, 600px);
		max-width: 100%;
		overflow: hidden;
		background: transparent;
		border: 0;
	}

	/* Studies with a full HUD (stack/heap, compiler pipeline) need the room. */
	.study-frame.is-tall .study-body {
		height: clamp(620px, 58vw, 700px);
	}

	/* Bleed: at desktop widths the figure is wider than the reading column. It stays
	   centred on the column (left 50% + translateX) and never exceeds the space left
	   of the 40px rail and the page gutters, so it cannot cause horizontal scroll. */
	@media (min-width: 900px) {
		.study-frame {
			position: relative;
			left: 50%;
			width: min(1100px, calc(100vw - 40px - 3rem));
			max-width: none;
			margin-inline: 0;
			transform: translateX(-50%);
		}

		.study-frame .study-body {
			height: clamp(480px, 46vw, 640px);
		}

		.study-frame.is-tall .study-body {
			height: clamp(560px, 52vw, 700px);
		}
	}

	.study-frame :global(canvas) {
		max-width: 100%;
	}

	.study-frame :global(section) {
		border-radius: 0;
	}

	/* The paging study carries a simulator HUD beside the model. */
	@media (min-width: 900px) {
		.study-frame:has(:global(.vm3d)) .study-body {
			height: clamp(440px, 38vw, 520px);
		}
	}

	/* Narrow screens: the study stacks scene above controls and sizes itself. */
	@media (max-width: 899px) {
		.study-frame:has(:global(.vm3d)) .study-body {
			height: auto;
		}
	}

	.study-placeholder {
		display: grid;
		place-content: center;
		gap: 0.5rem;
		height: 100%;
		padding: 2rem;
		text-align: center;
		background: transparent;
	}

	.study-eyebrow {
		margin: 0;
		color: var(--text-primary);
		font-family: var(--font-mono, monospace);
		font-size: 0.8125rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.study-hint {
		margin: 0;
		color: var(--text-secondary);
		font-size: 1rem;
	}

	.study-caption {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: baseline;
		justify-content: space-between;
		padding: 0.75rem 1rem 0;
		border: 0;
		color: var(--text-muted);
		font-family: var(--font-mono, 'Courier Prime', monospace);
		font-size: 0.8125rem;
		letter-spacing: 0.02em;
	}

	.study-caption a {
		color: var(--text-primary);
		text-decoration: underline;
		text-decoration-color: var(--rubin-gray);
		text-underline-offset: 3px;
	}

	.study-caption a:hover {
		text-decoration-color: var(--accent-ink);
	}

	@media (prefers-reduced-motion: reduce) {
		.study-frame {
			scroll-behavior: auto;
		}
	}
</style>