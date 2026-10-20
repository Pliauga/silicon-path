<script lang="ts">
	import { untrack } from 'svelte';
	import { getBit, setBit, toggleBit } from '$lib/utils/bit';
	import { toBinaryGroups } from '$lib/utils/number';

	/**
	 * Two bytes, eight columns, three operators.
	 *
	 * The point of the widget is that bitwise operators line the operands up
	 * column by column — something a decimal answer hides completely. So the
	 * inputs and every result share the same eight columns and the same
	 * MSB-left reading direction as binary notation.
	 *
	 * Keyboard: one roving tab stop for the whole 2×8 board. Left/Right walk a
	 * row, Up/Down swap rows, Space flips the focused bit, `0`/`1` set it.
	 */
	interface Props {
		/** Starting value for row A, 0–255. */
		initialA?: number;
		/** Starting value for row B, 0–255. */
		initialB?: number;
	}

	let { initialA = 0b1010_1100, initialB = 0b1100_1010 }: Props = $props();

	/** Bits are shown 7…0, left to right. */
	const indices = [7, 6, 5, 4, 3, 2, 1, 0] as const;

	let a = $state(untrack(() => initialA) & 0xff);
	let b = $state(untrack(() => initialB) & 0xff);

	/** The board's single tab stop. */
	let focusRow = $state<'a' | 'b'>('a');
	let focusBit = $state(7);
	let refs: Record<string, HTMLButtonElement | undefined> = {};

	const andValue = $derived(a & b);
	const orValue = $derived(a | b);
	const xorValue = $derived(a ^ b);

	const results = $derived([
		{
			key: 'and',
			op: '&',
			expression: 'a & b',
			headline: 'AND',
			rule: '1 only where both bits are 1',
			value: andValue
		},
		{
			key: 'or',
			op: '|',
			expression: 'a | b',
			headline: 'OR',
			rule: '1 wherever either bit is 1',
			value: orValue
		},
		{
			key: 'xor',
			op: '^',
			expression: 'a ^ b',
			headline: 'XOR',
			rule: '1 where the bits differ',
			value: xorValue
		}
	]);

	function key(row: 'a' | 'b', index: number): string {
		return `${row}-${index}`;
	}

	function focusCell(row: 'a' | 'b', index: number): void {
		focusRow = row;
		focusBit = index;
		refs[key(row, index)]?.focus();
	}

	function flip(row: 'a' | 'b', index: number): void {
		if (row === 'a') a = toggleBit(a, index) & 0xff;
		else b = toggleBit(b, index) & 0xff;
	}

	function write(row: 'a' | 'b', index: number, on: boolean): void {
		if (row === 'a') a = setBit(a, index, on) & 0xff;
		else b = setBit(b, index, on) & 0xff;
	}

	function onKeydown(event: KeyboardEvent, row: 'a' | 'b', index: number): void {
		const target: Record<string, number> = {
			ArrowLeft: index + 1,
			ArrowRight: index - 1,
			Home: 7,
			End: 0
		};
		if (event.key in target) {
			event.preventDefault();
			const next = target[event.key] ?? index;
			if (next >= 0 && next <= 7) focusCell(row, next);
			return;
		}
		if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			event.preventDefault();
			focusCell(row === 'a' ? 'b' : 'a', index);
			return;
		}
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			flip(row, index);
			return;
		}
		if (event.key === '0' || event.key === '1') {
			event.preventDefault();
			write(row, index, event.key === '1');
		}
	}

	function reset(): void {
		a = initialA & 0xff;
		b = initialB & 0xff;
		focusRow = 'a';
		focusBit = 7;
	}
</script>

