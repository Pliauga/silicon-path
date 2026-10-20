<script lang="ts">
	import { untrack } from 'svelte';
	import { encodeFloat, groupFractionBits } from '$lib/utils/floating-point';

	/**
	 * A 32-bit float, bit by bit.
	 *
	 * The worksheet's EX 9 wants the sign, exponent and mantissa of a decimal
	 * value written out. This visualiser shows the wire, then the three fields,
	 * then the arithmetic that put each field there — including the residue that
	 * proves 4.1 was never stored as 4.1.
	 */
	interface Props {
		value?: number;
	}

	let { value = 12.5 }: Props = $props();

	const PRESETS = [12.5, 0.75, 0.1, 4.1, -2.25];
	const MAX_MAGNITUDE = 3e38;

	let raw = $state(untrack(() => String(value)));
	let activeField = $state<'sign' | 'exponent' | 'mantissa'>('sign');

	const parsed = $derived(Number(raw));
	const safe = $derived(
		Number.isFinite(parsed)
			? Math.max(-MAX_MAGNITUDE, Math.min(MAX_MAGNITUDE, parsed))
			: 0
	);
	const encoded = $derived(encodeFloat(safe));

	const exponentBits = $derived(encoded.exponentField.toString(2).padStart(8, '0'));
	const fractionGroups = $derived(
		encoded.fractionBits.match(/.{1,4}/g) ?? ['0000']
	);

	const exact = $derived(encoded.relativeError === 0);
	const absoluteError = $derived(Math.abs(encoded.storedValue - encoded.value));
	const fieldCopy = $derived(
		{
			sign: {
				heading: 'Sign — 1 bit',
				body:
					encoded.sign === 1
						? 'Bit 31 is 1, so the number is negative. IEEE-754 uses sign-magnitude memory for the sign, not two’s complement.'
						: 'Bit 31 is 0, so the number is non-negative. Positive zero and negative zero differ only in this bit.'
			},
			exponent: {
				heading: 'Exponent — 8 bits, biased by 127',
				body: `The field stores ${encoded.exponentField}, and ${encoded.exponentField} − 127 = ${encoded.exponent}. The stored exponent is the power of two applied after normalising the number to 1.xxxx₂.`
			},
			mantissa: {
				heading: 'Mantissa — 23 fraction bits',
				body: `The leading 1 is implicit and never stored. The 23 bits here are worth ${encoded.fractionBits}₂, which is ${Number((encoded.fractionField / 2 ** 23).toFixed(9))} as a fraction — enough precision for about seven significant decimal digits.`
			}
		}[activeField] as { heading: string; body: string }
	);

	function onInput(event: Event): void {
		raw = (event.currentTarget as HTMLInputElement).value;
	}

	function setValue(next: number): void {
		raw = String(next);
	}
</script>

