<script lang="ts">
	import { Lightbulb } from '@lucide/svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import type { AnalogyMode } from '$lib/stores/settings.svelte';

	/**
	 * A plain-English analogy callout.
	 *
	 * The same abstract idea is explained twice — once in football terms, once
	 * in money terms — and the reader picks whichever already makes sense to
	 * them with the toggle in the lesson header.
	 *
	 * Copy comes from two places, in priority order:
	 *
	 * 1. The `football` / `money` props, authored inline in the lesson MDX.
	 *    This is the normal path: analogy copy belongs next to the prose that
	 *    needs it, not in a shared component.
	 * 2. The `ANALOGIES` map below, which only carries the topics written
	 *    before the props existed. It is a compatibility shim, not the
	 *    intended authoring surface — new lessons should pass props.
	 *
	 * If a topic is listed in neither place the block still renders a generic
	 * line rather than an empty box.
	 */
	interface Props {
		/** Which idea to explain, e.g. `"bits"`. Used for the map lookup. */
		topic: string;
		/** Football-flavoured explanation, authored in MDX. */
		football?: string;
		/** Money-flavoured explanation, authored in MDX. */
		money?: string;
	}

	let { topic, football, money }: Props = $props();

	/** Every analogy, twice. Keys are the `topic` values lessons pass in. */
	const ANALOGIES: Record<string, Record<AnalogyMode, string>> = {
		bits: {
			// Owner-authored copy, kept verbatim.
			football:
				"A bit is like a single match ticket. You either have one (1) or you don't (0). When you group them into a byte (8 bits), it's like a full season ticket bundle.",
			money:
				"A bit is like a single penny. It's the smallest unit of currency. Group 8 of them together and you get a byte, which is like a dollar—enough to actually buy something."
		},
		bytes: {
			football:
				'A byte is a full squad sheet: eight slots, each one either filled or empty. Swap one player and the sheet still has eight names, but it is a different team.',
			money:
				'A byte is a $1 note made of eight pennies. Change any one penny and the note is worth a different amount — 255 different amounts, to be exact.'
		},
		hex: {
			football:
				'Hex is the shirt number system. Every player already has a name, but the number on the back is shorter to shout across the pitch. One hex digit covers exactly four bits, so two digits cover a byte.',
			money:
				'Hex is the coin denomination system. You could write "one hundred and sixty-five pennies", or you could write "$1.65". Same value, far less to read.'
		}
	};

	const fallback: Record<AnalogyMode, string> = {
		football: 'Think of it as the team sheet: every slot is either filled or empty, and the pattern is the information.',
		money: 'Think of it as small change: the smallest unit is a penny, and the pattern of them is the information.'
	};

	const entry = $derived(ANALOGIES[topic]);

	/** Props win; the map is the legacy fallback; then a generic line. */
	const text = $derived.by(() => {
		const authored = settings.analogyMode === 'football' ? football : money;
		if (authored) return authored;
		if (entry) return entry[settings.analogyMode];
		return fallback[settings.analogyMode];
	});

	/**
	 * Handbook chapters author the analogy as prose paragraphs separated by a
	 * blank line. Single-paragraph strings — every lesson written before the
	 * handbook — yield exactly one paragraph, so nothing changes there.
	 */
	const paragraphs = $derived(
		text
			.split(/\n{2,}/)
			.map((paragraph) => paragraph.trim())
			.filter(Boolean)
	);

	const modeLabel = $derived(settings.analogyMode === 'football' ? 'Football' : 'Money');
</script>

<aside
	class="callout callout-clay my-6"
	aria-label="Plain-English analogy"
>
	<p
		class="mb-3 flex items-center gap-1.5 font-mono text-micro tracking-[0.06em] text-clay-ink uppercase"
	>
		<Lightbulb size={12} strokeWidth={1.5} aria-hidden="true" />
		In plain English
		<span class="ml-auto text-muted-text normal-case">
			{modeLabel}
		</span>
	</p>
	{#each paragraphs as paragraph, index (index)}
		<p class="text-body leading-[1.55] text-slate" class:mt-3={index > 0}>
			{paragraph}
		</p>
	{/each}
</aside>