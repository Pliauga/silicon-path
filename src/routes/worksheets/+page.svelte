<script lang="ts">
	import { resolve } from '$app/paths';
	import { exerciseCount, worksheets } from '$lib/content/worksheets';

	/**
	 * Landings for the five lab worksheets. Week 4 is Windows batch/VBScript and
	 * cannot run here — the page says so rather than pretending otherwise.
	 */
	const weeks = $derived(
		worksheets.map((week) => ({ ...week, exercises: exerciseCount(week) }))
	);
	const total = $derived(weeks.reduce((sum, week) => sum + week.exercises, 0));
</script>

<svelte:head>
	<title>Lab Worksheets — Silicon Path</title>
	<meta
		name="description"
		content="Five CST1500 lab worksheets as interactive pages: PC parts, number systems, logic gates, pointers, I/O, loops, batch files and Bash."
	/>
</svelte:head>

<article class="mx-auto w-full max-w-[72ch] px-6 py-8 lg:px-12 lg:py-10">
	<header>
		<p class="font-mono text-micro tracking-[0.08em] text-clay-ink uppercase">
			CST1500 · Lab Worksheets
		</p>
		<h1 class="mt-2 text-h1 leading-[1.1] text-slate">Five labs, from bits to Bash</h1>
		<p class="mt-4 text-prose leading-[1.65] text-dark-gray">
			The weekly lab sheets, rebuilt as pages. The prose and the exercises follow the paper
			worksheets; every figure is redrawn as a live component rather than a photograph, and every
			C program runs in the browser.
		</p>
		<p class="mt-3 text-small leading-[1.65] text-muted-text">
			{total} exercises across five weeks. Work the paper steps first, then use the widgets to check
			what you reasoned out. Note exercises have a reference answer behind “Show solution”.
		</p>
	</header>

	<div class="mt-10 grid gap-4 sm:grid-cols-2">
		{#each weeks as week (week.week)}
			<a
				href={resolve('/worksheets/[week]', { week: String(week.week) })}
				class="callout block hover:bg-ivory-dark"
			>
				<p class="font-mono text-micro tracking-[0.08em] text-muted-text uppercase">
					Week {String(week.week).padStart(2, '0')}
				</p>
				<h2 class="mt-2 text-h3 leading-[1.25] text-slate">{week.title}</h2>
				<p class="mt-2 font-mono text-micro leading-relaxed text-muted-text">{week.lecture}</p>
				<p class="mt-4 flex items-center gap-3 font-mono text-micro text-dark-gray">
					<span>{week.exercises} exercises</span>
					<span aria-hidden="true">·</span>
					<span>{week.duration}</span>
				</p>
			</a>
		{/each}
	</div>

	<section class="mt-12 border-t border-gray/40 pt-6">
		<h2 class="text-h3 text-slate">How to use a worksheet</h2>
		<ol class="mt-3 list-decimal space-y-2 pl-5 text-small leading-[1.65] text-dark-gray">
			<li>
				Read the figure caption before the figure. It says what the widget is for; the widget is
				there to test a prediction, not to make one for you.
			</li>
			<li>
				For note tasks, write the answer first. The reference answer opens only when you ask for
				it, and it often names the misconception the question was probing. "Mark theory as read"
				records that you read it; it never counts as verified code.
			</li>
			<li>
				For code tasks, type the program in the editor, press Run, then compare with the expected
				output. Check uses the exact stdout the worksheet specifies, including spaces.
			</li>
			<li>
				Week 4 targets <span class="font-mono text-code text-slate">cmd.exe</span> and Windows
				Script Host, which do not exist in the browser. Those cards are reading exercises; run
				them on a Windows lab machine.
			</li>
		</ol>
	</section>
</article>