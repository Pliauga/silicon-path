<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { BookOpen, Command as CommandIcon, FileText, TerminalSquare } from '@lucide/svelte';
	import { worksheetMeta } from '$lib/content/worksheets/meta';
	import HandbookNav from './HandbookNav.svelte';
	import ModuleNav from './ModuleNav.svelte';
	import DensityToggle from './DensityToggle.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import { lessonsInOrder } from '$lib/content';
	import { progress } from '$lib/stores/progress.svelte';
	import { cn } from '$lib/utils/cn';

	/**
	 * The persistent left rail: wordmark, overall progress, module navigation,
	 * and utility links. On <1024px the same component renders inside a drawer,
	 * so it takes no positioning responsibility of its own.
	 */
	interface Props {
		/** Close the mobile drawer after a navigation choice. */
		onNavigate?: () => void;
		/** Called when the command palette should open. */
		onOpenCommand?: () => void;
	}

	let { onNavigate, onOpenCommand }: Props = $props();

	const activeSlug = $derived(
		page.url.pathname.startsWith('/lesson/') ? page.url.pathname.split('/').pop() : undefined
	);

	const isReference = $derived(page.url.pathname.startsWith('/reference'));
	const isWorksheets = $derived(page.url.pathname.startsWith('/worksheets'));

	const total = $derived(lessonsInOrder.length);
	const done = $derived(progress.completed.filter((slug) => lessonsInOrder.some((l) => l.slug === slug)).length);
	const percent = $derived(total === 0 ? 0 : (done / total) * 100);
</script>

<div class="flex h-full min-h-0 flex-col bg-ivory-med">
	<div class="px-8 pt-10 pb-6">
		<a
			href={resolve('/')}
			onclick={() => onNavigate?.()}
			class="group block"
			aria-label="Silicon Path — home"
		>
			<span class="block text-h3 leading-[1.2] text-slate">Silicon Path</span>
			<span class="mt-1 block text-micro text-muted-text">
				{done} of {total} lessons · {percent === 0 ? 'not started' : percent >= 100 ? 'complete' : 'in progress'}
			</span>
		</a>
		<div
			class="mt-4 h-px w-full bg-gray/40"
			role="progressbar"
			aria-label="Course progress"
			aria-valuenow={Math.round(percent)}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuetext="{Math.round(percent)}% complete"
		>
			<div
				class="h-px bg-slate transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out)] motion-reduce:transition-none"
				style="width: {percent}%"
			></div>
		</div>
	</div>

	<div class="px-8 pb-4">
		<a
			href={resolve('/reference')}
			onclick={() => onNavigate?.()}
			aria-current={isReference ? 'page' : undefined}
			class={cn(
				'inline-flex items-center gap-2 border-t border-gray/40 pt-3 font-mono text-micro tracking-[0.08em] uppercase',
				'transition-colors duration-200 hover:text-slate',
				isReference ? 'text-slate' : 'text-dark-gray'
			)}
		>
			<BookOpen size={14} strokeWidth={1.5} aria-hidden="true" />
			<span>Lab &amp; Reference</span>
		</a>
	</div>

	<div class="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-4">
		<h2 class="px-8 pb-2 font-mono text-micro tracking-[0.08em] text-muted-text uppercase">
			CST1500 Course
		</h2>
		<ModuleNav {activeSlug} onNavigate={onNavigate} />

		<h2
			class="mt-5 border-t border-gray/40 px-8 pt-4 pb-2 font-mono text-micro tracking-[0.08em] text-muted-text uppercase"
		>
			C Handbook
		</h2>
		<HandbookNav {onNavigate} />

		<h2
			class="mt-5 border-t border-gray/40 px-8 pt-4 pb-2 font-mono text-micro tracking-[0.08em] text-muted-text uppercase"
		>
			Lab Worksheets
		</h2>
		<nav aria-label="Lab worksheets" class="pb-1">
			<a
				href={resolve('/worksheets')}
				onclick={() => onNavigate?.()}
				aria-current={isWorksheets ? 'page' : undefined}
				class="flex items-center gap-2 px-8 py-1.5 text-small transition-colors duration-200 hover:text-slate"
				class:text-slate={isWorksheets}
				class:text-dark-gray={!isWorksheets}
			>
				<FileText size={13} strokeWidth={1.5} aria-hidden="true" />
				<span>All five worksheets</span>
			</a>
			{#each worksheetMeta as week (week.week)}
				<a
					href={resolve('/worksheets/[week]', { week: String(week.week) })}
					onclick={() => onNavigate?.()}
					class="flex items-baseline gap-2 py-1.5 pr-8 pl-11 text-small text-dark-gray transition-colors duration-200 hover:text-slate"
				>
					<span class="font-mono text-micro text-muted-text tabular-nums">
						{String(week.week).padStart(2, '0')}
					</span>
					<span class="truncate">{week.title}</span>
				</a>
			{/each}
		</nav>
	</div>

	<footer class="flex items-center justify-between px-8 py-5">
		<a
			href={resolve('/playground')}
			onclick={() => onNavigate?.()}
			class="inline-flex items-center gap-2 text-small text-dark-gray transition-colors duration-200 hover:text-slate"
		>
			<TerminalSquare size={15} strokeWidth={1.5} aria-hidden="true" />
			<span>Playground</span>
		</a>
		<div class="flex items-center">
			<ThemeToggle />
			<DensityToggle />
		</div>
		<button
			type="button"
			onclick={() => onOpenCommand?.()}
			aria-label="Open command palette"
			class={cn(
				'inline-flex items-center gap-1 text-micro text-muted-text',
				'transition-colors duration-200 hover:text-slate'
			)}
		>
			<CommandIcon size={13} strokeWidth={1.5} aria-hidden="true" />
			<kbd class="font-mono">K</kbd>
		</button>
	</footer>
</div>
