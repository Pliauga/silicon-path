<script lang="ts">
	import { untrack } from 'svelte';
	import {
		MAX_OPERAND,
		clampOperand,
		computeBinary,
		displayResult,
		formatBinary,
		operandWidth,
		type BinaryOperation
	} from '$lib/utils/binary-math';

	/**
	 * Binary addition and subtraction, one column at a time.
	 *
	 * The worksheet's EX 6 and EX 7 live or die on the carry and the borrow, so
	 * the widget draws the same grid a student would draw by hand: bit indices
	 * on top, the carried/borrowed digit above each column, the two operands
	 * aligned, and the result underneath. The step table says, in words, what
	 * each rule did.
	 */
	interface Props {
		initialA?: number;
		initialB?: number;
		operation?: BinaryOperation;
	}

	let {
		initialA = 159,
		initialB = 147,
		operation = 'add'
	}: Props = $props();

	let a = $state(untrack(() => clampOperand(initialA)));
	let b = $state(untrack(() => clampOperand(initialB)));
	let op = $state<BinaryOperation>(untrack(() => operation));

	const computation = $derived(computeBinary(op, a, b, operandWidth(a, b)));
	/** Columns displayed most-significant first, like a hand-written sum. */
	const displayColumns = $derived([...computation.columns].reverse());

	function onOperand(side: 'a' | 'b', event: Event): void {
		const next = clampOperand(Number((event.currentTarget as HTMLInputElement).value));
		if (side === 'a') a = next;
		else b = next;
	}

	function setOperation(next: BinaryOperation): void {
		op = next;
	}

	function preset(nextA: number, nextB: number, nextOp: BinaryOperation): void {
		a = nextA;
		b = nextB;
		op = nextOp;
	}

	const carryLabel = $derived(op === 'add' ? 'carry' : 'borrow');

	function columnRule(index: number): string {
		const column = computation.columns[index];
		if (!column) return '';
		if (op === 'add') {
			const total = column.a + column.b + column.carryIn;
			return `${column.a} + ${column.b} + ${column.carryIn} = ${total}`;
		}
		const raw = column.a - column.b - column.carryIn;
		return raw < 0
			? `${column.a} − ${column.b} − ${column.carryIn} < 0 → +2, ${carryLabel} 1`
			: `${column.a} − ${column.b} − ${column.carryIn} = ${raw}`;
	}
</script>

