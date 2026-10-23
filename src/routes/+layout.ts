/**
 * The app is a static, offline-first bundle (§2 constraint 1): no server, no
 * backend. `ssr = false` keeps rendering entirely client-side, which is what
 * makes a static host work with no rewrite rules, and it also removes any
 * chance of a hydration mismatch against `localStorage`-backed progress.
 *
 * `prerender = true` emits a real HTML file per route, and `trailingSlash:
 * 'always'` makes each one `.../index.html` rather than a flat `.../x.html`.
 * That distinction matters: `python -m http.server` (and most naive static
 * hosts) serve a directory's `index.html` for `/lesson/x/`, but know nothing
 * about extensionless files. Without this, every lesson 404s on the exact
 * "one command, open localhost" flow described in the README.
 */
export const ssr = false;
export const prerender = true;
export const trailingSlash = 'always';

/** The UI shell is identical on every route; nothing to load up front. */
export const load = () => ({});
