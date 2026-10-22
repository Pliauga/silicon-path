/**
 * `use:inview` — the Editorial Void entrance (DESIGN.md §3.1).
 *
 * Watches a section with `IntersectionObserver({ threshold: 0.1 })` and adds
 * the `is-in-view` class to it. Inside the section, `.fade-art` fades in at
 * 250ms and `.fade-text` at 1s (both 2s ease — see `app.css`), so the eye rests
 * on the artwork before the prose arrives.
 *
 * The page scrolls the window (no inner scroll container), so the observer
 * measures against the viewport by default; `root` is only for exotic cases.
 *
 * The class is added once and never removed: the reading experience should not
 * re-fade content the reader has already seen when they scroll back up.
 */

export interface InviewOptions {
	/** Scroll container. Defaults to the viewport. */
	root?: Element | null;
	/** Fraction of the element that must be visible. DESIGN.md: 0.1. */
	threshold?: number;
	/** Class added once the element is in view. */
	className?: string;
}

const DEFAULT_CLASS = 'is-in-view';

export function inview(node: HTMLElement, options: InviewOptions = {}) {
	const className = options.className ?? DEFAULT_CLASS;

	// Without IntersectionObserver (or with reduced motion handled in CSS),
	// show everything immediately rather than leaving content invisible.
	if (typeof IntersectionObserver === 'undefined') {
		reveal(node, className);
		return {};
	}

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				reveal(entry.target as HTMLElement, className);
				observer.unobserve(entry.target);
			}
		},
		{ root: options.root ?? null, threshold: options.threshold ?? 0.1 }
	);

	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
		}
	};
}

/** Marks the section and every fade target inside it. */
function reveal(node: HTMLElement, className: string): void {
	node.classList.add(className);
	for (const child of node.querySelectorAll<HTMLElement>('.fade-art, .fade-text')) {
		child.classList.add(className);
	}
}
