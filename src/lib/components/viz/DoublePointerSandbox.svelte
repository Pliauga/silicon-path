<script lang="ts">
	import {
		L2_CELLS,
		L2_STEPS,
		l2ApplyStep,
		l2CanAdvance,
		l2FormatValue,
		l2InitialState,
		l2Judge,
		l2StepAt,
		l2Summary,
		readThroughDoublePointer,
		type Level2CellId,
		type Level2MemoryState
	} from '$lib/viz/double-pointer';

	/**
	 * Level 2 of the pointer sandbox: `int **ppc = &pc`.
	 *
	 * Same POE contract as Level 1 — predict a cell, then the machine moves.
	 * The one new idea is the chain `ppc → pc → c`, so the header carries a live
	 * `**ppc` readout that updates without any extra click: that is the whole
	 * point of a pointer to a pointer.
	 */
	type Stage = 'predict' | 'reveal' | 'done';

	let memory = $state<Level2MemoryState>(l2InitialState());
	let stepIndex = $state(0);
	let stage = $state<Stage>('predict');
	let prediction = $state<Level2CellId | null>(null);
	let correct = $state<boolean | null>(null);

	const step = $derived(l2StepAt(stepIndex));
	const done = $derived(stage === 'done');
	const atLastStep = $derived(stepIndex === L2_STEPS.length - 1);
	const locked = $derived(stage !== 'predict');
	const stepDisabled = $derived(stage === 'predict' && prediction === null);

	const pcTarget = $derived(memory.cells.pc.pointsTo);
	const ppcTarget = $derived(memory.cells.ppc.pointsTo);
	const readThrough = $derived(readThroughDoublePointer(memory));

	function rowCentre(id: Level2CellId): number {
		const index = L2_CELLS.findIndex((cell) => cell.id === id);
		return 36 + index * 80;
	}

	/** pc → c, the inner arrow. */
	const innerArrow = $derived(
		pcTarget === null ? '' : `M 4 ${rowCentre('pc')} H 30 V ${rowCentre(pcTarget)} H 72`
	);

	/** ppc → pc, the outer arrow. */
	const outerArrow = $derived(
		ppcTarget === null ? '' : `M 4 ${rowCentre('ppc')} H 52 V ${rowCentre(ppcTarget)} H 72`
	);

	function choose(id: Level2CellId): void {
		if (locked) return;
		prediction = id;
	}

	function advance(): void {
		if (done) {
			restart();
			return;
		}
		if (stage === 'predict') {
			if (!l2CanAdvance(prediction) || prediction === null) return;
			correct = l2Judge(stepIndex, prediction);
			memory = l2ApplyStep(memory, stepIndex);
			stage = 'reveal';
			return;
		}
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
		memory = l2InitialState();
		stepIndex = 0;
		stage = 'predict';
		prediction = null;
		correct = null;
	}

	function feedback(): string {
		if (correct === null) return '';
		if (correct) return step.reveal;
		const particular = prediction === null ? undefined : step.misconceived[prediction];
		return particular ? `Not this one. ${particular} ${step.differential}` : step.differential;
	}

	const stepLabel = $derived(
		done ? 'Start over' : stage === 'predict' ? 'Reveal step' : atLastStep ? 'Finish' : 'Next step'
	);
</script>

