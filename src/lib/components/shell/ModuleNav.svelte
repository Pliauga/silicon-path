<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ChevronRight } from '@lucide/svelte';
	import { modules, isModuleAvailable } from '$lib/content/curriculum';
	import { progress } from '$lib/stores/progress.svelte';
	import { cn } from '$lib/utils/cn';

	/**
	 * The 23 modules as disclosures. Only module 1 has lessons today, so every
	 * other module renders as a disabled-looking row that explains itself
	 * rather than pretending to be a link.
	 */
	interface Props {
		/** Lessons page slug, used for the active highlight. */
		activeSlug?: string | undefined;
		/** Called after a navigation choice, e.g. to close the mobile drawer. */
		onNavigate?: () => void;
	}

	let { activeSlug, onNavigate }: Props = $props();

	/** Which module body is expanded. Module 1 opens by default. */
	let expanded = $state<number | undefined>(1);

	/** The module that owns the current lesson, if any. */
	const activeModuleId = $derived(
		modules.find((entry) => entry.lessons.some((lesson) => lesson.slug === activeSlug))?.id
	);

	function toggle(id: number): void {
		expanded = expanded === id ? undefined : id;
	}

	function isCurrentLesson(slug: string): boolean {
		// Lessons answer on both /lesson/<slug> and /lesson/<module>/<slug>.
		const path = page.url.pathname.replace(/\/$/, '');
		return path === `/lesson/${slug}` || path.endsWith(`/lesson/${slug}`) || path.endsWith(`/${slug}`);
	}
</script>

<nav aria-label="Modules" class="flex flex-col">
	{#each modules as module (module.id)}
		{@const available = isModuleAvailable(module)}
		{@const isOpen = expanded === module.id}
		<div>
			{#if available}
				<button
					type="button"
					onclick={() => toggle(module.id)}
					aria-expanded={isOpen}
					aria-controls="module-panel-{module.id}"
					class={cn(
						'group flex w-full items-baseline gap-3 px-8 py-2 text-left text-small',
						'transition-colors duration-200 hover:text-slate',
						activeModuleId === module.id ? 'text-slate' : 'text-dark-gray'
					)}
				>
					<span class="w-5 shrink-0 font-mono text-micro tabular-nums text-muted-text">
						{String(module.id).padStart(2, '0')}
					</span>
					<span class="truncate">{module.title}</span>
					<ChevronRight
						size={12}
						strokeWidth={1.5}
						aria-hidden="true"
						class={cn(
							'ml-auto shrink-0 self-center text-muted-text transition-transform duration-200 motion-reduce:transition-none',
							isOpen && 'rotate-90'
						)}
					/>
				</button>

				{#if isOpen}
					<ul id="module-panel-{module.id}" class="flex flex-col pt-1 pb-3 pl-[4.25rem] pr-8">
						{#each module.lessons as lesson (lesson.slug)}
							<li>
								<a
									href={resolve('/lesson/[...slug]', { slug: lesson.slug })}
									onclick={() => onNavigate?.()}
									aria-current={isCurrentLesson(lesson.slug) ? 'page' : undefined}
									class={cn(
										'flex items-baseline gap-2 py-1 text-small leading-[1.3]',
										'transition-colors duration-200',
										isCurrentLesson(lesson.slug)
											? 'font-bold text-slate'
											: 'text-dark-gray hover:text-slate'
									)}
								>
									<span>{lesson.title}</span>
									{#if progress.isComplete(lesson.slug)}
										<span class="ml-auto shrink-0 font-mono text-micro text-teal-ink" aria-hidden="true">✓</span>
										<span class="sr-only">completed</span>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			{:else}
				<div class="flex w-full items-baseline gap-3 px-8 py-2 text-small text-muted-text">
					<span class="w-5 shrink-0 font-mono text-micro tabular-nums">
						{String(module.id).padStart(2, '0')}
					</span>
					<span class="truncate">{module.title}</span>
				</div>
			{/if}
		</div>
	{/each}
</nav>
