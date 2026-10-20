<script lang="ts">
	import { settings } from '$lib/stores/settings.svelte';
	import {
		CELLS,
		STEPS,
		applyStep,
		canAdvance,
		formatValue,
		initialState,
		judge,
		stepAt,
		summary,
		type CellId,
		type MemoryState
	} from '$lib/viz/pointer-sandbox';

	/**
	 * Predict → Observe → Explain for pointers.
	 *
	 * The gating is the pedagogy, so it is deliberately strict: while the
	 * question is open, clicking a cell *only* records a prediction, and the
	 * step control cannot be pressed. A wrong prediction is never blocked —
	 * it is executed, then set against the real state ("state differential").
	 *
	 * The model lives in `pointer-sandbox.ts`; this file owns runes and pixels.
	 */

	type Stage = 'predict' | 'reveal' | 'done';

	let memory = $state<MemoryState>(initialState());
	let stepIndex = $state(0);
	let stage = $state<Stage>('predict');
	let prediction = $state<CellId | null>(null);
	let correct = $state<boolean | null>(null);

	const step = $derived(stepAt(stepIndex));
	const done = $derived(stage === 'done');
	const atLastStep = $derived(stepIndex === STEPS.length - 1);
	const mode = $derived(settings.analogyMode);
	const analogy = $derived(step.explain[mode]);
	const target = $derived(memory.cells.p.pointsTo);
	const locked = $derived(stage !== 'predict');
	const stepDisabled = $derived(stage === 'predict' && prediction === null);

	/** Where the pointer's row sits in the board, for the connector. */
	function rowCentre(id: CellId): number {
		const index = CELLS.findIndex((cell) => cell.id === id);
		return 36 + index * 80;
	}

	const arrowPath = $derived.by(() => {
		if (target === null) return '';
		const from = rowCentre('p');
		const to = rowCentre(target);
		return `M 4 ${from} H 32 V ${to} H 72`;
	});

	function choose(id: CellId): void {
		if (locked) return;
		prediction = id;
	}

	function advance(): void {
		if (done) {
			restart();
			return;
		}
		if (stage === 'predict') {
			if (!canAdvance(prediction) || prediction === null) return;
			correct = judge(stepIndex, prediction);
			memory = applyStep(memory, stepIndex);
			stage = 'reveal';
			return;
		}
		// stage === 'reveal'
		if (atLastStep) {
			stage = 'done';
			return;
		}
		stepIndex += 1;
		prediction = null;
		correct = null;
		stage = 'predict';
	}

	function restart(): void {
		memory = initialState();
		stepIndex = 0;
		stage = 'predict';
		prediction = null;
		correct = null;
	}

	/** The state differential for a wrong pick, or the plain confirmation. */
	function feedback(): string {
		if (correct === null) return '';
		if (correct) return step.reveal;
		const particular = prediction === null ? undefined : step.misconceived[prediction];
		return particular ? `Not this one. ${particular} ${step.differential}` : step.differential;
	}

	const stepLabel = $derived(done ? 'Start over' : stage === 'predict' ? 'Reveal step' : atLastStep ? 'Finish' : 'Next step');
</script>

<section
	class="callout my-12 !p-0"
	aria-labelledby="pointer-sandbox-title"
