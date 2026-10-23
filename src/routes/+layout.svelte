<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { Menu, X } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import Rail from '$lib/components/shell/Rail.svelte';
	import ThemeToggle from '$lib/components/shell/ThemeToggle.svelte';
	import Sidebar from '$lib/components/shell/Sidebar.svelte';
	import { Dialog } from '$lib/components/ui/dialog';
	import { Command } from '$lib/components/ui/command';
	import { Toaster } from '$lib/components/ui/toast';
	import { TooltipProvider } from '$lib/components/ui/tooltip';
	import { getLesson, lessonsInOrder, firstLessonSlug } from '$lib/content';
	import { handbookMeta } from '$lib/content/handbook-meta';
	import { worksheetMeta } from '$lib/content/worksheets/meta';
	import { settings } from '$lib/stores/settings.svelte';
	import { progress } from '$lib/stores/progress.svelte';
	import { installMagneticButtons } from '$lib/actions/magnetic';
	import { useRouteTransitions } from '$lib/actions/navigation-transition';
	import '../app.css';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	/**
	 * Full-bleed 3D studies own the whole viewport: they bring their own
	 * chrome, scroll choreography and colour. They render instead of the
	 * course shell, but still pick up `app.css` tokens from this layout.
	 */
	const immersiveRoutes = ['/cpu', '/memory', '/scheduler', '/paging'];
	const immersive = $derived(
		immersiveRoutes.includes(page.url.pathname.replace(/\/+$/, '') || '/')
	);

	useRouteTransitions();

	onMount(() => installMagneticButtons());

	/** Drawer state for the <1024px layout. */
	let drawerOpen = $state(false);
	/** Command palette state, opened by Cmd/Ctrl+K or the sidebar button. */
	let paletteOpen = $state(false);

	/** Keeps `<html data-theme data-density>` in sync with the stored prefs. */
	$effect(() => {
		settings.apply();
	});

	/** Record a visit for the lesson currently on screen. */
	$effect(() => {
		const path = page.url.pathname;
		if (!path.startsWith('/lesson/')) return;
		const slug = path.split('/').pop();
		if (slug && getLesson(slug)) progress.visit(slug);
	});

	const homeAction = () => {
		paletteOpen = false;
		window.location.assign('/');
	};

	const firstLesson = firstLessonSlug();
	const firstLessonAction = () => {
		paletteOpen = false;
		if (firstLesson) window.location.assign(`/lesson/${firstLesson}`);
	};

	const playgroundAction = () => {
		paletteOpen = false;
		window.location.assign('/playground');
	};

	const referenceAction = () => {
		paletteOpen = false;
		window.location.assign('/reference');
	};

	/** Only actions whose destinations exist are listed (spec: omit, don't stub). */
	const commandGroups = $derived.by(() => {
		const navigation = [{ value: 'home', label: 'Go home', hint: '/', onSelect: homeAction }];

		if (firstLesson) {
			const lesson = getLesson(firstLesson);
			navigation.push({
				value: `lesson-${firstLesson}`,
				label: `Open lesson: ${lesson?.frontmatter.title ?? firstLesson}`,
				hint: `/lesson/${firstLesson}`,
				onSelect: firstLessonAction
			});
		}

		navigation.push({
			value: 'playground',
			label: 'Open playground',
			hint: '/playground',
			onSelect: playgroundAction
		});

		navigation.push({
			value: 'reference',
			label: 'Open lab & reference',
			hint: '/reference',
			onSelect: referenceAction
		});

		navigation.push({
			value: 'handbook',
			label: 'Open the C Handbook',
			hint: '/handbook',
			onSelect: () => {
				paletteOpen = false;
				window.location.assign('/handbook');
			}
		});

		navigation.push({
			value: 'worksheets',
			label: 'Open the lab worksheets',
			hint: '/worksheets',
			onSelect: () => {
				paletteOpen = false;
				window.location.assign('/worksheets');
			}
		});

		navigation.push({
			value: 'viz-cpu',
			label: 'Visualization: CPU package',
			hint: '/cpu',
			onSelect: () => {
				paletteOpen = false;
				window.location.assign('/cpu');
			}
		});

		navigation.push({
			value: 'viz-memory',
			label: 'Visualization: Memory hierarchy',
			hint: '/memory',
			onSelect: () => {
				paletteOpen = false;
				window.location.assign('/memory');
			}
		});

		navigation.push({
			value: 'viz-scheduler',
			label: 'Visualization: Process scheduler',
			hint: '/scheduler',
			onSelect: () => {
				paletteOpen = false;
				window.location.assign('/scheduler');
			}
		});

		navigation.push({
			value: 'viz-paging',
			label: 'Visualization: Virtual memory',
			hint: '/paging',
			onSelect: () => {
				paletteOpen = false;
				window.location.assign('/paging');
			}
		});


		return [{ heading: 'Navigate', items: navigation }];
	});

	/** Page title follows the route so browser history and screen readers agree. */
	$effect(() => {
		const path = page.url.pathname;
		const base = 'Silicon Path';
		const cleanPath = path.replace(/\/+$/, '') || '/';
		const immersiveTitles: Record<string, string> = {
			'/cpu': 'CPU package',
			'/memory': 'Memory hierarchy',
			'/scheduler': 'Process scheduler',
			'/paging': 'Virtual memory'
		};
		const immersiveTitle = immersiveTitles[cleanPath];
		if (immersiveTitle) {
			document.title = `${immersiveTitle} — ${base}`;
			return;
		}
		if (path.startsWith('/lesson/')) {
			const slug = path.split('/').pop() ?? '';
			document.title = getLesson(slug)?.frontmatter.title
				? `${getLesson(slug)?.frontmatter.title} — ${base}`
				: base;
			return;
		}
		if (path.startsWith('/playground')) {
			document.title = `Playground — ${base}`;
			return;
		}
		if (path.startsWith('/reference')) {
			document.title = `Lab & Reference — ${base}`;
			return;
		}
		if (cleanPath === '/handbook') {
			document.title = `The C Handbook — ${base}`;
			return;
		}
		if (path.startsWith('/handbook/')) {
			const slug = cleanPath.split('/').pop() ?? '';
			const chapter = handbookMeta.find((entry) => entry.slug === slug);
			document.title = chapter ? `${chapter.title} — ${base}` : base;
			return;
		}
		if (cleanPath === '/worksheets') {
			document.title = `Lab Worksheets — ${base}`;
			return;
		}
		if (path.startsWith('/worksheets/')) {
			const weekNumber = Number(cleanPath.split('/').pop());
			const week = worksheetMeta.find((entry) => entry.week === weekNumber);
			document.title = week ? `Week ${week.week} — ${week.title} — ${base}` : base;
			return;
		}
		document.title = base;
	});

	/** Global shortcut: Cmd/Ctrl+K opens the palette. */
	function handleKeydown(event: KeyboardEvent): void {
		if (immersive) return;
		const modifier = event.metaKey || event.ctrlKey;
		if (modifier && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			paletteOpen = !paletteOpen;
		}
	}

	/** Close the drawer whenever the route changes. */
	$effect(() => {
		// Reading the pathname registers the dependency; the body closes the drawer.
		if (page.url.pathname) drawerOpen = false;
	});

	onMount(() => {
		// Prefetch the two lesson neighbours so navigation is instant (§10).
		for (const lesson of lessonsInOrder.slice(0, 2)) {
			void lesson.slug;
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="film-grain" aria-hidden="true"></div>

{#if immersive}
	{@render children()}
{:else}
<TooltipProvider>
	<a
		href="#main"
		class="sr-only bg-ivory-med px-3 py-2 text-small text-slate focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60]"
	>
		Skip to content
	</a>

	<!-- Persistent 40px rail at ≥1024px: fixed, on top of the scroller, bone-coloured,
	     separated from the page by tone alone (no border). The full course
	     navigation (title, progress, lessons) opens from its hamburger. -->
	<aside class="fixed inset-y-0 left-0 z-30 hidden w-10 lg:block">
		<Rail onOpenMenu={() => (drawerOpen = true)} onOpenCommand={() => (paletteOpen = true)} />
	</aside>

	<!-- Mobile top bar: hairline only, floating above the scroller. -->
	<header
		class="fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-3 glass-surface border-b border-gray/60 px-4 lg:hidden"
	>
		<button
			type="button"
			onclick={() => (drawerOpen = true)}
			aria-label="Open course navigation"
			aria-expanded={drawerOpen}
			class="inline-flex size-9 items-center justify-center text-dark-gray transition-colors duration-200 hover:bg-ivory-med hover:text-slate"
		>
			<Menu size={18} strokeWidth={1.5} aria-hidden="true" />
		</button>
		<a href={resolve('/')} class="text-small text-slate">Silicon Path</a>
		<ThemeToggle class="ml-auto" />
	</header>

	<!-- Native window scrolling: no inner scroller and no scroll snapping, so long
	     lessons read smoothly with a trackpad. The rail and mobile bar are fixed. -->
	<main
		tabindex="-1"
		class="min-h-dvh bg-ivory pt-12 focus:outline-none lg:pt-0 lg:pl-10"
	>
		<div id="main" tabindex="-1" class="min-w-0 focus:outline-none">
			{@render children()}
		</div>
	</main>

	<Dialog
		bind:open={drawerOpen}
		label="Course navigation"
		class="h-dvh max-w-xs overflow-hidden bg-ivory-med p-0 sm:left-0 sm:translate-x-0"
	>
		<div class="flex h-full flex-col">
			<div class="flex items-center justify-between border-b border-gray px-4 py-3">
				<span class="text-small text-slate">Course</span>
				<button
					type="button"
					onclick={() => (drawerOpen = false)}
					aria-label="Close course navigation"
					class="inline-flex size-8 items-center justify-center text-muted-text transition-colors duration-200 hover:bg-ivory-dark hover:text-slate"
				>
					<X size={16} strokeWidth={1.75} aria-hidden="true" />
				</button>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto">
				<Sidebar onNavigate={() => (drawerOpen = false)} onOpenCommand={() => (paletteOpen = true)} />
			</div>
		</div>
	</Dialog>

	<Dialog bind:open={paletteOpen} label="Command palette" position="top" class="overflow-hidden p-0">
		<Command groups={commandGroups} label="Command palette" />
	</Dialog>

	<Toaster />
</TooltipProvider>
{/if}