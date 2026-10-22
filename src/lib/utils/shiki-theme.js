/**
 * The Silicon Path code-block theme.
 *
 * Deliberately *not* a stock Shiki theme: every foreground points at a
 * `--syntax-*` custom property from `app.css`, so a highlighted code block
 * can never drift from the design system ("Editorial Void": cyan keywords and
 * functions, terracotta numbers and types, teal strings, olive operators, on the
 * ivory blueprint canvas). In dark mode the same variables resolve to espresso paper and brighter inks, so the block follows the theme with no second Shiki theme. Shiki writes these strings straight into the element's `style`
 * attribute, which the browser resolves against the active `[data-theme]`.
 *
 * Plain data, so this stays a `.js` file: `svelte.config.js` is loaded by Node
 * itself (which does not strip TypeScript types on stock Node 22 LTS), so a
 * `.ts` import here would break `pnpm build` for anyone on the pinned runtime.
 * JSDoc below keeps editor autocomplete without needing a compiler.
 *
 * Only `c` and `bash` are registered (see `svelte.config.js`); anything else
 * falls back to unhighlighted markup so we never ship an extra grammar.
 */

/** @param {string} name */
const token = (name) => `var(--syntax-${name})`;

/** Colours for the code-block chrome itself, which Shiki also emits inline. */
const surface = {
	background: 'var(--rubin-paper)',
	foreground: 'var(--text-primary)'
};

/** @type {Record<string, string[]>} */
const scopes = {
	comment: ['comment', 'punctuation.definition.comment', 'string.comment'],
	keyword: [
		'keyword',
		'keyword.control',
		'keyword.operator.word',
		'storage',
		'storage.type',
		'storage.modifier',
		'keyword.control.directive'
	],
	string: [
		'string',
		'string.quoted',
		'string.template',
		'constant.character.escape',
		'punctuation.definition.string'
	],
	number: [
		'constant.numeric',
		'constant.numeric.integer',
		'constant.numeric.float',
		'constant.numeric.hex',
		'constant.language',
		'constant.other'
	],
	func: [
		'entity.name.function',
		'support.function',
		'meta.function-call',
		'entity.name.function.macro',
		'variable.function'
	],
	type: [
		'entity.name.type',
		'support.type',
		'support.class',
		'entity.name.tag',
		'storage.type.builtin',
		'meta.type.cast'
	],
	operator: ['keyword.operator', 'keyword.operator.arithmetic', 'keyword.operator.assignment', 'keyword.operator.comparison', 'keyword.operator.logical', 'keyword.operator.bitwise'],
	punct: ['punctuation', 'meta.brace', 'punctuation.separator', 'punctuation.terminator']
};

/** Preprocessor directives and C keywords read as "structure", not noise. */
const emphaticScopes = [
	'meta.preprocessor',
	'meta.preprocessor.include',
	'keyword.control.directive.include'
];

/** @type {import('shiki').ThemeRegistration} */
export const fullCodeTheme = {
	name: 'silicon-path',
	type: 'light',
	colors: {
		'editor.background': surface.background,
		'editor.foreground': surface.foreground
	},
	tokenColors: [
		{ scope: scopes.comment, settings: { foreground: token('comment'), fontStyle: 'italic' } },
		{ scope: scopes.keyword, settings: { foreground: token('keyword') } },
		{ scope: scopes.operator, settings: { foreground: token('op') } },
		{ scope: emphaticScopes, settings: { foreground: token('keyword') } },
		{ scope: scopes.string, settings: { foreground: token('string') } },
		{ scope: scopes.number, settings: { foreground: token('number') } },
		{ scope: scopes.func, settings: { foreground: token('func') } },
		{ scope: scopes.type, settings: { foreground: token('type') } },
		{ scope: scopes.punct, settings: { foreground: surface.foreground } }
	]
};
