import adapter from '@sveltejs/adapter-static';
import { mdsvex } from 'mdsvex';
import { createHighlighter } from 'shiki';
import { fullCodeTheme } from './src/lib/utils/shiki-theme.js';

/**
 * Cached *promise*, not the resolved highlighter.
 *
 * mdsvex calls the highlight hook for every fence, and several of those calls
 * start before the first `createHighlighter` resolves. Caching only the result
 * let each concurrent caller see `undefined` and build its own instance — the
 * build printed "[Shiki] 10/20/30/40… instances have been created" until it
 * ran out of memory. Caching the promise means every caller awaits the same
 * initialisation.
 * @type {Promise<import('shiki').Highlighter> | undefined}
 */
let highlighterPromise;

function getHighlighter() {
	highlighterPromise ??= createHighlighter({
		themes: [fullCodeTheme],
		langs: ['c', 'bash']
	});
	return highlighterPromise;
}

/**
 * Escapes `{` and `}` so the highlighted markup survives Svelte compilation.
 *
 * Shiki escapes `<`, `>` and `&` in token text but not braces — and inside an
 * element, `{` is always a Svelte expression, so every C block containing a
 * brace broke the build with "Unexpected token". Character references render
 * as the original characters, so the visible text is unchanged. Braces inside
 * tags are left alone: the only ones there are in `style="…"` attributes.
 * @param {string} html
 */
function escapeBraces(html) {
	let out = '';
	let inTag = false;
	for (const char of html) {
		if (char === '<') inTag = true;
		else if (char === '>') inTag = false;

		if (!inTag && char === '{') out += '&#123;';
		else if (!inTag && char === '}') out += '&#125;';
		else out += char;
	}
	return out;
}

/**
 * mdsvex highlight hook. Only `c` and `bash` fences are highlighted; every
 * other language falls back to plain markup so we never ship extra grammars.
 * @type {import('mdsvex').MdsvexOptions['highlight']}
 */
const highlight = {
	highlighter: async (code, lang) => {
		const shiki = await getHighlighter();
		const loaded = shiki.getLoadedLanguages();
		const language = lang && loaded.includes(lang) ? lang : 'text';
		if (language === 'text') {
			return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
		}
		const html = escapeBraces(shiki.codeToHtml(code, { lang: language, theme: 'silicon-path' }));
		// Shiki puts `tabindex="0"` on the <pre>. That warning is a false
		// positive: a code block scrolls horizontally, and without a tab stop a
		// keyboard-only reader cannot scroll it or copy it (WCAG 2.1.1). Shiki
		// adds the attribute for exactly that reason. The ignore comment has to
		// be emitted here, in the same markup, because it must sit immediately
		// before the element it applies to.
		return `<!-- svelte-ignore a11y_no_noninteractive_tabindex -->${html}`;
	}
};

/**
 * Escapes text for direct placement inside an element's content.
 *
 * Braces matter as much as the HTML-special characters here: this markup is
 * handed to Svelte, and a `{` inside an element is always an expression, so a
 * C `struct { ... }` in a plain `text` fence killed the build with
 * "Expected token }". Character references render as the original glyphs.
 * @param {string} value
 */
function escapeHtml(value) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/\{/g, '&#123;')
		.replace(/\}/g, '&#125;');
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', '.mdx'],
	preprocess: [
		mdsvex({
			extensions: ['.mdx'],
			highlight
		})
	],
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			// `404.html` lets static hosts (and python -m http.server) serve our
			// error page for unknown paths instead of their own bare-bones one.
			fallback: '404.html',
			precompress: false,
			strict: true
		}),
		alias: {
			$lib: 'src/lib',
			$content: 'src/content'
		}
	}
};

export default config;