<section class="callout my-10 !p-0" aria-labelledby="pointer-l2-title">
	<header class="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray/40 px-6 py-4">
		<div>
			<h3 id="pointer-l2-title" class="text-h3 text-slate">Pointer sandbox — Level 2</h3>
			<p class="mt-1 text-small leading-[1.5] text-dark-gray">
				A pointer to a pointer is just one more arrow. Watch <code class="font-mono">**ppc</code>
				read <code class="font-mono">c</code> without ever being reassigned.
			</p>
		</div>
		<span class="font-mono text-micro text-muted-text">
			{done ? 'Complete' : `Step ${stepIndex + 1} of ${L2_STEPS.length}`}
		</span>
	</header>

	<div class="border-b border-gray/40 px-6 py-3">
		<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
			<span class="font-mono text-small text-slate">**ppc</span>
			<span class="font-mono text-small text-muted-text" aria-hidden="true">→</span>
			<span class="font-mono text-h3 tabular-nums {readThrough !== null ? 'text-slate' : 'text-muted-text'}">
				{readThrough ?? '—'}
			</span>
			<span class="text-micro text-muted-text">
				{readThrough === null
					? 'the chain is not complete yet'
					: 'read through ppc → pc → c, live'}
			</span>
		</div>
	</div>

	<div class="grid gap-6 px-6 pb-6 pt-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
		<div class="relative flex gap-4">
			<ol class="flex min-w-0 flex-1 flex-col gap-2">
				{#each L2_CELLS as cell (cell.id)}
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
								{#if cell.id === 'pc' && pcTarget !== null}
									<span class="text-micro text-muted-text">→ {pcTarget}</span>
								{/if}
								{#if cell.id === 'ppc' && ppcTarget !== null}
									<span class="text-micro text-muted-text">→ {ppcTarget}</span>
								{/if}
								{#if memory.read === cell.id}
									<span class="text-micro text-muted-text">read</span>
								{/if}
								<span
									class="font-mono text-code tabular-nums {memory.changed === cell.id
										? 'text-clay-ink'
										: 'text-slate'}"
								>
									{l2FormatValue(cell, state)}
								</span>
							</span>
						</button>
					</li>
				{/each}
			</ol>

			<!-- Decorative: both cells already print "→ target". -->
			<div class="hidden w-20 shrink-0 lg:block" aria-hidden="true">
				<svg viewBox="0 0 80 232" class="h-[232px] w-full text-clay-ink" fill="none">
					<defs>
						<marker
							id="pointer-l2-head"
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
					{#if innerArrow}
						<path
							d={innerArrow}
							stroke="currentColor"
							stroke-width="1.5"
							marker-end="url(#pointer-l2-head)"
						/>
					{/if}
					{#if outerArrow}
						<path
							d={outerArrow}
							stroke="currentColor"
							stroke-width="1.5"
							marker-end="url(#pointer-l2-head)"
						/>
					{/if}
				</svg>
			</div>
		</div>

		<div class="flex min-w-0 flex-col">
			<p class="text-micro uppercase text-muted-text">Line {stepIndex + 1}</p>
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
					<p class="text-slate">
						<span class="font-bold {correct ? 'text-clay-ink' : 'text-warning'}">
							{correct ? 'Correct. ' : 'Not quite. '}
						</span>
						{feedback()}
					</p>
					{#if done}
						<p class="mt-2 text-dark-gray">{l2Summary(memory)}</p>
					{/if}
				{/if}
			</div>

			<div class="mt-auto flex flex-wrap items-center gap-3 pt-4">
				<button type="button" onclick={advance} disabled={stepDisabled} class="btn-editorial btn-clay">
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
		<summary class="cursor-pointer text-micro uppercase text-muted-text marker:text-muted-text">
			Accessible version
		</summary>
		<table class="mt-3 w-full border-collapse text-small">
			<caption class="sr-only">Level 2 memory cells, addresses and current values</caption>
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
				{#each L2_CELLS as cell (cell.id)}
					{@const state = memory.cells[cell.id]}
					<tr class="border-t border-gray/40">
						<th scope="row" class="py-1 pr-3 text-left font-mono font-normal text-slate">{cell.name}</th>
						<td class="py-1 pr-3 font-mono text-dark-gray">{cell.address}</td>
						<td class="py-1 pr-3 font-mono text-dark-gray">{cell.type}</td>
						<td class="py-1 pr-3 font-mono tabular-nums text-dark-gray">
							{l2FormatValue(cell, state)}
						</td>
						<td class="py-1 font-mono text-dark-gray">
							{cell.id === 'c' ? '—' : (state.pointsTo ?? '—')}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="mt-2 text-micro text-muted-text">
			{readThrough === null
				? '`**ppc` cannot be read yet: one or both pointers are still uninitialised.'
				: `\`**ppc\` currently reads ${readThrough}.`}
		</p>
	</details>
</section>