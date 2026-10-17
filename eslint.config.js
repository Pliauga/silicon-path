import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Flat ESLint config. Two rules carry real weight here beyond the presets:
 * `no-console` (agents.md §8 forbids committed `console.log`) and the
 * Svelte a11y set, because §9 makes keyboard access a contract, not an
 * aspiration.
 */
export default tseslint.config(
	{
		ignores: ['build/', '.svelte-kit/', 'node_modules/', 'static/', 'pnpm-lock.yaml']
	},

	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs.recommended,

	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			parserOptions: { extraFileExtensions: ['.svelte'] }
		},
		rules: {
			// agents.md §8: use a gated logger, never a raw console call.
			'no-console': ['error', { allow: ['warn', 'error'] }],
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],
			// agents.md §8: no `any` in app code.
			'@typescript-eslint/no-explicit-any': 'error'
		}
	},

	{
		// `*.svelte.ts` files are TypeScript modules (runes in .ts), not
		// components — they need the TS parser rather than the Svelte one.
		files: ['**/*.svelte.ts'],
		languageOptions: {
			parser: tseslint.parser
		}
	},

	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser
			}
		}
	},

	{
		// The Golden Template 3D studies were ported from their standalone
		// projects. Each owns a WebGL canvas driven by three.js and keeps its
		// scene objects in plain Map/Set collections; those collections never
		// feed Svelte reactivity, so the reactivity and DOM-manipulation rules
		// do not apply (the existing studies disable the same rules inline).
		files: [
			'src/lib/components/viz/HomeHero.svelte',
			'src/lib/components/viz/CompilerPipeline.svelte',
			'src/lib/components/viz/StackHeapVisualizer.svelte',
			'src/lib/components/viz/LogicGateSim3D.svelte'
		],
		rules: {
			'svelte/prefer-svelte-reactivity': 'off',
			'svelte/no-dom-manipulating': 'off'
		}
	},

	{
		// Config files and the MDX loader live outside the strict app rules.
		files: ['*.config.{js,ts}', 'svelte.config.js', 'src/lib/utils/shiki-theme.js'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off'
		}
	},

	{
		// `tools/` holds the toolchain verification harness: Node scripts whose
		// entire interface is stdout, run by hand, never shipped.
		files: ['tools/**/*.{js,mjs}'],
		rules: {
			'no-console': 'off'
		}
	},

	{
		// `scripts/` are command-line build tools, not app code. Their entire
		// interface is stdout — a validator that cannot print its findings is
		// useless — so §8's no-console rule does not apply to them.
		files: ['scripts/**/*.mjs'],
		rules: {
			'no-console': 'off',
			'@typescript-eslint/no-explicit-any': 'off'
		}
	}
);
