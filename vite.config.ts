import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * The Emception toolchain runs SharedArrayBuffer-backed stdin channels, which
 * browsers only expose to cross-origin isolated documents. Both the dev server
 * and `vite preview` must send these two headers, otherwise `scanf` sees EOF
 * and the toolchain warns about degraded stdin.
 *
 * A plain static server (the production deployment in AGENTS.md §2) has to send
 * the same pair.
 */
const crossOriginIsolation = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp'
};

/**
 * `server.headers` is not applied to responses produced by the SvelteKit dev
 * middleware, so the isolation headers are set by an explicit middleware that
 * runs before it. Register this plugin first: middlewares are added in plugin
 * order, and SvelteKit's handler answers the request before later ones run.
 */
function crossOriginIsolationPlugin(): Plugin {
	return {
		name: 'emception-cross-origin-isolation',
		configureServer(server) {
			server.middlewares.use((_req, res, next) => {
				for (const [name, value] of Object.entries(crossOriginIsolation)) {
					res.setHeader(name, value);
				}
				next();
			});
		},
		configurePreviewServer(server) {
			server.middlewares.use((_req, res, next) => {
				for (const [name, value] of Object.entries(crossOriginIsolation)) {
					res.setHeader(name, value);
				}
				next();
			});
		}
	};
}

export default defineConfig({
	plugins: [crossOriginIsolationPlugin(), tailwindcss(), sveltekit()],
	server: {
		port: 5173,
		strictPort: true,
		headers: crossOriginIsolation
	},
	preview: {
		port: 4173,
		strictPort: true,
		headers: crossOriginIsolation
	},
	/**
	 * The toolchain packages import compiled assets with Vite-specific queries
	 * (`./subprocess_shim.py?raw`). esbuild's dependency pre-bundler does not
	 * understand those, so the dev server must serve them as native ESM and let
	 * Vite resolve the imports itself.
	 */
	optimizeDeps: {
		exclude: ['@gameguild/emception-browser', 'emception']
	}
});
