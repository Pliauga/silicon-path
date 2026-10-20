<script lang="ts">
	import { untrack } from 'svelte';

	/**
	 * Y = (AB)(A + B), drawn and simplified.
	 *
	 * The worksheet asks for the full two-level circuit *and* its truth table,
	 * and the honest result is that the second factor is redundant: whenever
	 * AB = 0 the output is 0 regardless of A + B, so Y = AB. The widget shows
	 * both facts at once — the circuit has three gates, the table has five
	 * columns, and the last two columns never disagree.
	 *
	 * The SVG is decorative in the accessibility tree; the truth table below is
	 * the same information in text, and every input is a real button.
	 */
	interface Props {
		initialA?: boolean;
		initialB?: boolean;
	}

	let { initialA = false, initialB = true }: Props = $props();

	let a = $state(untrack(() => initialA));
	let b = $state(untrack(() => initialB));

	const andAB = $derived(a && b);
	const orAB = $derived(a || b);
	const y = $derived(andAB && orAB);

	/** The four input combinations, MSB-first as A B = 00, 01, 10, 11. */
	const rows = [
		{ a: false, b: false, n: 0 },
		{ a: false, b: true, n: 1 },
		{ a: true, b: false, n: 2 },
		{ a: true, b: true, n: 3 }
	];

	function rowResult(rowA: boolean, rowB: boolean): { and: boolean; or: boolean; y: boolean } {
		const and = rowA && rowB;
		const or = rowA || rowB;
		return { and, or, y: and && or };
	}

	function isCurrentRow(rowA: boolean, rowB: boolean): boolean {
		return rowA === a && rowB === b;
	}

	/** A wire is live when it carries a 1. */
	function wire(live: boolean): string {
		return live ? 'stroke-clay' : 'stroke-gray/40';
	}

	function toggle(side: 'a' | 'b'): void {
		if (side === 'a') a = !a;
		else b = !b;
	}
</script>