<section class="callout my-10" aria-labelledby="bitwise-title">
	<header class="flex flex-wrap items-baseline justify-between gap-2">
		<div>
			<h3 id="bitwise-title" class="text-h3 text-slate">Bitwise operators, column by column</h3>
			<p class="mt-1 max-w-[58ch] text-small leading-[1.55] text-dark-gray">
				Each operator reads the two bytes in parallel and answers one column at a time. Flip a
				bit in <code class="font-mono text-code">a</code> or <code class="font-mono text-code"
					>b</code
				>
				and watch which of the three results move.
			</p>
		</div>
		<button
			type="button"
			onclick={reset}
			class="bg-ivory px-3 py-1.5 font-mono text-micro tracking-[0.08em] text-dark-gray uppercase transition-colors duration-200 hover:bg-ivory-dark hover:text-slate active:translate-y-px"
		>
			Reset
		</button>
	</header>

	<div class="mt-5 overflow-x-auto">
		<div class="min-w-[23rem]">
			<!-- Column headers, so the "line them up" idea is visible before any result. -->
			<div
				class="mb-1 grid grid-cols-[3.25rem_repeat(8,minmax(0,1fr))_5.5rem] items-end gap-1.5"
				aria-hidden="true"
			>
				<span></span>
				{#each indices as index (index)}
					<span class="text-center font-mono text-micro text-muted-text">{index}</span>
				{/each}
				<span class="pl-2 text-right font-mono text-micro text-muted-text">decimal</span>
			</div>

			<!-- Row A -->
			<div class="mb-1.5 grid grid-cols-[3.25rem_repeat(8,minmax(0,1fr))_5.5rem] items-center gap-1.5">
				<span class="font-mono text-small text-slate">a</span>
				{#each indices as index (index)}
					{@const on = getBit(a, index)}
					<button
						type="button"
						bind:this={refs[key('a', index)]}
						tabindex={focusRow === 'a' && focusBit === index ? 0 : -1}
						aria-pressed={on}
						aria-label="Bit {index} of a, currently {on ? 1 : 0}"
						onclick={() => flip('a', index)}
						onfocus={() => {
							focusRow = 'a';
							focusBit = index;
						}}
						onkeydown={(event) => onKeydown(event, 'a', index)}
						class={[
							'flex h-10 w-full items-center justify-center font-mono text-small tabular-nums',
							'transition-colors duration-200 active:translate-y-px',
							on
								? 'bg-clay text-accent-text hover:bg-clay-hover'
								: 'bg-ivory text-dark-gray hover:bg-ivory-dark hover:text-slate'
						].join(' ')}
					>
						{on ? 1 : 0}
					</button>
				{/each}
				<span class="pl-2 text-right font-mono text-small tabular-nums text-slate">{a}</span>
			</div>

			<!-- Row B -->
			<div class="mb-4 grid grid-cols-[3.25rem_repeat(8,minmax(0,1fr))_5.5rem] items-center gap-1.5">
				<span class="font-mono text-small text-slate">b</span>
				{#each indices as index (index)}
					{@const on = getBit(b, index)}
					<button
						type="button"
						bind:this={refs[key('b', index)]}
						tabindex={focusRow === 'b' && focusBit === index ? 0 : -1}
						aria-pressed={on}
						aria-label="Bit {index} of b, currently {on ? 1 : 0}"
						onclick={() => flip('b', index)}
						onfocus={() => {
							focusRow = 'b';
							focusBit = index;
						}}
						onkeydown={(event) => onKeydown(event, 'b', index)}
						class={[
							'flex h-10 w-full items-center justify-center font-mono text-small tabular-nums',
							'transition-colors duration-200 active:translate-y-px',
							on
								? 'bg-clay text-accent-text hover:bg-clay-hover'
								: 'bg-ivory text-dark-gray hover:bg-ivory-dark hover:text-slate'
						].join(' ')}
					>
						{on ? 1 : 0}
					</button>
				{/each}
				<span class="pl-2 text-right font-mono text-small tabular-nums text-slate">{b}</span>
			</div>

			<div class="mb-4 border-t border-gray/40" aria-hidden="true"></div>

			<!-- Results: same eight columns, read-only, so alignment is the argument. -->
			{#each results as result (result.key)}
				<div class="mb-4">
					<div
						class="mb-1 grid grid-cols-[3.25rem_repeat(8,minmax(0,1fr))_5.5rem] items-center gap-1.5"
					>
						<span class="font-mono text-small text-clay-ink">{result.op}</span>
						{#each indices as index (index)}
							{@const on = getBit(result.value, index)}
							<span
								aria-hidden="true"
								class={[
									'flex h-9 w-full items-center justify-center font-mono text-small tabular-nums',
									on ? 'bg-ivory-dark text-slate' : 'bg-ivory text-muted-text'
								].join(' ')}
							>
								{on ? 1 : 0}
							</span>
						{/each}
						<span class="pl-2 text-right font-mono text-small tabular-nums text-slate">
							{result.value}
						</span>
					</div>
					<p class="text-micro leading-[1.5] text-muted-text">
						<span class="font-mono">{result.expression}</span>
						<span aria-hidden="true"> · </span>{result.headline}: {result.rule}
					</p>
				</div>
			{/each}
		</div>
	</div>

	<p class="sr-only" aria-live="polite">
		a is {a} in decimal, binary {toBinaryGroups(a, 8)}. b is {b} in decimal, binary
		{toBinaryGroups(b, 8)}. a AND b is {andValue}, a OR b is {orValue}, a XOR b is {xorValue}.
	</p>

	<!-- The C is derived from the rows above, so the snippet and the picture can
	     never disagree. -->
	<figure class="mt-2">
		<pre class="blueprint overflow-x-auto p-4 font-mono text-code leading-[1.7] text-slate"
			><code
				><span style="color: var(--syntax-keyword)">int</span> a = {a};   <span
					style="color: var(--syntax-comment)">/* {toBinaryGroups(a, 8)} */</span>
<span style="color: var(--syntax-keyword)">int</span> b = {b};   <span
					style="color: var(--syntax-comment)">/* {toBinaryGroups(b, 8)} */</span>

printf(<span style="color: var(--syntax-string)">"%d %d %d\n"</span>,
       a <span style="color: var(--syntax-op)">&amp;</span> b,   <span
					style="color: var(--syntax-comment)">/* {andValue} */</span>
       a <span style="color: var(--syntax-op)">|</span> b,   <span
					style="color: var(--syntax-comment)">/* {orValue} */</span>
       a <span style="color: var(--syntax-op)">^</span> b);  <span
					style="color: var(--syntax-comment)">/* {xorValue} */</span></code
			></pre>
		<figcaption class="mt-2 text-micro leading-[1.5] text-muted-text">
			The C program and the grid are the same three operations. The operators are eager: both
			operands are always evaluated, unlike <code class="font-mono">&amp;&amp;</code> and
			<code class="font-mono">||</code>.
		</figcaption>
	</figure>

	<details class="mt-5 border-t border-gray/40 pt-3">
		<summary class="cursor-pointer text-micro uppercase text-muted-text">Accessible version</summary>
		<table class="mt-3 w-full border-collapse text-left text-micro">
			<caption class="sr-only">
				Bit values of a, b, and the three bitwise results
			</caption>
			<thead>
				<tr class="text-muted-text">
					<th scope="col" class="py-1 pr-3 font-normal">Bit</th>
					<th scope="col" class="py-1 pr-3 font-normal">Place</th>
					<th scope="col" class="py-1 pr-3 font-normal">a</th>
					<th scope="col" class="py-1 pr-3 font-normal">b</th>
					<th scope="col" class="py-1 pr-3 font-normal">a &amp; b</th>
					<th scope="col" class="py-1 pr-3 font-normal">a | b</th>
					<th scope="col" class="py-1 font-normal">a ^ b</th>
				</tr>
			</thead>
			<tbody class="font-mono tabular-nums text-dark-gray">
				{#each indices as index (index)}
					<tr class="border-t border-gray/30">
						<th scope="row" class="py-1 pr-3 text-left font-normal text-slate">{index}</th>
						<td class="py-1 pr-3">{2 ** index}</td>
						<td class="py-1 pr-3">{getBit(a, index) ? 1 : 0}</td>
						<td class="py-1 pr-3">{getBit(b, index) ? 1 : 0}</td>
						<td class="py-1 pr-3">{getBit(andValue, index) ? 1 : 0}</td>
						<td class="py-1 pr-3">{getBit(orValue, index) ? 1 : 0}</td>
						<td class="py-1">{getBit(xorValue, index) ? 1 : 0}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="mt-2 font-mono text-micro text-dark-gray">
			a = {a} · b = {b} · a &amp; b = {andValue} · a | b = {orValue} · a ^ b = {xorValue}
		</p>
	</details>
</section>