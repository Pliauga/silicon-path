import { describe, expect, it } from 'vitest';
import { inlineSegments } from './inline-markup';

describe('inlineSegments', () => {
	it('splits code and bold spans from plain text', () => {
		expect(inlineSegments('Prints `7 / 2` as **3**, not 3.5.')).toEqual([
			{ kind: 'text', text: 'Prints ' },
			{ kind: 'code', text: '7 / 2' },
			{ kind: 'text', text: ' as ' },
			{ kind: 'bold', text: '3' },
			{ kind: 'text', text: ', not 3.5.' }
		]);
	});

	it('returns a single text segment when there is no markup', () => {
		expect(inlineSegments('plain')).toEqual([{ kind: 'text', text: 'plain' }]);
		expect(inlineSegments('')).toEqual([]);
	});
});
