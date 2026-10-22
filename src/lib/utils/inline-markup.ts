/**
 * Tiny inline-markup splitter for strings passed as component props.
 *
 * Handbook answers use `code` and **bold** spans. Props bypass the MDX
 * pipeline, so this keeps that formatting without `{@html}`: the result is
 * rendered as text nodes inside real `<code>` / `<strong>` elements.
 */

export interface InlineSegment {
	kind: 'text' | 'code' | 'bold';
	text: string;
}

export function inlineSegments(source: string): InlineSegment[] {
	const segments: InlineSegment[] = [];
	const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g;
	let last = 0;
	for (const match of source.matchAll(pattern)) {
		const start = match.index ?? 0;
		if (start > last) segments.push({ kind: 'text', text: source.slice(last, start) });
		if (match[1] !== undefined) segments.push({ kind: 'code', text: match[1] });
		else segments.push({ kind: 'bold', text: match[2] ?? '' });
		last = start + match[0].length;
	}
	if (last < source.length) segments.push({ kind: 'text', text: source.slice(last) });
	return segments;
}
