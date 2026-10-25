<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		BookOpen,
		Command as CommandIcon,
		House,
		Menu,
		Moon,
		Rows3,
		Rows4,
		Sun,
		TerminalSquare
	} from '@lucide/svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { isModuleAvailable, modules } from '$lib/content/curriculum';
	import { handbookMeta } from '$lib/content/handbook-meta';

	/**
	 * The 40px desktop rail (DESIGN.md §2.5): a hamburger on top, a two-track
	 * switch, the 23 module numbers (or the 20 handbook chapters) stacked in
	 * Courier Prime, and a 140px dock of four bare icons. Everything wordy
	 * lives in the drawer that the hamburger opens.
	 *
	 * The track is derived from the URL: inside `/handbook/*` the rail lists
	 * chapters 01–20, everywhere else it lists the CST1500 modules 01–23.
	 */
	interface Props {
		onOpenMenu: () => void;
		onOpenCommand: () => void;
	}

	let { onOpenMenu, onOpenCommand }: Props = $props();

	const track = $derived(
		page.url.pathname.startsWith('/handbook')
			? 'handbook'
			: page.url.pathname.startsWith('/worksheets')
				? 'worksheets'
				: 'course'
	);

	const WEEKS = [1, 2, 3, 4, 5] as const;
	const activeWeek = $derived(
		page.url.pathname.startsWith('/worksheets/')
			? Number(page.url.pathname.split('/')[2])
			: undefined
	);

	const activeSlug = $derived(
		page.url.pathname.startsWith('/lesson/') ? page.url.pathname.split('/').pop() : undefined
	);
	const activeModuleId = $derived(
		modules.find((module) => module.lessons.some((lesson) => lesson.slug === activeSlug))?.id
	);
	const activeChapterSlug = $derived(
		page.url.pathname.startsWith('/handbook/') ? page.url.pathname.split('/').pop() : undefined
	);

	const trackButton = (active: boolean): string =>
		[
			'flex h-7 w-10 items-center justify-center font-mono text-micro leading-none transition-colors duration-200',
			active ? 'bg-ivory-dark font-bold text-slate' : 'text-slate hover:text-slate'
		].join(' ');

	const iconButton =
		'inline-flex h-[35px] w-10 items-center justify-center text-slate transition-colors duration-200 hover:text-slate';
</script>

<nav
	class="rail glass-surface glass-edge-r flex h-full w-10 flex-col"
	aria-label={track === 'handbook'
		? 'C Handbook chapters'
		: track === 'worksheets'
			? 'Lab worksheets'
			: 'CST1500 modules'}
