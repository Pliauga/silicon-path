<script lang="ts">
	import BashTerminal from '$lib/components/viz/BashTerminal.svelte';
	import BinaryMath from '$lib/components/viz/BinaryMath.svelte';
	import BitwiseVisualizer from '$lib/components/viz/BitwiseVisualizer.svelte';
	import FloatingPoint from '$lib/components/viz/FloatingPoint.svelte';
	import LogicGateSim from '$lib/components/viz/LogicGateSim.svelte';
	import LogicGateSim3D from '$lib/components/viz/LogicGateSim3D.svelte';
	import LazyStudy from '$lib/components/viz/LazyStudy.svelte';
	import NumberBaseConverter from '$lib/components/viz/NumberBaseConverter.svelte';
	import PCArchitectureDiagram from '$lib/components/viz/PCArchitectureDiagram.svelte';
	import Waveform from '$lib/components/viz/Waveform.svelte';
	import type { WorksheetFigure } from '$lib/content/worksheets/types';

	/**
	 * One figure slot on a worksheet. The week data names a figure kind; this
	 * component owns the mapping so the data files stay free of component imports.
	 */
	interface Props {
		figure: WorksheetFigure;
	}

	let { figure }: Props = $props();

	// 3D studies carry their caption below the model (LazyStudy's figcaption), so the
	// "Figure N — text" caption is split into the figure number and its text.
	const captionParts = $derived.by(() => {
		const match = /^Figure\s+(\d+)\s+—\s+(.*)$/.exec(figure.caption);
		return match ? { fig: match[1].padStart(2, '0'), text: match[2] } : { fig: undefined, text: figure.caption };
	});
</script>

<section class="my-10" aria-label={figure.caption}>
	{#if figure.kind !== 'gates3d'}
		<p class="mb-3 font-mono text-micro leading-relaxed tracking-[0.04em] text-muted-text">
			{figure.caption}
		</p>
	{/if}

	{#if figure.kind === 'pc'}
		<PCArchitectureDiagram />
	{:else if figure.kind === 'bases'}
		<NumberBaseConverter value={42} />
	{:else if figure.kind === 'binary'}
		<BinaryMath initialA={159} initialB={147} operation="add" />
	{:else if figure.kind === 'float'}
		<FloatingPoint value={12.5} />
	{:else if figure.kind === 'waveform'}
		<Waveform
			gate="and"
			a={[0, 1, 1, 0, 1, 1, 0, 1]}
			b={[1, 1, 0, 0, 1, 0, 1, 1]}
		/>
	{:else if figure.kind === 'bitwise'}
		<BitwiseVisualizer initialA={12} initialB={25} />
	{:else if figure.kind === 'gates'}
		<LogicGateSim initialA={true} initialB={false} />
	{:else if figure.kind === 'gates3d'}
		<LazyStudy
			label="Logic gates — interactive 3D study"
			size="tall"
			fig={captionParts.fig}
			caption={captionParts.text}
		>
			<LogicGateSim3D />
		</LazyStudy>
	{:else if figure.kind === 'bash'}
		<BashTerminal />
	{/if}
</section>