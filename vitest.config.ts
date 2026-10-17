import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

/**
 * The SvelteKit plugin is needed so `$lib`, `$app/*`, and `.svelte` imports
 * resolve exactly as they do in the app. Default environment is `node`;
 * component tests opt into jsdom with a `@vitest-environment` docblock.
 *
 * The `browser` export condition is set only while Vitest runs. Without it,
 * `svelte` resolves to `svelte/src/index-server.js`, whose `mount()` throws
 * `lifecycle_function_unavailable` and every component test fails at mount.
 * Guarding on `process.env.VITEST` leaves `pnpm build` on the default
 * resolution.
 */
export default defineConfig({
	plugins: [sveltekit()],
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		environment: 'node',
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