<section class="callout my-10" aria-labelledby="gate-title">
	<header>
		<h3 id="gate-title" class="text-h3 text-slate">One equation, three gates</h3>
		<p class="mt-1 max-w-[58ch] text-small leading-[1.55] text-dark-gray">
			<code class="font-mono text-code">Y = (AB)(A + B)</code> says: AND the inputs, OR the inputs,
			then AND those two results. Toggle <code class="font-mono text-code">A</code> and
			<code class="font-mono text-code">B</code> and follow the clay wire.
		</p>
	</header>

	<!-- Inputs -->
	<div class="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3">
		<div class="flex items-center gap-3">
			<span class="font-mono text-small text-slate">A</span>
			<div class="flex gap-1" role="group" aria-label="Input A">
				<button
					type="button"
					aria-pressed={!a}
					onclick={() => toggle('a')}
					class={[
						'flex h-8 w-9 items-center justify-center font-mono text-small tabular-nums transition-colors duration-200',
						!a ? 'bg-clay text-accent-text' : 'bg-ivory text-dark-gray hover:bg-ivory-dark'
					].join(' ')}
				>
					0
				</button>
				<button
					type="button"
					aria-pressed={a}
					onclick={() => toggle('a')}
					class={[
						'flex h-8 w-9 items-center justify-center font-mono text-small tabular-nums transition-colors duration-200',
						a ? 'bg-clay text-accent-text' : 'bg-ivory text-dark-gray hover:bg-ivory-dark'
					].join(' ')}
				>
					1
				</button>
			</div>
		</div>
		<div class="flex items-center gap-3">
			<span class="font-mono text-small text-slate">B</span>
			<div class="flex gap-1" role="group" aria-label="Input B">
				<button
					type="button"
					aria-pressed={!b}
					onclick={() => toggle('b')}
					class={[
						'flex h-8 w-9 items-center justify-center font-mono text-small tabular-nums transition-colors duration-200',
						!b ? 'bg-clay text-accent-text' : 'bg-ivory text-dark-gray hover:bg-ivory-dark'
					].join(' ')}
				>
					0
				</button>
				<button
					type="button"
					aria-pressed={b}
					onclick={() => toggle('b')}
					class={[
						'flex h-8 w-9 items-center justify-center font-mono text-small tabular-nums transition-colors duration-200',
						b ? 'bg-clay text-accent-text' : 'bg-ivory text-dark-gray hover:bg-ivory-dark'
					].join(' ')}
				>
					1
				</button>
			</div>
		</div>
		<p class="font-mono text-micro text-muted-text">
			Y = <span class="text-slate">{y ? 1 : 0}</span>
		</p>
	</div>

	<div class="mt-4 overflow-x-auto">
		<svg
			viewBox="0 0 320 200"
			class="h-auto w-full min-w-[20rem] max-w-[32rem]"
			role="img"
			aria-label="Circuit for Y equals A AND B, times A OR B. A and B feed an AND gate and an OR gate; both results feed a final AND gate."
		>
			<!-- Wires are drawn first so gate bodies sit on top. -->
			<g fill="none" stroke-width="1.5" stroke-linecap="square">
				<!-- A splits into the AND (top) and the OR (middle). -->
				<path d="M 24 50 H 56 V 72 H 92" class={wire(a)} />
				<path d="M 56 50 V 132 H 100" class={wire(a)} />
				<!-- B splits the same way. -->
				<path d="M 24 150 H 56 V 88 H 92" class={wire(b)} />
				<path d="M 56 150 V 148 H 100" class={wire(b)} />
				<!-- AND → final AND (top input). -->
				<path d="M 124 80 H 152 V 102 H 182" class={wire(andAB)} />
				<!-- OR → final AND (bottom input). -->
				<path d="M 136 140 H 152 V 118 H 182" class={wire(orAB)} />
				<!-- Final AND → lamp. -->
				<path d="M 214 110 H 258" class={wire(y)} />
			</g>

			<!-- AND gate -->
			<g>
				<path
					d="M 92 64 H 108 A 16 16 0 0 1 108 96 H 92 Z"
					fill="var(--color-paper)"
					stroke="var(--color-gray)"
					stroke-width="1.5"
				/>
				<text x="100" y="84" text-anchor="middle" class="fill-dark-gray" style="font-family: var(--font-mono); font-size: 10px;">&amp;</text>
				<text x="100" y="58" text-anchor="middle" class="fill-muted-text" style="font-family: var(--font-mono); font-size: 9px;">AB</text>
			</g>

			<!-- OR gate -->
			<g>
				<path
					d="M 96 126 Q 120 126 136 140 Q 120 154 96 154 Q 110 140 96 126 Z"
					fill="var(--color-paper)"
					stroke="var(--color-gray)"
					stroke-width="1.5"
					stroke-linejoin="round"
				/>
				<text x="110" y="144" text-anchor="middle" class="fill-dark-gray" style="font-family: var(--font-mono); font-size: 10px;">≥1</text>
				<text x="108" y="122" text-anchor="middle" class="fill-muted-text" style="font-family: var(--font-mono); font-size: 9px;">A + B</text>
			</g>

			<!-- Final AND gate -->
			<g>
				<path
					d="M 182 94 H 198 A 16 16 0 0 1 198 126 H 182 Z"
					fill="var(--color-paper)"
					stroke="var(--color-gray)"
					stroke-width="1.5"
				/>
				<text x="190" y="114" text-anchor="middle" class="fill-dark-gray" style="font-family: var(--font-mono); font-size: 10px;">&amp;</text>
			</g>

			<!-- Output lamp -->
			<circle
				cx="268"
				cy="110"
				r="9"
				fill={y ? 'var(--color-clay)' : 'var(--color-paper)'}
				stroke={y ? 'var(--color-clay)' : 'var(--color-gray)'}
				stroke-width="1.5"
			/>
			<text x="288" y="114" class="fill-slate" style="font-family: var(--font-mono); font-size: 11px;">Y</text>
		</svg>
	</div>

	<div class="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
		<!-- Truth table, with the intermediate columns the worksheet asks for. -->
		<div>
			<table class="w-full border-collapse text-left text-small">
				<caption class="sr-only">Truth table for Y = (AB)(A + B)</caption>
				<thead>
					<tr class="border-b border-gray/50 font-mono text-micro text-muted-text">
						<th scope="col" class="py-1.5 pr-3 font-normal">A</th>
						<th scope="col" class="py-1.5 pr-3 font-normal">B</th>
						<th scope="col" class="py-1.5 pr-3 font-normal">AB</th>
						<th scope="col" class="py-1.5 pr-3 font-normal">A+B</th>
						<th scope="col" class="py-1.5 font-normal">Y</th>
					</tr>
				</thead>
				<tbody class="font-mono tabular-nums">
					{#each rows as row (row.n)}
						{@const r = rowResult(row.a, row.b)}
						<tr
							class={[
								'border-b border-gray/30 transition-colors duration-200',
								isCurrentRow(row.a, row.b) ? 'bg-ivory-dark text-slate' : 'text-dark-gray'
							].join(' ')}
						>
							<td class="py-1.5 pr-3">{row.a ? 1 : 0}</td>
							<td class="py-1.5 pr-3">{row.b ? 1 : 0}</td>
							<td class="py-1.5 pr-3">{r.and ? 1 : 0}</td>
							<td class="py-1.5 pr-3">{r.or ? 1 : 0}</td>
							<td class="py-1.5">{r.y ? 1 : 0}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="mt-2 text-micro leading-[1.5] text-muted-text">
				The highlighted row is the input pair selected above.
			</p>
		</div>

		<!-- The simplification, stated plainly. -->
		<div class="border-l-2 border-clay bg-warm-tint px-4 py-3">
			<p class="text-small leading-[1.6] text-slate">
				When <code class="font-mono">AB = 0</code>, the final AND already outputs 0 — so the
				<code class="font-mono">(A + B)</code> factor can never turn it back on. It only matters in
				the row where both are 1, and there it agrees. The circuit is therefore the same as a
				single AND gate:
			</p>
			<p class="mt-2 font-mono text-small text-slate">Y = AB</p>
			<p class="mt-2 text-micro leading-[1.5] text-dark-gray">
				AB + AB = AB by idempotence, and the absorbed term is why the third and last columns are
				identical in every row.
			</p>
		</div>
	</div>

	<details class="mt-5 border-t border-gray/40 pt-3">
		<summary class="cursor-pointer text-micro uppercase text-muted-text">Accessible version</summary>
		<p class="mt-2 text-small leading-[1.6] text-dark-gray">
			Inputs: A = {a ? 1 : 0}, B = {b ? 1 : 0}. AND result AB = {andAB ? 1 : 0}. OR result A + B =
			{orAB ? 1 : 0}. Output Y = (AB)(A + B) = {y ? 1 : 0}. In every row, Y equals AB.
		</p>
	</details>
</section>