<script lang="ts">
	import { settings } from '$lib/stores/settings.svelte';
	import type { AnalogyMode } from '$lib/stores/settings.svelte';
	import { cn } from '$lib/utils/cn';

	/**
	 * A two-option segmented control for the analogy mode.
	 *
	 * Implemented as a radio group rather than plain buttons so arrow keys move
	 * between options the way a native radio set does, and screen readers
	 * announce "1 of 2" / "2 of 2" automatically. Only the selected option is
	 * in the tab order, exactly like a native radio group.
	 */
	interface Props {
		class?: string;
	}

	let { class: className }: Props = $props();

	const options: { value: AnalogyMode; label: string; hint: string }[] = [
		{ value: 'football', label: 'Football', hint: 'Explain it with football terms' },
		{ value: 'money', label: 'Money', hint: 'Explain it with money terms' }
	];

	function onKeydown(event: KeyboardEvent, index: number): void {
		// Left and Right mean what they say; both wrap around the two options.
		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (step === 0) return;
		event.preventDefault();
		const nextIndex = (index + step + options.length) % options.length;
		const next = options[nextIndex];
		if (!next) return;
		settings.setAnalogyMode(next.value);
		// The buttons keep their identity across the state change, so focusing
		// the sibling immediately is enough — no need to wait for a re-render.
		const group = (event.currentTarget as HTMLElement).parentElement;
		const buttons = group?.querySelectorAll<HTMLElement>('[role="radio"]');
		buttons?.[nextIndex]?.focus();
	}
</script>

<div
	class={cn(
		'inline-flex items-center gap-px bg-ivory-med',
		className
	)}
	role="radiogroup"
	aria-label="Analogy style"
>
	{#each options as option, index (option.value)}
		{@const selected = settings.analogyMode === option.value}
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			tabindex={selected ? 0 : -1}
			title={option.hint}
			onclick={() => settings.setAnalogyMode(option.value)}
			onkeydown={(event) => onKeydown(event, index)}
			class={cn(
				'px-3 py-1.5 font-mono text-micro',
				'transition-colors duration-200 active:translate-y-px',
				selected ? 'bg-clay text-accent-text' : 'text-dark-gray hover:bg-ivory-dark hover:text-slate'
			)}
		>
			{option.label}
		</button>
	{/each}
</div>