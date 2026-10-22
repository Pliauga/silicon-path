/**
 * Magnetic primary buttons.
 *
 * One delegated listener pair (installed once by the shell) nudges any
 * `.btn-clay` up to MAX_PULL px toward the cursor and lets it spring back on
 * leave. It uses the individual `translate` property, so it never fights the
 * `:active { transform: translateY(1px) }` press, and the spring is a CSS
 * transition with overshoot, so there is no per-frame JS beyond the pointer
 * handler. Disabled under `prefers-reduced-motion: reduce`, for touch input
 * and for disabled buttons.
 */

const SELECTOR = '.btn-clay';
const MAX_PULL = 4;

export function installMagneticButtons(root: Document = document): () => void {
	const query = window.matchMedia('(prefers-reduced-motion: reduce)');
	let active: HTMLElement | null = null;

	const release = (el: HTMLElement) => {
		el.classList.remove('is-magnetic');
		el.style.removeProperty('translate');
	};

	const onMove = (event: PointerEvent) => {
		if (query.matches || event.pointerType !== 'mouse') return;
		const target = (event.target as Element | null)?.closest<HTMLElement>(SELECTOR);
		if (active && active !== target) {
			release(active);
			active = null;
		}
		if (!target || (target as HTMLButtonElement).disabled) return;
		active = target;
		const rect = target.getBoundingClientRect();
		const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
		const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
		const clamp = (v: number) => Math.max(-1, Math.min(1, v));
		target.classList.add('is-magnetic');
		target.style.translate = `${(clamp(dx) * MAX_PULL).toFixed(2)}px ${(clamp(dy) * MAX_PULL).toFixed(2)}px`;
	};

	const onLeave = () => {
		if (active) {
			release(active);
			active = null;
		}
	};

	root.addEventListener('pointermove', onMove, { passive: true });
	root.addEventListener('pointerleave', onLeave, { passive: true, capture: true });
	root.addEventListener('pointerout', onLeave as EventListener, { passive: true });

	return () => {
		root.removeEventListener('pointermove', onMove);
		root.removeEventListener('pointerleave', onLeave, { capture: true });
		root.removeEventListener('pointerout', onLeave as EventListener);
		if (active) release(active);
	};
}