<section class="callout my-8" aria-labelledby="binary-math-title">
	<header class="flex flex-wrap items-baseline justify-between gap-2">
		<div>
			<h3 id="binary-math-title" class="text-h3 text-slate">Carries and borrows, in columns</h3>
			<p class="mt-1 max-w-[58ch] text-small leading-[1.55] text-dark-gray">
				Addition carries a 1 to the next column when a sum reaches two; subtraction borrows
				two from the next column when it would go negative. Change an operand and watch both
				the wiring and the working change.
			</p>
		</div>
		<p class="font-mono text-micro text-muted-text">0–{MAX_OPERAND}</p>
	</header>

	<div class="mt-5 flex flex-wrap items-end gap-x-4 gap-y-3">
		<label class="block">
			<span class="mb-1 block font-mono text-micro tracking-[0.08em] text-muted-text uppercase">A</span>
			<input
				type="number"
				min="0"
				max={MAX_OPERAND}
				step="1"
				value={a}
				oninput={(event) => onOperand('a', event)}
				class="w-24 border-b border-gray bg-transparent px-1 py-1.5 font-mono text-h3 text-slate tabular-nums focus:border-slate focus:outline-none"
			/>
		</label>

		<div class="flex items-center gap-1 pb-1" role="group" aria-label="Operation">
			<button
				type="button"
				class={[
					'btn-editorial',
					op === 'add' ? 'btn-clay' : ''
				].join(' ')}
				aria-pressed={op === 'add'}
				onclick={() => setOperation('add')}
			>
				A + B
			</button>
			<button
				type="button"
				class={[
					'btn-editorial',
					op === 'subtract' ? 'btn-clay' : ''
				].join(' ')}
				aria-pressed={op === 'subtract'}
				onclick={() => setOperation('subtract')}
			>
				A − B
			</button>
		</div>

		<label class="block">
			<span class="mb-1 block font-mono text-micro tracking-[0.08em] text-muted-text uppercase">B</span>
			<input
				type="number"
				min="0"
				max={MAX_OPERAND}
				step="1"
				value={b}
				oninput={(event) => onOperand('b', event)}
				class="w-24 border-b border-gray bg-transparent px-1 py-1.5 font-mono text-h3 text-slate tabular-nums focus:border-slate focus:outline-none"
			/>
		</label>

		<button
			type="button"
			class="btn-editorial mb-1"
			onclick={() => preset(159, 147, 'add')}
		>
			Worksheet: 159 + 147
		</button>
		<button
			type="button"
			class="btn-editorial mb-1"
			onclick={() => preset(138, 75, 'subtract')}
		>
			138 − 75
		</button>
	</div>

	<div class="mt-6 overflow-x-auto">
		<div style="min-width: {computation.width * 2.6 + 6}rem">
			<!-- The carried/borrowed digit sits above its destination column. -->
			<div
				class="mb-1 grid items-end gap-1"
				style="grid-template-columns: 5rem repeat({computation.width}, minmax(0, 1fr))"
			>
				<span class="text-right font-mono text-micro text-muted-text">
					{carryLabel} in
				</span>
				{#each displayColumns as column (column.index)}
					<span
						class="text-center font-mono text-small tabular-nums {column.carryIn
							? 'text-clay-ink'
							: 'text-muted-text'}"
						aria-label="Bit {column.index} {carryLabel} in {column.carryIn}"
					>
						{column.carryIn}
					</span>
				{/each}
			</div>

			<div
				class="mb-1 grid items-center gap-1"
				style="grid-template-columns: 5rem repeat({computation.width}, minmax(0, 1fr))"
			>
				<span class="text-right font-mono text-small text-slate">A</span>
				{#each displayColumns as column (column.index)}
					<span class="text-center font-mono text-small tabular-nums text-slate">
						{column.a}
					</span>
				{/each}
			</div>

			<div
				class="mb-1 grid items-center gap-1"
				style="grid-template-columns: 5rem repeat({computation.width}, minmax(0, 1fr))"
			>
				<span class="text-right font-mono text-small text-slate">
					{op === 'add' ? '+' : '−'}
				</span>
				{#each displayColumns as column (column.index)}
					<span class="text-center font-mono text-small tabular-nums text-slate">
						{column.b}
					</span>
				{/each}
			</div>

			<div class="mb-2 h-px bg-gray/60" aria-hidden="true"></div>

			<div
				class="grid items-center gap-1"
				style="grid-template-columns: 5rem repeat({computation.width}, minmax(0, 1fr))"
			>
				<span class="text-right font-mono text-small text-slate">=</span>
				{#each displayColumns as column (column.index)}
					<span
						class="text-center font-mono text-small font-bold tabular-nums text-{column.result
							? 'slate'
							: 'muted-text'}"
					>
						{column.result}
					</span>
				{/each}
			</div>

			<div
				class="mt-3 flex flex-wrap items-baseline justify-between gap-3 border-t border-gray/40 pt-3"
			>
				<div>
					<p class="font-mono text-micro tracking-[0.08em] text-muted-text uppercase">Result</p>
					<p class="mt-1 font-mono text-small text-slate">
						<span class="text-h3">{formatBinary(computation.result, computation.width)}</span>
					</p>
				</div>
				<div class="text-right">
					<p class="font-mono text-micro tracking-[0.08em] text-muted-text uppercase">
						Decimal
					</p>
					<p class="mt-1 font-mono text-h3 tabular-nums text-slate">{displayResult(computation)}</p>
				</div>
				<div class="text-right">
					<p class="font-mono text-micro tracking-[0.08em] text-muted-text uppercase">
						{carryLabel} out
					</p>
					<p
						class="mt-1 font-mono text-h3 tabular-nums {computation.carryOut
							? 'text-clay-ink'
							: 'text-muted-text'}"
					>
						{computation.carryOut}
					</p>
				</div>
			</div>

			{#if computation.wrapped}
				<p class="mt-2 text-small leading-[1.55] text-dark-gray">
					{#if op === 'add'}
						The true sum is {computation.exact}, which needs {computation.exact > 0
							? Math.floor(Math.log2(computation.exact)) + 1
							: 1} bits. The extra 1 escapes as the carry out; only the low {computation.width}
						bits fit in the row above.
					{:else}
						B is larger than A, so the subtraction borrows past the most significant column.
						The register holds the low {computation.width} bits; the borrow out records the
						shortfall.
					{/if}
				</p>
			{/if}
		</div>
	</div>

	<div class="mt-6 overflow-x-auto">
		<table class="w-full min-w-[38rem] border-collapse font-mono text-code">
			<caption class="sr-only">
				Column working for {a} {op === 'add' ? 'plus' : 'minus'} {b}
			</caption>
			<thead>
				<tr class="border-b border-gray/60 text-left text-micro tracking-[0.06em] text-muted-text uppercase">
					<th scope="col" class="py-1.5 pr-3 font-normal">Bit</th>
					<th scope="col" class="py-1.5 pr-3 font-normal">A</th>
					<th scope="col" class="py-1.5 pr-3 font-normal">B</th>
					<th scope="col" class="py-1.5 pr-3 font-normal">{carryLabel} in</th>
					<th scope="col" class="py-1.5 pr-3 font-normal">Rule</th>
					<th scope="col" class="py-1.5 pr-3 font-normal">Result</th>
					<th scope="col" class="py-1.5 font-normal">{carryLabel} out</th>
				</tr>
			</thead>
			<tbody>
				{#each computation.columns as column (column.index)}
					<tr class="border-b border-gray/25 last:border-0">
						<td class="py-1.5 pr-3 tabular-nums text-muted-text">{column.index}</td>
						<td class="py-1.5 pr-3 tabular-nums text-slate">{column.a}</td>
						<td class="py-1.5 pr-3 tabular-nums text-slate">{column.b}</td>
						<td class="py-1.5 pr-3 tabular-nums {column.carryIn ? 'text-clay-ink' : 'text-dark-gray'}">
							{column.carryIn}
						</td>
						<td class="py-1.5 pr-3 text-dark-gray">{columnRule(column.index)}</td>
						<td class="py-1.5 pr-3 font-bold tabular-nums text-slate">{column.result}</td>
						<td class="py-1.5 tabular-nums {column.carryOut ? 'text-clay-ink' : 'text-dark-gray'}">
							{column.carryOut}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="mt-2 text-micro text-muted-text">
		Columns are listed least-significant first — the order the hardware executes them.
	</p>

	<p class="sr-only" aria-live="polite">
		{a} {op === 'add' ? 'plus' : 'minus'} {b} is {displayResult(computation)}. Result bits:
		{formatBinary(computation.result, computation.width)}. {carryLabel} out: {computation.carryOut}.
	</p>
</section>