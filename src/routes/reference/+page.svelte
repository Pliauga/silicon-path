<script lang="ts">
	import BitwiseVisualizer from '$lib/components/viz/BitwiseVisualizer.svelte';
	import DoublePointerSandbox from '$lib/components/viz/DoublePointerSandbox.svelte';
	import LogicGateSim from '$lib/components/viz/LogicGateSim.svelte';
	import PointerSandbox from '$lib/components/viz/PointerSandbox.svelte';
	import ExerciseCard from '$lib/components/lesson/ExerciseCard.svelte';
	import { labExercises } from '$lib/content/lab-exercises';
	import { inview } from '$lib/actions/inview';

	/**
	 * The lab route: the worksheet material that does not belong to a single
	 * lecture — bitwise vs logical operators, gate circuits, pointer levels,
	 * and the operator cheat sheet.
	 *
	 * Level 1 of the pointer sandbox is the component the lessons embed, and it
	 * is rendered untouched. Level 2 lives in its own component so adding the
	 * double pointer could not change a single pixel of the level students
	 * already met.
	 */
	let pointerLevel = $state<1 | 2>(1);

	const sections = [
		{ id: 'bitwise', label: 'Bitwise' },
		{ id: 'gates', label: 'Logic gates' },
		{ id: 'pointers', label: 'Pointers' },
		{ id: 'exercises', label: 'Exercises' },
		{ id: 'cheatsheet', label: 'Cheat sheet' }
	] as const;
</script>

<svelte:head>
	<title>Lab &amp; Reference — Silicon Path</title>
	<meta
		name="description"
		content="Interactive reference lab: bitwise operators, logic gates, pointer levels, and a C operator cheat sheet."
	/>
</svelte:head>

