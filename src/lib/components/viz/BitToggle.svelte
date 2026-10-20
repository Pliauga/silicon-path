<script lang="ts">
	import { untrack } from 'svelte';
	import { getBit, setBit, toggleBit } from '$lib/utils/bit';
	import { describeAscii, toAscii, toBinaryGroups, toHex, toOctal } from '$lib/utils/number';

	/**
	 * An 8-bit register you can poke.
	 *
	 * The row is a single roving-tabindex group: one Tab stop, arrow keys walk
	 * between bits, Space/Enter flips, `0`/`1` sets an absolute value. The
	 * `<details>` block below is the plain-table fallback required by the
	 * accessibility contract; the numeric readouts above it stay visible so a
	 * sighted keyboard user gets the same information without opening anything.
	 */
	interface Props {
		/** Starting value, 0–255. */
		initial?: number;
		/** Caption above the control. */
		label?: string;
	}

	let { initial = 0b1010_0101, label = 'Poke the bits' }: Props = $props();

	/** Seeded once on purpose: the widget owns its value after mount. */
	const seed = untrack(() => initial) & 0xff;
	let value = $state(seed);
	/** Which bit holds the group's single tab stop. Bit 7 leads. */
	let active = $state(7);
	let buttons: HTMLButtonElement[] = $state([]);

	const bits = $derived(
		Array.from({ length: 8 }, (_, i) => {
			const index = 7 - i;
			return { index, on: getBit(value, index) };
		})
	);

	const hex = $derived(toHex(value, 8));
	const octal = $derived(toOctal(value, 8));
	const binary = $derived(toBinaryGroups(value, 8));
	const ascii = $derived(toAscii(value));
	const asciiLabel = $derived(describeAscii(value));

	function focusBit(index: number): void {
		active = index;
		buttons[7 - index]?.focus();
	}

	function flip(index: number): void {
		value = toggleBit(value, index) & 0xff;
	}

	function onKeydown(event: KeyboardEvent, index: number): void {
		const map: Record<string, number> = {
			ArrowLeft: index + 1,
			ArrowRight: index - 1,
			Home: 7,
			End: 0
		};
		const target = map[event.key];
		if (typeof target === 'number') {
			event.preventDefault();
			if (target < 0 || target > 7) return;
			focusBit(target);
			return;
		}
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			flip(index);
			return;
		}
		if (event.key === '0' || event.key === '1') {
			event.preventDefault();
			value = setBit(value, index, event.key === '1') & 0xff;
		}
	}

	function reset(): void {
		value = seed;
		active = 7;
	}
</script>

<div class="callout my-12">
	<div class="mb-4 flex items-baseline justify-between gap-3">
		<p class="font-mono text-micro tracking-[0.06em] text-muted-text uppercase">{label}</p>
		<button
			type="button"
			onclick={reset}
			class="text-micro text-muted-text underline decoration-gray underline-offset-2 transition-colors duration-200 hover:text-slate"
		>
			Reset
		</button>
	</div>

	<!-- Bit row: MSB on the left, matching binary notation. -->
	<div
		class="flex items-end gap-1.5"
		role="group"
		aria-label="Eight bit register, bit 7 most significant"
	>
		{#each bits as bit (bit.index)}
			<div class="flex flex-col items-center gap-1">
				<span class="font-mono text-micro text-muted-text" aria-hidden="true">{bit.index}</span>
				<button
					type="button"
					bind:this={buttons[7 - bit.index]}
					tabindex={bit.index === active ? 0 : -1}
					onclick={() => flip(bit.index)}
					onfocus={() => (active = bit.index)}
					onkeydown={(event) => onKeydown(event, bit.index)}
					aria-pressed={bit.on}
					aria-label="Bit {bit.index}, currently {bit.on ? 1 : 0}"
					class={[
						'flex size-9 items-center justify-center font-mono text-small tabular-nums active:translate-y-px',
						'transition-colors duration-200',
						bit.on
							? 'bg-clay text-accent-text hover:bg-clay-hover'
							: 'bg-ivory text-dark-gray hover:bg-ivory-dark hover:text-slate'
					].join(' ')}
				>
					{bit.on ? 1 : 0}
				</button>
			</div>
		{/each}
	</div>

	<!-- Readouts: the same byte under five different agreements about how to read it. -->
	<dl class="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
		<div>
			<dt class="text-micro text-muted-text">Decimal (unsigned)</dt>
			<dd class="font-mono text-small tabular-nums text-slate">{value}</dd>
		</div>
		<div>
			<dt class="text-micro text-muted-text">Hex</dt>
			<dd class="font-mono text-small tabular-nums text-slate">{hex}</dd>
		</div>
		<div>
			<dt class="text-micro text-muted-text">Octal</dt>
			<dd class="font-mono text-small tabular-nums text-slate">{octal}</dd>
		</div>
		<div>
			<dt class="text-micro text-muted-text">Binary</dt>
			<dd class="font-mono text-small tabular-nums text-slate">{binary}</dd>
		</div>
		<div>
			<dt class="text-micro text-muted-text">ASCII</dt>
			<dd class="font-mono text-small tabular-nums text-slate">{ascii}</dd>
		</div>
	</dl>

	<p class="sr-only" aria-live="polite">
		Value is now {value} in decimal, {hex} in hex, {octal} in octal, {binary} in binary. ASCII
		{asciiLabel}.
	</p>

	<details class="mt-6 border-t border-gray/40 pt-3">
		<summary class="text-micro text-muted-text">Accessible version</summary>
		<table class="mt-3 w-full text-left text-micro">
			<caption class="sr-only">Bit index and state for the current byte</caption>
			<thead class="text-muted-text">
				<tr>
					<th scope="col" class="py-1 font-medium">Bit</th>
					<th scope="col" class="py-1 font-medium">Place value</th>
					<th scope="col" class="py-1 font-medium">State</th>
				</tr>
			</thead>
			<tbody class="font-mono tabular-nums text-dark-gray">
				{#each bits as bit (bit.index)}
					<tr>
						<td class="py-0.5">{bit.index}</td>
						<td class="py-0.5">{2 ** bit.index}</td>
						<td class="py-0.5">{bit.on ? 1 : 0}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</details>
</div>