>
	<button
		type="button"
		onclick={onOpenMenu}
		aria-label="Open course menu"
		class="inline-flex h-10 w-10 shrink-0 items-center justify-center text-slate transition-colors duration-200 hover:text-slate"
	>
		<Menu size={16} strokeWidth={1.5} aria-hidden="true" />
	</button>

	<!-- Track switch: the two curricula share one shell, never one number space. -->
	<div class="flex shrink-0 flex-col border-y border-gray/40" role="group" aria-label="Learning track">
		<a
			href={resolve('/')}
			aria-current={track === 'course' ? 'true' : undefined}
			aria-label="CST1500 course: modules 1 to 23"
			title="CST1500 course"
			class={trackButton(track === 'course')}
		>
			CST
		</a>
		<a
			href={resolve('/handbook')}
			aria-current={track === 'handbook' ? 'true' : undefined}
			aria-label="C Handbook: chapters 1 to 20"
			title="C Handbook"
			class={trackButton(track === 'handbook')}
		>
			CH
		</a>
		<a
			href={resolve('/worksheets')}
			aria-current={track === 'worksheets' ? 'true' : undefined}
			aria-label="Lab worksheets: weeks 1 to 5"
			title="Lab Worksheets"
			class={trackButton(track === 'worksheets')}
		>
			WS
		</a>
	</div>

	<ol class="no-scrollbar m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto p-0">
		{#if track === 'worksheets'}
			{#each WEEKS as week (week)}
				{@const label = String(week).padStart(2, '0')}
				<li class="flex min-h-6 flex-1 items-center justify-center">
					<a
						href={resolve('/worksheets/[week]', { week: String(week) })}
						aria-label="Week {week} worksheet"
						aria-current={activeWeek === week ? 'true' : undefined}
						title="Week {label}"
						class={[
							'flex h-full w-full items-center justify-center font-mono text-micro tabular-nums transition-colors duration-200',
							activeWeek === week
								? 'font-bold text-slate'
								: 'text-slate hover:font-bold hover:text-slate'
						]}
					>
						{label}
					</a>
				</li>
			{/each}
		{:else if track === 'handbook'}
			{#each handbookMeta as chapter, index (chapter.slug)}
				{@const label = String(index + 1).padStart(2, '0')}
				{@const active = chapter.slug === activeChapterSlug}
				<li class="flex min-h-6 flex-1 items-center justify-center">
					<a
						href={resolve('/handbook/[slug]', { slug: chapter.slug })}
						aria-label="Chapter {index + 1}: {chapter.title}"
						aria-current={active ? 'true' : undefined}
						title="{label} · {chapter.title}"
						class={[
							'flex h-full w-full items-center justify-center font-mono text-micro tabular-nums transition-colors duration-200',
							active ? 'font-bold text-slate' : 'text-slate hover:font-bold hover:text-slate'
						]}
					>
						{label}
					</a>
				</li>
			{/each}
		{:else}
			{#each modules as module (module.id)}
				{@const label = String(module.id).padStart(2, '0')}
				{@const active = module.id === activeModuleId}
				<li class="flex min-h-6 flex-1 items-center justify-center">
					{#if isModuleAvailable(module)}
						<a
							href={resolve('/lesson/[...slug]', { slug: module.lessons[0].slug })}
							aria-label="Module {module.id}: {module.title}"
							aria-current={active ? 'true' : undefined}
							title="{label} · {module.title}"
							class={[
								'flex h-full w-full items-center justify-center font-mono text-micro tabular-nums transition-colors duration-200',
								active ? 'font-bold text-slate' : 'text-slate hover:font-bold hover:text-slate'
							]}
						>
							{label}
						</a>
					{:else}
						<span
							aria-disabled="true"
							title="{label} · {module.title} (coming soon)"
							class="font-mono text-micro text-slate/50 tabular-nums"
						>
							{label}
						</span>
					{/if}
				</li>
			{/each}
		{/if}
	</ol>

	<!-- Dock: ivory-dark, hairline above, six unadorned icons. -->
	<div class="flex h-[210px] shrink-0 flex-col border-t border-gray/40 bg-ivory-dark/70">
		<a href={resolve('/')} aria-label="Home" title="Home" class={iconButton}>
			<House size={16} strokeWidth={1.5} aria-hidden="true" />
		</a>
		<a href={resolve('/reference')} aria-label="Lab and reference" title="Lab & Reference" class={iconButton}>
			<BookOpen size={16} strokeWidth={1.5} aria-hidden="true" />
		</a>
		<a href={resolve('/playground')} aria-label="Playground" title="Playground" class={iconButton}>
			<TerminalSquare size={16} strokeWidth={1.5} aria-hidden="true" />
		</a>
		<button
			type="button"
			onclick={onOpenCommand}
			aria-label="Open command palette"
			title="Command palette (⌘K)"
			class={iconButton}
		>
			<CommandIcon size={16} strokeWidth={1.5} aria-hidden="true" />
		</button>
		<button
			type="button"
			onclick={() => settings.toggleTheme()}
			aria-label={settings.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
			aria-pressed={settings.theme === 'dark'}
			title={settings.theme === 'dark' ? 'Light theme' : 'Dark theme'}
			class={iconButton}
		>
			{#if settings.theme === 'dark'}
				<Moon size={16} strokeWidth={1.5} aria-hidden="true" />
			{:else}
				<Sun size={16} strokeWidth={1.5} aria-hidden="true" />
			{/if}
		</button>
		<button
			type="button"
			onclick={() => settings.toggleDensity()}
			aria-label="Dense spacing"
			aria-pressed={settings.density === 'dense'}
			title={settings.density === 'dense'
				? 'Dense spacing is on. Click for comfortable.'
				: 'Click for dense spacing.'}
			class={iconButton}
		>
			{#if settings.density === 'dense'}
				<Rows4 size={16} strokeWidth={1.5} aria-hidden="true" />
			{:else}
				<Rows3 size={16} strokeWidth={1.5} aria-hidden="true" />
			{/if}
		</button>
	</div>
</nav>