<article class="mx-auto w-full max-w-[72ch] px-6 py-8 lg:px-12 lg:py-10">
	<header>
		<p class="font-mono text-micro tracking-[0.08em] text-clay-ink uppercase">Lab &amp; reference</p>
		<h1 class="mt-2 text-h1 text-slate">The lab bench</h1>
		<p class="mt-3 max-w-[58ch] text-body leading-[1.65] text-dark-gray">
			Short, hands-on pages for the ideas that are easier to see than to read: how operators line
			up bits, how a gate turns two wires into one, and how many stars a pointer can carry. Every
			widget here is keyboard-operable and ships a plain-table version.
		</p>

		<nav aria-label="On this page" class="mt-6 flex flex-wrap gap-x-5 gap-y-2">
			{#each sections as section (section.id)}
				<a
					href="#{section.id}"
					class="font-mono text-micro tracking-[0.06em] text-dark-gray uppercase transition-colors duration-200 hover:text-slate"
				>
					{section.label}
				</a>
			{/each}
		</nav>
	</header>

	<!-- 1. Bitwise operators -------------------------------------------------->
	<section id="bitwise" class="mt-10 scroll-mt-16" use:inview={{ threshold: 0 }}>
		<div class="fade-text">
			<h2 class="text-h2 text-slate">Bitwise operators</h2>
			<p class="mt-2 max-w-[62ch] text-body leading-[1.65] text-dark-gray">
				A bitwise operator never sees a number — it sees eight wires. <code
					class="font-mono text-code">a &amp; b</code
				>
				compares column 7 with column 7, then column 6 with column 6, and so on. Logical
				operators (<code class="font-mono text-code">&amp;&amp;</code>,
				<code class="font-mono text-code">||</code>) do the opposite: they collapse each side to a
				single true/false and stop early.
			</p>
			<BitwiseVisualizer />
		</div>
	</section>

	<!-- 2. Logic gates -------------------------------------------------------->
	<section id="gates" class="mt-12 scroll-mt-16" use:inview={{ threshold: 0 }}>
		<div class="fade-text">
			<h2 class="text-h2 text-slate">Logic gates</h2>
			<p class="mt-2 max-w-[62ch] text-body leading-[1.65] text-dark-gray">
				The worksheet's equation is <code class="font-mono text-code">Y = (AB)(A + B)</code>. Two
				neighbouring facts are worth keeping apart: what the sum-of-products form literally wires
				up, and what it simplifies to. The widget below draws the first and proves the second, so
				the redundancy is on the table instead of in a footnote.
			</p>
			<LogicGateSim />
		</div>
	</section>

	<!-- 3. Pointer levels ----------------------------------------------------->
	<section id="pointers" class="mt-12 scroll-mt-16" use:inview={{ threshold: 0 }}>
		<div class="fade-text">
			<h2 class="text-h2 text-slate">Pointers, one level at a time</h2>
			<p class="mt-2 max-w-[62ch] text-body leading-[1.65] text-dark-gray">
				Level 1 is a single star: <code class="font-mono text-code">int *p</code> stores the
				address of an <code class="font-mono text-code">int</code>. Level 2 is a pointer to a
				pointer: <code class="font-mono text-code">int **ppc = &amp;pc</code> stores the address of
				<code class="font-mono text-code">pc</code>. Both follow the same predict-then-reveal loop.
			</p>

			<div class="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Pointer level">
				<button
					type="button"
					aria-pressed={pointerLevel === 1}
					onclick={() => (pointerLevel = 1)}
					class={[
						'px-3 py-1.5 font-mono text-micro tracking-[0.06em] uppercase transition-colors duration-200',
						pointerLevel === 1
							? 'bg-slate text-ivory'
							: 'bg-ivory text-dark-gray hover:bg-ivory-dark hover:text-slate'
					].join(' ')}
				>
					Level 1 · one star
				</button>
				<button
					type="button"
					aria-pressed={pointerLevel === 2}
					onclick={() => (pointerLevel = 2)}
					class={[
						'px-3 py-1.5 font-mono text-micro tracking-[0.06em] uppercase transition-colors duration-200',
						pointerLevel === 2
							? 'bg-slate text-ivory'
							: 'bg-ivory text-dark-gray hover:bg-ivory-dark hover:text-slate'
					].join(' ')}
				>
					Level 2 · two stars
				</button>
			</div>

			{#if pointerLevel === 1}
				<PointerSandbox />
			{:else}
				<DoublePointerSandbox />
			{/if}
		</div>
	</section>

	<!-- 4. Exercises ---------------------------------------------------------->
	<section id="exercises" class="mt-12 scroll-mt-16" use:inview={{ threshold: 0 }}>
		<div class="fade-text">
			<h2 class="text-h2 text-slate">Three small programs</h2>
			<p class="mt-2 max-w-[62ch] text-body leading-[1.65] text-dark-gray">
				Each one isolates a single idea from this page: a branch, a comparison, a write through a
				pointer. They compile and run locally in a Web Worker, so the output is real Clang output,
				not a simulation. Write code, Run, then Check.
			</p>

			{#each labExercises as exercise (exercise.id)}
				<ExerciseCard
					id={exercise.id}
					prompt={exercise.prompt}
					concept={exercise.concept}
					starter={exercise.starter}
					solution={exercise.solution}
					expectedStdout={exercise.expectedStdout}
					hints={[...exercise.hints]}
				/>
			{/each}
		</div>
	</section>

	<!-- 5. Cheat sheet --------------------------------------------------------->
	<section id="cheatsheet" class="mt-12 scroll-mt-16" use:inview={{ threshold: 0 }}>
		<div class="fade-text">
			<h2 class="text-h2 text-slate">The operator cheat sheet</h2>
			<p class="mt-2 max-w-[62ch] text-body leading-[1.65] text-dark-gray">
				Two families of operators that look alike and behave nothing alike, followed by the three
				pointer sigils. Read the "works on" column first: almost every surprise on this page comes
				from mixing them up.
			</p>

			<figure class="mt-8 overflow-x-auto">
				<table class="w-full min-w-[34rem] border-collapse text-left text-small">
					<caption
						class="mb-3 text-left font-mono text-micro tracking-[0.06em] text-muted-text uppercase"
					>
						Bitwise vs logical
					</caption>
					<thead>
						<tr class="border-b border-gray text-micro uppercase text-muted-text">
							<th scope="col" class="py-2 pr-4 font-normal">Operator</th>
							<th scope="col" class="py-2 pr-4 font-normal">Works on</th>
							<th scope="col" class="py-2 pr-4 font-normal">Produces</th>
							<th scope="col" class="py-2 pr-4 font-normal">Stops early?</th>
							<th scope="col" class="py-2 font-normal">Example</th>
						</tr>
					</thead>
					<tbody class="text-dark-gray">
						<tr class="border-b border-gray/40">
							<td class="py-2.5 pr-4 font-mono text-slate">&amp;</td>
							<td class="py-2.5 pr-4">every bit of both operands</td>
							<td class="py-2.5 pr-4">an integer, bit by bit</td>
							<td class="py-2.5 pr-4">no</td>
							<td class="py-2.5 font-mono text-code">0b1100 &amp; 0b1010 → 0b1000</td>
						</tr>
						<tr class="border-b border-gray/40">
							<td class="py-2.5 pr-4 font-mono text-slate">|</td>
							<td class="py-2.5 pr-4">every bit of both operands</td>
							<td class="py-2.5 pr-4">an integer, bit by bit</td>
							<td class="py-2.5 pr-4">no</td>
							<td class="py-2.5 font-mono text-code">0b1100 | 0b1010 → 0b1110</td>
						</tr>
						<tr class="border-b border-gray/40">
							<td class="py-2.5 pr-4 font-mono text-slate">^</td>
							<td class="py-2.5 pr-4">every bit of both operands</td>
							<td class="py-2.5 pr-4">1 where the bits differ</td>
							<td class="py-2.5 pr-4">no</td>
							<td class="py-2.5 font-mono text-code">0b1100 ^ 0b1010 → 0b0110</td>
						</tr>
						<tr class="border-b border-gray/40">
							<td class="py-2.5 pr-4 font-mono text-slate">~</td>
							<td class="py-2.5 pr-4">one operand</td>
							<td class="py-2.5 pr-4">every bit flipped</td>
							<td class="py-2.5 pr-4">—</td>
							<td class="py-2.5 font-mono text-code">~0b1010 → 0b…0101</td>
						</tr>
						<tr class="border-b border-gray/40">
							<td class="py-2.5 pr-4 font-mono text-slate">&amp;&amp;</td>
							<td class="py-2.5 pr-4">each side as a whole (0 = false)</td>
							<td class="py-2.5 pr-4">exactly 0 or 1</td>
							<td class="py-2.5 pr-4">yes, at the first false side</td>
							<td class="py-2.5 font-mono text-code">5 &amp;&amp; 0 → 0</td>
						</tr>
						<tr class="border-b border-gray/40">
							<td class="py-2.5 pr-4 font-mono text-slate">||</td>
							<td class="py-2.5 pr-4">each side as a whole (0 = false)</td>
							<td class="py-2.5 pr-4">exactly 0 or 1</td>
							<td class="py-2.5 pr-4">yes, at the first true side</td>
							<td class="py-2.5 font-mono text-code">5 || 0 → 1</td>
						</tr>
						<tr class="border-b border-gray/40">
							<td class="py-2.5 pr-4 font-mono text-slate">!</td>
							<td class="py-2.5 pr-4">one operand, as a whole</td>
							<td class="py-2.5 pr-4">exactly 0 or 1</td>
							<td class="py-2.5 pr-4">—</td>
							<td class="py-2.5 font-mono text-code">!5 → 0</td>
						</tr>
					</tbody>
				</table>
			</figure>

			<p class="mt-3 border-l-2 border-clay bg-warm-tint px-4 py-3 text-small leading-[1.6] text-slate">
				The trap is one keystroke wide: <code class="font-mono">a &amp; b</code> masks bits, while
				<code class="font-mono">a &amp;&amp; b</code> branches on truth. A single
				<code class="font-mono">if (x &amp; 2)</code> is legal and often intentional; a single
				<code class="font-mono">&amp;</code> where a condition was meant is a silent bug, because
				both sides are always evaluated.
			</p>

			<figure class="mt-10 overflow-x-auto">
				<table class="w-full min-w-[34rem] border-collapse text-left text-small">
					<caption
						class="mb-3 text-left font-mono text-micro tracking-[0.06em] text-muted-text uppercase"
					>
						The three pointer sigils
					</caption>
					<thead>
						<tr class="border-b border-gray text-micro uppercase text-muted-text">
							<th scope="col" class="py-2 pr-4 font-normal">Form</th>
							<th scope="col" class="py-2 pr-4 font-normal">Name</th>
							<th scope="col" class="py-2 pr-4 font-normal">Reads</th>
							<th scope="col" class="py-2 pr-4 font-normal">Writes</th>
							<th scope="col" class="py-2 font-normal">Example</th>
						</tr>
					</thead>
					<tbody class="text-dark-gray">
						<tr class="border-b border-gray/40">
							<td class="py-2.5 pr-4 font-mono text-slate">&amp;x</td>
							<td class="py-2.5 pr-4">address-of</td>
							<td class="py-2.5 pr-4">the address of x</td>
							<td class="py-2.5 pr-4">nothing — it is not an lvalue</td>
							<td class="py-2.5 font-mono text-code">int *p = &amp;n;</td>
						</tr>
						<tr class="border-b border-gray/40">
							<td class="py-2.5 pr-4 font-mono text-slate">*p</td>
							<td class="py-2.5 pr-4">dereference</td>
							<td class="py-2.5 pr-4">the value at the stored address</td>
							<td class="py-2.5 pr-4">that same value — <code class="font-mono">*p</code> is an lvalue</td>
							<td class="py-2.5 font-mono text-code">*p = 42;</td>
						</tr>
						<tr class="border-b border-gray/40">
							<td class="py-2.5 pr-4 font-mono text-slate">**pp</td>
							<td class="py-2.5 pr-4">double dereference</td>
							<td class="py-2.5 pr-4">the value two addresses away</td>
							<td class="py-2.5 pr-4">that value — after two reads</td>
							<td class="py-2.5 font-mono text-code">int **ppc = &amp;pc; **ppc = 36;</td>
						</tr>
					</tbody>
				</table>
			</figure>

			<p class="mt-3 text-small leading-[1.65] text-dark-gray">
				A declaration reads the same symbols the other way around:
				<code class="font-mono text-code">int **ppc</code> means "ppc holds the address of
				something whose type is <code class="font-mono text-code">int *</code>". Dereference it
				once and you get the <code class="font-mono text-code">int *</code>; twice and you get the
				<code class="font-mono text-code">int</code>.
			</p>
		</div>
	</section>

	<footer class="mt-14 border-t border-gray/40 pt-4">
		<p class="text-micro text-muted-text">
			Lab exercises are checked against expected stdout by the in-browser compiler. The pointer
			sandboxes are models: no real memory is read or written.
		</p>
	</footer>
</article>