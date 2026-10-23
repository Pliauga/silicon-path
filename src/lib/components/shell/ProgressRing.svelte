<script lang="ts">
	/**
	 * Overall course completion as an SVG ring.
	 *
	 * The ring animates by animating `stroke-dashoffset` with a CSS transition;
	 * under `prefers-reduced-motion` the transition is dropped but the ring
	 * still lands on the correct value.
	 */
	interface Props {
		/** 0–100. */
		percent: number;
		/** Pixel diameter. */
		size?: number;
		/** Stroke width. */
		stroke?: number;
		/** Accessible description of what the ring measures. */
		label?: string;
	}

	let { percent, size = 40, stroke = 3, label = 'Course progress' }: Props = $props();

	const radius = $derived((size - stroke) / 2);
	const circumference = $derived(2 * Math.PI * radius);
	const clamped = $derived(Math.max(0, Math.min(100, percent)));
	const offset = $derived(circumference - (clamped / 100) * circumference);
	const rounded = $derived(Math.round(clamped));
</script>

<div
	class="relative inline-flex shrink-0 items-center justify-center"
	role="progressbar"
	aria-label={label}
	aria-valuenow={rounded}
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuetext="{rounded}% complete"
	style="width: {size}px; height: {size}px"
>
	<svg width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true" class="-rotate-90">
		<circle
			cx={size / 2}
			cy={size / 2}
			r={radius}
			fill="none"
			stroke="var(--rubin-ivory-dark)"
			stroke-width={stroke}
		/>
		<circle
			cx={size / 2}
			cy={size / 2}
			r={radius}
			fill="none"
			stroke="var(--rubin-slate)"
			stroke-width={stroke}
			stroke-linecap="butt"
			stroke-dasharray={circumference}
			stroke-dashoffset={offset}
			class="transition-[stroke-dashoffset] duration-[var(--dur-slow)] ease-[var(--ease-out)] motion-reduce:transition-none"
		/>
	</svg>
	<span class="absolute font-mono text-[0.625rem] tabular-nums text-dark-gray">
		{rounded}<span class="text-muted-text">%</span>
	</span>
</div>