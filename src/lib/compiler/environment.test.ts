import { describe, expect, it } from 'vitest';

import { describeEnvironment, readPageEnvironment, type PageEnvironment } from './environment';

const base: PageEnvironment = {
	origin: 'http://localhost:5173',
	crossOriginIsolated: true,
	isSecureContext: true,
	hasSharedArrayBuffer: true
};

describe('describeEnvironment', () => {
	it('reports the measured values verbatim', () => {
		const { facts } = describeEnvironment({ ...base, origin: 'http://192.168.1.20:5173' });
		expect(facts).toContainEqual({ label: 'Address', value: 'http://192.168.1.20:5173' });
		expect(facts).toContainEqual({ label: 'crossOriginIsolated', value: 'true' });
		expect(facts).toContainEqual({ label: 'SharedArrayBuffer', value: 'available' });
	});

	it('blames a non-secure address first', () => {
		const { hint } = describeEnvironment({
			...base,
			origin: 'http://192.168.1.20:5173',
			isSecureContext: false,
			crossOriginIsolated: false
		});
		expect(hint).toContain('http://localhost:5173');
	});

	it('blames the headers only when the page is secure but not isolated', () => {
		const { hint } = describeEnvironment({ ...base, crossOriginIsolated: false });
		expect(hint).toContain('Cross-Origin-Opener-Policy');
	});

	it('does not blame the headers when the page is isolated', () => {
		const { hint } = describeEnvironment(base);
		expect(hint).not.toContain('did not send');
		expect(hint).toContain('headers are fine');
	});

	it('marks a missing SharedArrayBuffer', () => {
		const { facts } = describeEnvironment({ ...base, hasSharedArrayBuffer: false });
		expect(facts).toContainEqual({ label: 'SharedArrayBuffer', value: 'missing' });
	});
});

describe('readPageEnvironment', () => {
	it('reads the facts from a window-like scope', () => {
		const env = readPageEnvironment({
			location: { origin: 'http://localhost:4173' },
			crossOriginIsolated: true,
			isSecureContext: true
		} as unknown as Window);
		expect(env?.origin).toBe('http://localhost:4173');
		expect(env?.crossOriginIsolated).toBe(true);
	});
});
