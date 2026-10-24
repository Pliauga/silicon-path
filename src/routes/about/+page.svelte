<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import { ArrowRight } from '@lucide/svelte';

	const cover = asset('/images/technical-manual-cover.jpg');
</script>

<svelte:head>
	<title>About — Silicon Path</title>
	<meta
		name="description"
		content="Why Silicon Path exists: a C and computer-systems course built for a brain that stalls on the first step."
	/>
</svelte:head>

<article class="mx-auto w-full max-w-[72ch] px-6 py-8 lg:px-12 lg:py-10">
	<figure class="mx-auto max-w-[26rem]">
		<img
			src={cover}
			width="1792"
			height="2400"
			alt="A vintage 1970s technical-manual plate in sepia ink: a large retro robot, a bearded man soldering at its chest, and a small octocat floating above, with a ruler down the left edge and binary code beside it."
			class="block h-auto w-full"
		/>
		<figcaption class="mt-3 font-mono text-micro tracking-[0.08em] text-muted-text uppercase">
			Plate 01 — Silicon Path, technical manual
		</figcaption>
	</figure>

	<header class="mt-10">
		<p class="font-mono text-micro tracking-[0.08em] text-clay-ink uppercase">About</p>
		<h1 class="mt-2 text-h1 leading-[1.1] text-slate">Why this exists</h1>
	</header>

	<div class="mt-6 space-y-4 text-prose leading-[1.65] text-dark-gray">
		<p>
			Realising quickly the pain point for most of the class attending was that the teacher would
			just dump the material on you by reading and that's it. Statistically, majority of
			cybersecurity students are neurodivergent and that is one of the least useful ways of
			teaching.
		</p>
		<p>
			As an older student who suffers from AuDHD, I faced "task paralysis" when I was younger. Now,
			as an older student, I want to reduce the barrier of learning by creating this project that
			runs on localhost. No API keys, no slow WIFI, nothing. Just uninterrupted learning.
		</p>
		<p>
			This project applies psychological principles to maximise learning and retention (active
			recall, forcing predictions, bite-sized chunks) while providing a beautiful, warm, calming UI
			to keep you grounded and prevent cognitive overload.
		</p>
	</div>

	<a href={resolve('/')} class="btn-editorial btn-clay mt-10">
		Start learning
		<ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
	</a>
</article>