<section class="callout my-8" aria-labelledby="float-title">
	<header class="flex flex-wrap items-baseline justify-between gap-2">
		<div>
			<h3 id="float-title" class="text-h3 text-slate">One decimal, thirty-two bits</h3>
			<p class="mt-1 max-w-[58ch] text-small leading-[1.55] text-dark-gray">
				Adjust the decimal value and watch the sign, exponent and fraction fields change.
				The last line is the honest one: it reads the stored bits back as a decimal.
			</p>
		</div>
		<p class="font-mono text-micro text-muted-text">single precision · 32 bits</p>
	</header>

	<div class="mt-5 flex flex-wrap items-end gap-3">
		<label class="block">
			<span class="mb-1 block font-mono text-micro tracking-[0.08em] text-muted-text uppercase">
				Decimal
			</span>
			<input
				type="number"
				step="any"
				value={raw}
				oninput={onInput}
				class="w-36 border-b border-gray bg-transparent px-1 py-1.5 font-mono text-h3 text-slate tabular-nums focus:border-slate focus:outline-none"
				aria-describedby="float-hint"
			/>
			<span id="float-hint" class="sr-only">
				Enter a decimal number between minus and plus three times ten to the thirty-eighth.
				Values are rounded to the nearest single-precision float.
			</span>
		</label>
		<div class="flex flex-wrap gap-2 pb-1.5">
			{#each PRESETS as preset (preset)}
				<button type="button" class="btn-editorial" onclick={() => setValue(preset)}>
					{preset}
				</button>
			{/each}
		</div>
	</div>

	<!-- The 32-bit wire -->
	<div class="mt-6 overflow-x-auto" aria-hidden="true">
		<div class="flex min-w-[36rem] items-end gap-3">
			<div class="flex flex-col items-center gap-1">
				<div class="flex h-9 w-9 items-center justify-center font-mono text-h3 text-clay-ink ring-1 ring-gray/50">
					{encoded.sign}
				</div>
				<span class="font-mono text-micro text-muted-text">31</span>
			</div>

			<div class="flex flex-col items-center gap-1">
				<div class="flex gap-px">
					{#each [...exponentBits] as bit, index (index)}
						<span
							class="flex h-9 w-[1.55rem] items-center justify-center font-mono text-small text-slate ring-1 ring-gray/40"
						>
							{bit}
						</span>
					{/each}
				</div>
				<span class="font-mono text-micro text-muted-text">30 … 23</span>
			</div>

			<div class="flex flex-col items-start gap-1">
				<div class="flex gap-1.5">
					{#each fractionGroups as group, index (index)}
						<div class="flex gap-px">
							{#each [...group] as bit, bitIndex (bitIndex)}
								<span
									class="flex h-9 w-[1.55rem] items-center justify-center font-mono text-small text-slate ring-1 ring-gray/40"
								>
									{bit}
								</span>
							{/each}
						</div>
					{/each}
				</div>
				<span class="font-mono text-micro text-muted-text">22 … 0 · {encoded.hex}</span>
			</div>
		</div>
	</div>

	<!-- Field explanations -->
	<div class="mt-6 flex flex-wrap gap-1" role="group" aria-label="Inspect a field">
		{#each ['sign', 'exponent', 'mantissa'] as field (field)}
			<button
				type="button"
				class={[
					'btn-editorial',
					activeField === field ? 'btn-clay' : ''
				].join(' ')}
				aria-pressed={activeField === field}
				onclick={() => (activeField = field as 'sign' | 'exponent' | 'mantissa')}
			>
				{field === 'sign' ? 'Sign' : field === 'exponent' ? 'Exponent' : 'Mantissa'}
			</button>
		{/each}
	</div>
	<div class="mt-3 border-l-2 border-clay/60 pl-4">
		<p class="font-mono text-micro tracking-[0.06em] text-clay-ink uppercase">{fieldCopy.heading}</p>
		<p class="mt-1 max-w-[62ch] text-small leading-[1.6] text-dark-gray">{fieldCopy.body}</p>
	</div>

	<!-- The working -->
	<dl class="mt-6 grid gap-x-8 gap-y-3 font-mono text-code sm:grid-cols-2">
		<div>
			<dt class="text-micro tracking-[0.06em] text-muted-text uppercase">Normalised form</dt>
			<dd class="mt-0.5 text-slate">
				{encoded.isZero ? 'zero — every field is 0' : encoded.scientific}
			</dd>
		</div>
		<div>
			<dt class="text-micro tracking-[0.06em] text-muted-text uppercase">Sign · exponent field · fraction</dt>
			<dd class="mt-0.5 text-slate">
				{encoded.sign} · {encoded.exponentField} · {groupFractionBits(encoded.fractionBits)}
			</dd>
		</div>
		<div>
			<dt class="text-micro tracking-[0.06em] text-muted-text uppercase">Stored pattern</dt>
			<dd class="mt-0.5 text-slate">{encoded.rawBits}</dd>
		</div>
		<div>
			<dt class="text-micro tracking-[0.06em] text-muted-text uppercase">Read back as decimal</dt>
			<dd class="mt-0.5 text-slate">{encoded.storedValue}</dd>
		</div>
	</dl>

	<div class="mt-5 border-t border-gray/40 pt-4">
		{#if encoded.isZero}
			<p class="text-small leading-[1.6] text-dark-gray">
				Zero is a special pattern: sign 0 or 1, exponent field 0000 0000, fraction 000…0.
				No implicit 1 is applied, so the pattern reads as exactly zero.
			</p>
		{:else if exact}
			<p class="text-small leading-[1.6] text-dark-gray">
				This value is exactly representable: the fraction bits terminate inside 23 places,
				so the read-back is bit-for-bit the decimal you typed.
			</p>
		{:else}
			<p class="text-small leading-[1.6] text-dark-gray">
				This value is <strong class="font-bold text-slate">not</strong> exactly representable. The
				closest float differs by {absoluteError.toExponential(3)} — a relative error of
				{(encoded.relativeError * 100).toExponential(2)}%. Equality comparisons on floats are
				therefore a trap; compare with a tolerance instead.
			</p>
		{/if}
	</div>

	<details class="mt-4 text-small leading-[1.6] text-dark-gray">
		<summary class="cursor-pointer font-mono text-micro tracking-[0.06em] text-muted-text uppercase">
			Accessible version — field values
		</summary>
		<table class="mt-3 w-full max-w-[34rem] border-collapse font-mono text-code">
			<caption class="sr-only">IEEE-754 fields for {encoded.value}</caption>
			<tbody>
				<tr class="border-b border-gray/25">
					<th scope="row" class="py-1.5 pr-4 text-left font-normal text-muted-text">Sign</th>
					<td class="py-1.5 text-slate">{encoded.sign} ({encoded.sign === 1 ? 'negative' : 'positive'})</td>
				</tr>
				<tr class="border-b border-gray/25">
					<th scope="row" class="py-1.5 pr-4 text-left font-normal text-muted-text">Exponent field</th>
					<td class="py-1.5 text-slate">{encoded.exponentField} (unbiased {encoded.exponent})</td>
				</tr>
				<tr class="border-b border-gray/25">
					<th scope="row" class="py-1.5 pr-4 text-left font-normal text-muted-text">Fraction</th>
					<td class="py-1.5 break-all text-slate">{encoded.fractionBits}</td>
				</tr>
				<tr class="border-b border-gray/25">
					<th scope="row" class="py-1.5 pr-4 text-left font-normal text-muted-text">Hex</th>
					<td class="py-1.5 text-slate">{encoded.hex}</td>
				</tr>
				<tr>
					<th scope="row" class="py-1.5 pr-4 text-left font-normal text-muted-text">Stored decimal</th>
					<td class="py-1.5 text-slate">{encoded.storedValue}</td>
				</tr>
			</tbody>
		</table>
	</details>
</section>