<script lang="ts">
	/**
	 * CodeMirror 6 wrapper for C.
	 *
	 * Kept deliberately thin: the component owns the view lifecycle and maps
	 * the backend's diagnostics onto gutter markers. Anything a lesson wants to
	 * do with the editor (run it, check it) goes through the callbacks instead
	 * of reaching into `view`.
	 *
	 * CodeMirror is created on mount only — it touches `window`.
	 */
	import { onMount } from 'svelte';
	import { EditorState, type Extension } from '@codemirror/state';
	import {
		EditorView,
		drawSelection,
		highlightActiveLine,
		highlightActiveLineGutter,
		keymap,
		lineNumbers
	} from '@codemirror/view';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { cpp } from '@codemirror/lang-cpp';
	import { forceLinting, linter, lintGutter, type Diagnostic as LintDiagnostic } from '@codemirror/lint';
	import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
	import { tags } from '@lezer/highlight';

	import type { Diagnostic } from '$lib/compiler';

	interface Props {
		/** Current document text. Changes are applied only when they differ. */
		value?: string;
		diagnostics?: Diagnostic[];
		onchange?: (value: string) => void;
		/** Mod-Enter inside the editor. */
		onrun?: () => void;
	}

	let { value = '', diagnostics = [], onchange, onrun }: Props = $props();

	let host: HTMLDivElement | undefined = $state();
	let view: EditorView | null = null;

	/** Latest diagnostics, read by the lint source without re-creating the view. */
	let current: Diagnostic[] = [];
	/** Read by the keymap; kept current by the effect below. */
	let latestOnrun: (() => void) | undefined;

	$effect(() => {
		latestOnrun = onrun;
	});

	// Theme-agnostic: ivory-med canvas, stone active line,
	// slate caret, hairline-free gutter. Colours come from the same custom
	// properties Shiki uses, so lesson code blocks and the editor never drift.
	const theme = EditorView.theme(
		{
			'&': {
				height: '100%',
				fontSize: 'var(--code-size, 15px)',
				fontWeight: 'var(--code-weight, 500)',
				boxSizing: 'border-box',
				// Same blueprint surface as the Shiki blocks (@utility blueprint).
				// The grid lives on the scroller (see below) so it scrolls with the text.
				backgroundColor: 'var(--rubin-paper)',
				border: 'var(--blueprint-border)',
				color: 'var(--text-primary)'
			},
			'.cm-scroller': {
				fontFamily: 'var(--font-mono, monospace)',
				// One grid cell per line: the line-height equals --blueprint-cell.
				lineHeight: 'var(--blueprint-cell, 24px)',
				overflow: 'auto',
				backgroundImage: 'var(--blueprint-grid)',
				backgroundSize: 'var(--blueprint-cell, 24px) var(--blueprint-cell, 24px)',
				backgroundAttachment: 'local'
			},
			'.cm-line': { padding: '0 var(--blueprint-cell, 24px) 0 0' },
			'.cm-content': {
				caretColor: 'var(--rubin-slate)',
				padding: 'var(--blueprint-cell, 24px) 0'
			},
			'.cm-gutters': {
				backgroundColor: 'transparent',
				color: 'var(--text-muted)',
				border: 'none',
				paddingLeft: 'calc(var(--blueprint-cell, 24px) / 2)'
			},
			'&.cm-focused': { outline: 'none' },
			// 10% stone wash so the grid stays visible; syntax inks are contrast-checked
			// against grid line + this wash (>= 4.5:1).
			'.cm-activeLine': { backgroundColor: 'rgba(138, 130, 116, 0.1)' },
			'.cm-activeLineGutter': {
				backgroundColor: 'rgba(138, 130, 116, 0.1)',
				color: 'var(--text-primary)'
			},
			'.cm-selectionBackground, .cm-content ::selection': {
				backgroundColor: 'var(--accent-muted) !important'
			},
			'&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
				backgroundColor: 'var(--accent-muted) !important'
			},
			'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--rubin-slate)' },
			'.cm-lintRange-error': { textDecoration: 'underline wavy var(--error)' },
			'.cm-lintRange-warning': { textDecoration: 'underline wavy var(--warning)' },
			'.cm-tooltip': {
				backgroundColor: 'var(--rubin-paper)',
				color: 'var(--text-primary)',
				border: '1px solid var(--rubin-gray)',
				borderRadius: '0'
			},
			'.cm-lint-marker': { width: '0.75em', height: '0.75em' }
		},
		{ dark: false }
	);

	const highlight = syntaxHighlighting(
		HighlightStyle.define([
			{ tag: tags.keyword, color: 'var(--syntax-keyword)' },
			{ tag: [tags.string, tags.special(tags.string)], color: 'var(--syntax-string)' },
			{ tag: [tags.number, tags.bool], color: 'var(--syntax-number)' },
			{ tag: tags.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
			{ tag: [tags.function(tags.variableName), tags.macroName], color: 'var(--syntax-func)' },
			{ tag: [tags.typeName, tags.className], color: 'var(--syntax-type)' },
			{ tag: [tags.operator, tags.operatorKeyword], color: 'var(--syntax-op)' },
			{ tag: [tags.punctuation, tags.bracket], color: 'var(--text-primary)' }
		])
	);

	/** Map backend diagnostics onto CodeMirror's gutter format. */
	function toLint(view: EditorView): LintDiagnostic[] {
		const doc = view.state.doc;
		return current.map((diagnostic) => {
			const lineNumber = Math.min(Math.max(diagnostic.line || 1, 1), doc.lines);
			const line = doc.line(lineNumber);
			const from = Math.min(line.from + Math.max(diagnostic.column - 1, 0), line.to);
			return {
				from,
				to: Math.min(from + 1, line.to),
				severity: diagnostic.severity === 'note' ? 'info' : diagnostic.severity,
				message: diagnostic.message
			};
		});
	}

	const extensions: Extension[] = [
		lineNumbers(),
		highlightActiveLineGutter(),
		highlightActiveLine(),
		drawSelection(),
		history(),
		cpp(),
		highlight,
		theme,
		lintGutter(),
		linter(toLint, { delay: 250 }),
		EditorState.tabSize.of(4),
		EditorView.contentAttributes.of({ 'aria-label': 'C source code' }),
		keymap.of([
			{
				key: 'Mod-Enter',
				run: () => {
					latestOnrun?.();
					return true;
				}
			},
			indentWithTab,
			...defaultKeymap,
			...historyKeymap
		]),
		EditorView.updateListener.of((update) => {
			if (update.docChanged) onchange?.(update.state.doc.toString());
		})
	];

	onMount(() => {
		if (!host) return;
		view = new EditorView({
			state: EditorState.create({ doc: value, extensions }),
			parent: host
		});

		return () => {
			view?.destroy();
			view = null;
		};
	});

	// Keep the document in sync with the `value` prop (e.g. reset / lesson swap).
	$effect(() => {
		const next = value;
		if (!view) return;
		if (view.state.doc.toString() === next) return;
		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
	});

	// Push new diagnostics into the existing linter.
	$effect(() => {
		current = diagnostics;
		if (view) forceLinting(view);
	});
</script>

<div class="editor-shell h-full w-full overflow-hidden" bind:this={host}></div>

<style>
	/* CodeMirror paints its own chrome; keep the shell transparent so the
	   surrounding panel's border is the only frame. */
	.editor-shell :global(.cm-editor) {
		height: 100%;
	}
</style>