<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/cn';

	/**
	 * The one button primitive. Variants are props, never forks (§12).
	 *
	 * Renders an `<a>` when `href` is present and a `<button>` otherwise, so
	 * links stay links (middle-click, keyboard) and actions stay buttons.
	 */
	type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet';
	type Size = 'sm' | 'md';

	type Props = {
		variant?: Variant;
		size?: Size;
		class?: string;
		children?: Snippet;
		href?: HTMLAnchorAttributes['href'];
		disabled?: HTMLButtonAttributes['disabled'];
		type?: HTMLButtonAttributes['type'];
		onclick?: HTMLButtonAttributes['onclick'];
		target?: HTMLAnchorAttributes['target'];
		rel?: HTMLAnchorAttributes['rel'];
		'aria-label'?: string;
		'data-testid'?: string;
	};

	let {
		variant = 'secondary',
		size = 'md',
		class: className,
		children,
		href,
		disabled = false,
		type = 'button',
		onclick,
		target,
		rel,
		...rest
	}: Props = $props();

	const base =
		'inline-flex items-center justify-center gap-2 rounded-none border-0 ' +
		'whitespace-nowrap transition-colors duration-200 active:translate-y-px ' +
		'disabled:pointer-events-none disabled:opacity-50 ' +
		'aria-disabled:pointer-events-none aria-disabled:opacity-50';

	const variants: Record<Variant, string> = {
		primary:
			'bg-clay text-accent-text hover:bg-clay-hover',
		secondary:
			'bg-ivory-med text-slate hover:bg-ivory-dark',
		ghost: 'bg-transparent text-dark-gray hover:bg-ivory-med hover:text-slate',
		quiet: 'bg-transparent text-muted-text hover:text-slate'
	};

	const sizes: Record<Size, string> = {
		sm: 'h-8 px-3 text-small',
		md: 'h-10 px-4 text-small'
	};

	const classes = $derived(cn(base, variants[variant], sizes[size], className));
</script>

<!-- The primitive forwards whatever `href` the caller supplies, internal or
     external, so route resolution has to happen at the call site. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
{#if href}
	<a
		{href}
		{target}
		{rel}
		class={classes}
		aria-disabled={disabled || undefined}
		data-testid={rest['data-testid']}
		aria-label={rest['aria-label']}
	>
		{@render children?.()}
	</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
	<button
		{type}
		{disabled}
		{onclick}
		class={classes}
		data-testid={rest['data-testid']}
		aria-label={rest['aria-label']}
	>
		{@render children?.()}
	</button>
{/if}