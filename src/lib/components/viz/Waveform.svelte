<script lang="ts">
	import { applyGate, gateLabel, truthTableFor, type LogicGate, type LogicLevel } from '$lib/utils/logic';

	/**
	 * A four-step timing diagram, the kind the Week 2 worksheet asks students to
	 * draw by hand. Values change on the vertical transition; the flat run after
	 * it is the level the gate holds until the next change.
	 */
	interface Props {
		gate?: LogicGate;
		/** A levels, oldest step first. */
		a?: LogicLevel[];
		/** B levels, oldest step first. */
		b?: LogicLevel[];
	}

	let {
		gate = 'and',
		a = [0, 1, 1, 0],
		b = [0, 1, 0, 1]
	}: Props = $props();

	const steps = $derived(a.map((level, index) => ({ a: level, b: b[index] ?? 0 })));
	const output = $derived(steps.map((step) => applyGate(gate, step.a, step.b)));

	const VIEW_W = 380;
	const LEFT = 34;
	const RIGHT = 12;
	const ROW_GAP = 34;
	const ROWS = [
		{ label: 'A', top: 18 },
		{ label: 'B', top: 18 + ROW_GAP },
		{ label: 'Y', top: 18 + ROW_GAP * 2 }
	];
	const HIGH = 0;
	const LOW = 14;

	const stepWidth = $derived((VIEW_W - LEFT - RIGHT) / Math.max(steps.length, 1));

	function xAt(index: number): number {
		return LEFT + index * stepWidth;
	}

	function yAt(rowTop: number, level: LogicLevel): number {
		return rowTop + (level === 1 ? HIGH : LOW);
	}

	function pathFor(levels: LogicLevel[], rowTop: number): string {
		if (levels.length === 0) return '';
		let path = `M ${xAt(0)} ${yAt(rowTop, levels[0])}`;
		for (let i = 1; i < levels.length; i++) {
			const boundary = xAt(i);
			path += ` L ${boundary} ${yAt(rowTop, levels[i - 1])}`;
			path += ` L ${boundary} ${yAt(rowTop, levels[i])}`;
		}
		path += ` L ${xAt(levels.length)} ${yAt(rowTop, levels[levels.length - 1])}`;
		return path;
	}

	const table = $derived(truthTableFor(gate));
	const isNot = $derived(gate === 'not');
</script>

<section class="callout my-8" aria-labelledby="waveform-title">
	<header class="flex flex-wrap items-baseline justify-between gap-2">
		<div>
			<h3 id="waveform-title" class="text-h3 text-slate">Timing diagram: {gateLabel(gate)}</h3>
			<p class="mt-1 max-w-[58ch] text-small leading-[1.55] text-dark-gray">
				Each column is one time step. The output wire changes only after the inputs have
				settled; {isNot ? 'B is ignored by NOT.' : 'read each row left to right and apply the gate.'}
			</p>
		</div>
		<p class="font-mono text-micro text-muted-text">{steps.length} steps</p>
	</header>

	<div class="mt-5 overflow-x-auto">
		<svg
			viewBox="0 0 {VIEW_W} {ROWS[2].top + 42}"
			class="w-full min-w-[32rem]"
			role="img"
			aria-labelledby="waveform-svg-title waveform-svg-desc"
		>
			<title id="waveform-svg-title">{gateLabel(gate)} timing diagram</title>
			<desc id="waveform-svg-desc">
				Inputs A and B change across {steps.length} steps; output Y is {gateLabel(gate)}.
			</desc>

			{#each Array.from({ length: steps.length + 1 }, (_, index) => index) as boundary (boundary)}
				<line
					x1={xAt(boundary)}
					y1="8"
					x2={xAt(boundary)}
					y2={ROWS[2].top + 30}
					stroke="currentColor"
					class="text-gray/25"
					stroke-width="0.6"
				/>
				{#if boundary < steps.length}
					<text
						x={xAt(boundary) + 4}
						y="10"
						class="fill-muted-text"
						font-size="7"
						font-family="var(--font-mono)"
					>
						t{boundary + 1}
					</text>
				{/if}
			{/each}

			{#each ROWS as row, rowIndex (row.label)}
				{@const levels = rowIndex === 2 ? output : steps.map((step) => (rowIndex === 0 ? step.a : step.b))}
				<text
					x="4"
					y={row.top + 10}
					class="fill-slate"
					font-size="11"
					font-family="var(--font-mono)"
				>
					{row.label}
				</text>
				<path
					d={pathFor(levels, row.top)}
					fill="none"
					stroke-width="1.6"
					stroke-linecap="square"
					class={rowIndex === 2 ? 'stroke-clay-ink' : 'stroke-slate'}
				/>
				{#each levels as level, index (index)}
					<text
						x={xAt(index) + stepWidth / 2}
						y={row.top + 30}
						text-anchor="middle"
						class="fill-muted-text"
						font-size="8"
						font-family="var(--font-mono)"
					>
						{level}
					</text>
				{/each}
			{/each}
		</svg>
	</div>

	<div class="mt-5 grid gap-4 sm:grid-cols-2">
		<table class="w-full border-collapse font-mono text-code">
			<caption class="sr-only">Truth table for {gateLabel(gate)}</caption>
			<thead>
				<tr class="border-b border-gray/60 text-left text-micro tracking-[0.06em] text-muted-text uppercase">
					<th scope="col" class="py-1.5 pr-3 font-normal">A</th>
					<th scope="col" class="py-1.5 pr-3 font-normal">B</th>
					<th scope="col" class="py-1.5 font-normal">Y</th>
				</tr>
			</thead>
			<tbody>
				{#each table as row, index (index)}
					<tr class="border-b border-gray/25 last:border-0">
						<td class="py-1.5 pr-3 tabular-nums text-slate">{row.a}</td>
						<td class="py-1.5 pr-3 tabular-nums text-slate">{row.b}</td>
						<td class="py-1.5 font-bold tabular-nums text-slate">{row.y}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<details class="text-small leading-[1.6] text-dark-gray">
			<summary class="cursor-pointer font-mono text-micro tracking-[0.06em] text-muted-text uppercase">
				Accessible version — values per step
			</summary>
			<table class="mt-3 w-full border-collapse font-mono text-code">
				<thead>
					<tr class="border-b border-gray/60 text-left text-micro tracking-[0.06em] text-muted-text uppercase">
						<th scope="col" class="py-1.5 pr-3 font-normal">Step</th>
						<th scope="col" class="py-1.5 pr-3 font-normal">A</th>
						<th scope="col" class="py-1.5 pr-3 font-normal">B</th>
						<th scope="col" class="py-1.5 font-normal">Y</th>
					</tr>
				</thead>
				<tbody>
					{#each steps as step, index (index)}
						<tr class="border-b border-gray/25 last:border-0">
							<td class="py-1.5 pr-3 tabular-nums text-muted-text">{index + 1}</td>
							<td class="py-1.5 pr-3 tabular-nums text-slate">{step.a}</td>
							<td class="py-1.5 pr-3 tabular-nums text-slate">{step.b}</td>
							<td class="py-1.5 font-bold tabular-nums text-slate">{output[index]}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="mt-2">
				If the gate were toggled, the high levels would invert; the timing pattern is what the
				worksheet wants drawn.
			</p>
		</details>
	</div>
</section>