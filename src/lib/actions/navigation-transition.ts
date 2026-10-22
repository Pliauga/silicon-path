import { onNavigate } from '$app/navigation';

/**
 * Route transitions as a page turn (AGENTS.md §5.5): the old body lets go in 160ms, the new
 * one arrives from scale 0.98 and blur 4px on a soft spring (see `::view-transition-new(page-body)`
 * in app.css), using the View Transitions API. Only `#main`'s content is
 * captured (it gets its `view-transition-name` for the duration of the
 * transition, so it can't turn fixed descendants into containing blocks
 * afterwards). Browsers without the API, and readers who prefer reduced
 * motion, navigate instantly.
 */
export function useRouteTransitions() {
	onNavigate((navigation) => {
		if (typeof document.startViewTransition !== 'function') return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		if (navigation.from?.url.pathname === navigation.to?.url.pathname) return;

		const main = document.getElementById('main');
		if (!main) return;
		main.style.setProperty('view-transition-name', 'page-body');

		return new Promise<void>((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
			transition.finished.finally(() => main.style.removeProperty('view-transition-name'));
		});
	});
}