>
	<header class="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray/40 px-6 py-4">
		<div>
			<h3 id="pointer-sandbox-title" class="text-h3 text-slate">
				Pointer sandbox
			</h3>
			<p class="mt-1 text-small leading-[1.5] text-dark-gray">
				Predict before you look. Guess wrong on purpose — that is what makes the arrow stick.
			</p>
		</div>
		<span
			class="font-mono text-micro text-muted-text"
		>
			{done ? 'Complete' : `Step ${stepIndex + 1} of ${STEPS.length}`}
		</span>
	</header>

	<div class="grid gap-6 px-6 pb-6 pt-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
		<div class="relative flex gap-4">
			<ol class="flex min-w-0 flex-1 flex-col gap-2">
				{#each CELLS as cell (cell.id)}
					{@const state = memory.cells[cell.id]}
					{@const isGuess = stage === 'reveal' && prediction === cell.id}
					<li class="h-[4.5rem]">
						<button
							type="button"
							disabled={locked}
							aria-pressed={prediction === cell.id}
							onclick={() => choose(cell.id)}
							class="flex h-full w-full items-center gap-3 border-l-2 px-3 text-left transition-colors duration-200 disabled:cursor-default
							{correct === false && isGuess
								? 'border-warning bg-ivory'
								: prediction === cell.id && stage === 'predict'
									? 'border-clay bg-accent-muted'
									: memory.changed === cell.id
										? 'border-clay bg-ivory'
										: 'border-gray/40 bg-ivory'}
							{locked ? '' : 'cursor-pointer hover:bg-ivory-dark'}"
						>
							<span class="w-16 shrink-0">
								<span class="block font-mono text-code text-slate">{cell.name}</span>
								<span class="block font-mono text-micro text-muted-text">{cell.address}</span>
							</span>
							<span class="w-14 shrink-0 font-mono text-micro text-muted-text">{cell.type}</span>
							<span class="flex min-w-0 flex-1 items-center justify-end gap-2">
								{#if cell.id === 'p' && target !== null}
									<span class="text-micro text-muted-text">→ {target}</span>
								{/if}
								<span
									class="font-mono text-code tabular-nums {memory.changed === cell.id
										? 'text-clay-ink'
										: 'text-slate'}"
								>
									{formatValue(cell, state)}
								</span>
							</span>
						</button>
					</li>
				{/each}
			</ol>

			<!-- The connector is decorative: the pointer row also prints "→ a". -->
			<div class="hidden w-20 shrink-0 lg:block" aria-hidden="true">
				<svg viewBox="0 0 80 232" class="h-[232px] w-full text-clay-ink" fill="none">
					<defs>
						<marker
							id="pointer-sandbox-head"
							viewBox="0 0 10 10"
							refX="9"
							refY="5"
							markerWidth="5"
							markerHeight="5"
							orient="auto"
						>
							<path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
						</marker>
					</defs>
					{#if arrowPath}
						<path
							d={arrowPath}
							stroke="currentColor"
							stroke-width="1.5"
							marker-end="url(#pointer-sandbox-head)"
						/>
					{/if}
				</svg>
			</div>
		</div>

		<div class="flex min-w-0 flex-col">
			<p class="text-micro uppercase text-muted-text">
				Line {stepIndex + 1}
			</p>
			<code
				class="mt-1 block overflow-x-auto border-l-2 border-clay bg-ivory px-3 py-2 font-mono text-code text-slate"
			>
				{step.code}
			</code>

			<p class="mt-4 text-body leading-[1.65] text-slate">{step.question}</p>
			<p class="mt-1 text-small text-dark-gray">
				{#if locked}
					{#if correct === false}
						The machine ran anyway. Read the difference, then carry on.
					{:else}
						That is what actually happened.
					{/if}
				{:else}
					Pick a cell, then reveal the step.
				{/if}
			</p>

			<div class="mt-3 min-h-[5.5rem] text-small leading-[1.6]" aria-live="polite">
				{#if stage !== 'predict' && correct !== null}
					<p class={correct ? 'text-slate' : 'text-slate'}>
						<span class="font-bold {correct ? 'text-clay-ink' : 'text-warning'}">
							{correct ? 'Correct. ' : 'Not quite. '}
						</span>
						{feedback()}
					</p>
					{#if done}
						<p class="mt-2 text-dark-gray">{summary(memory)}</p>
					{/if}
				{/if}
			</div>

			{#if stage !== 'predict' && correct !== null}
				<p class="mt-2 border-l border-gray pl-3 text-small leading-[1.6] text-dark-gray">
					<span class="font-bold text-slate"
						>{mode === 'football' ? 'Football: ' : 'Money: '}</span
					>{analogy}
				</p>
			{/if}

			<div class="mt-auto flex flex-wrap items-center gap-3 pt-4">
				<button
					type="button"
					onclick={advance}
					disabled={stepDisabled}
					class="btn-editorial btn-clay"
				>
					{stepLabel}
				</button>
				{#if stage !== 'predict' && !done}
					<button
						type="button"
						onclick={restart}
						class="text-small text-dark-gray underline-offset-4 transition-colors duration-200 hover:text-slate hover:underline"
					>
						Restart
					</button>
				{/if}
			</div>
		</div>
	</div>

	<details class="border-t border-gray/40 px-6 py-4">
		<summary
			class="cursor-pointer text-micro uppercase text-muted-text marker:text-muted-text"
		>
			Accessible version
		</summary>
		<table class="mt-3 w-full border-collapse text-small">
			<caption class="sr-only">
				Memory cells, addresses and current values
			</caption>
			<thead>
				<tr class="text-left text-micro uppercase text-muted-text">
					<th scope="col" class="py-1 pr-3 font-normal">Cell</th>
					<th scope="col" class="py-1 pr-3 font-normal">Address</th>
					<th scope="col" class="py-1 pr-3 font-normal">Type</th>
					<th scope="col" class="py-1 pr-3 font-normal">Value</th>
					<th scope="col" class="py-1 font-normal">Points to</th>
				</tr>
			</thead>
			<tbody>
				{#each CELLS as cell (cell.id)}
					{@const state = memory.cells[cell.id]}
					<tr class="border-t border-gray/40">
						<th scope="row" class="py-1 pr-3 text-left font-mono font-normal text-slate">
							{cell.name}
						</th>
						<td class="py-1 pr-3 font-mono text-dark-gray">{cell.address}</td>
						<td class="py-1 pr-3 font-mono text-dark-gray">{cell.type}</td>
						<td class="py-1 pr-3 font-mono tabular-nums text-dark-gray">
							{formatValue(cell, state)}
						</td>
						<td class="py-1 font-mono text-dark-gray">
							{cell.id === 'p' ? (target ?? '—') : '—'}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="mt-2 text-micro text-muted-text">
			Addresses are illustrative: three consecutive <code class="font-mono">int</code> slots on the
			stack. The point is the indirection, not the numbers.
		</p>
	</details>
</section>