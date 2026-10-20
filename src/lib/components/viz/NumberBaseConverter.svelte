<script lang="ts">
	import { untrack } from 'svelte';
	import {
		BASE_LABELS,
		BASE_PREFIXES,
		MAX_CONVERSION_VALUE,
		convertFromDecimal,
		groupBinary,
		type ConversionBase
	} from '$lib/utils/bases';

	/**
	 * Decimal → binary / octal / hexadecimal, with the long division visible.
	 *
	 * The worksheet's EX 5 asks for the steps, not just the answer. Each base
	 * therefore shows the repeated division as a real table, in the order the
	 * algorithm writes the digits, with the "read upwards" note attached.
	 */
	interface Props {
		/** Starting decimal value. */
		value?: number;
	}

	let { value = 42 }: Props = $props();

	const PRESETS = [42, 12345, 255];
	const BASES: ConversionBase[] = [2, 8, 16];

	let raw = $state(untrack(() => String(value)));

	const parsed = $derived(Number(raw));
	const safe = $derived(
		Number.isFinite(parsed) ? Math.min(MAX_CONVERSION_VALUE, Math.max(0, Math.trunc(parsed))) : 0
	);

	const conversions = $derived(BASES.map((base) => convertFromDecimal(safe, base)));

	function setValue(next: number): void {
		raw = String(next);
	}

	function onInput(event: Event): void {
		raw = (event.currentTarget as HTMLInputElement).value;
	}
</script>

<section class="callout my-8" aria-labelledby="base-converter-title">
	<header class="flex flex-wrap items-baseline justify-between gap-2">
		<div>
			<h3 id="base-converter-title" class="text-h3 text-slate">The same number, three bases</h3>
			<p class="mt-1 max-w-[58ch] text-small leading-[1.55] text-dark-gray">
				Type a decimal number. Each column divides by its base until the quotient reaches
				zero; read the remainders from the bottom up to get the digits.
			</p>
		</div>
		<p class="font-mono text-micro text-muted-text">0–{MAX_CONVERSION_VALUE.toLocaleString('en')}</p>
	</header>

	<div class="mt-5 flex flex-wrap items-end gap-3">
		<label class="block">
			<span class="mb-1 block font-mono text-micro tracking-[0.08em] text-muted-text uppercase">
				Decimal
			</span>
			<input
				type="number"
				min="0"
				max={MAX_CONVERSION_VALUE}
				step="1"
				value={raw}
				oninput={onInput}
				class="w-36 border-b border-gray bg-transparent px-1 py-1.5 font-mono text-h3 text-slate tabular-nums focus:border-slate focus:outline-none"
				aria-describedby="base-converter-hint"
			/>
			<span id="base-converter-hint" class="sr-only">Enter a whole number from 0 to one million.</span>
		</label>

		<div class="flex flex-wrap items-center gap-2 pb-1.5">
			{#each PRESETS as preset (preset)}
				<button
					type="button"
					class="btn-editorial"
					onclick={() => setValue(preset)}
				>
					{preset}
				</button>
			{/each}
		</div>
	</div>

	<div class="mt-6 space-y-5">
		{#each conversions as conversion, index (conversion.base)}
			{@const label = BASE_LABELS[conversion.base]}
			<div class="border-t border-gray/40 pt-4">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<p class="font-mono text-micro tracking-[0.08em] text-clay-ink uppercase">
						{label} · base {conversion.base}
					</p>
					<p class="font-mono text-small text-muted-text">
						{BASE_PREFIXES[conversion.base]}{conversion.digits}
					</p>
				</div>
				<p class="mt-1 font-mono text-h3 tracking-tight text-slate">
					{index === 0 ? groupBinary(conversion.digits) : conversion.digits}
				</p>

				{#if conversion.steps.length === 0}
					<p class="mt-2 text-small text-dark-gray">Zero is zero in every base — no division needed.</p>
				{:else}
					<div class="mt-3 overflow-x-auto">
						<table class="w-full min-w-[34rem] border-collapse font-mono text-code">
							<caption class="sr-only">
								Repeated division of {safe} by {conversion.base}, remainder by remainder
							</caption>
							<thead>
								<tr class="border-b border-gray/60 text-left text-micro tracking-[0.06em] text-muted-text uppercase">
									<th scope="col" class="py-1.5 pr-3 font-normal">Step</th>
									<th scope="col" class="py-1.5 pr-3 font-normal">Division</th>
									<th scope="col" class="py-1.5 pr-3 font-normal">Quotient</th>
									<th scope="col" class="py-1.5 pr-3 font-normal">Remainder</th>
									<th scope="col" class="py-1.5 font-normal">Digit</th>
								</tr>
							</thead>
							<tbody>
								{#each conversion.steps as step (step.step)}
									<tr class="border-b border-gray/25 last:border-0">
										<td class="py-1.5 pr-3 tabular-nums text-muted-text">{step.step}</td>
										<td class="py-1.5 pr-3 tabular-nums text-slate">
											{step.dividend} ÷ {conversion.base}
										</td>
										<td class="py-1.5 pr-3 tabular-nums text-dark-gray">{step.quotient}</td>
										<td class="py-1.5 pr-3 tabular-nums text-dark-gray">{step.remainder}</td>
										<td class="py-1.5 font-bold text-slate">{step.digit}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="mt-2 text-micro text-muted-text">
						Read the Digit column from the bottom row upwards: {conversion.digits}.{conversion.digits.length > 1
							? ''
							: ' The single digit is the whole number.'}
					</p>
				{/if}
			</div>
		{/each}
	</div>

	<p class="sr-only" aria-live="polite">
		Decimal {safe} is {conversions[0].digits} in binary, {conversions[1].digits} in octal, and {conversions[2]
			.digits} in hexadecimal.
	</p>
</section>