/**
 * `use:revealParagraphs` — Apple-style scroll reveal for lesson prose.
 *
 * Each top-level paragraph starts at opacity 0.2 / 10px low and settles to
 * 1 / 0 the first time it enters the viewport (opacity + translate only, so it
 * stays on the compositor). The hidden state is added by script, so with
 * JavaScript off or `prefers-reduced-motion: reduce` the prose is simply
 * visible. Paragraphs inside embedded studies are left alone.
 */

export function revealParagraphs(node: HTMLElement) {
	const query = window.matchMedia('(prefers-reduced-motion: reduce)');
	if (query.matches || typeof IntersectionObserver === 'undefined') return {};

	const seen = new WeakSet<Element>();
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				entry.target.classList.add('is-revealed');
				observer.unobserve(entry.target);
			}
		},
		{ rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
	);

	const scan = () => {
		for (const p of node.querySelectorAll<HTMLElement>('p')) {
			if (seen.has(p) || p.closest('.study-frame, .callout, figure, table, .sr-only')) continue;
			seen.add(p);
			p.classList.add('reveal-p');
			observer.observe(p);
		}
	};

	scan();
	// Lesson bodies can finish rendering a tick after mount.
	const mutations = new MutationObserver(scan);
	mutations.observe(node, { childList: true, subtree: true });

	return {
		destroy() {
			observer.disconnect();
			mutations.disconnect();
		}
	};
}
