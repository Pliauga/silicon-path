import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPremiumAsset } from './progressive-assets';

const URL_UNDER_TEST = 'https://cdn.example.test/environment.hdr';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('fetchPremiumAsset', () => {
	it('returns the response bytes on success', async () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const fetchMock = vi.fn(async () => new Response(bytes, { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const asset = await fetchPremiumAsset(URL_UNDER_TEST);

		expect(asset).toBeInstanceOf(ArrayBuffer);
		expect(new Uint8Array(asset!)).toEqual(bytes);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('returns null for an HTTP error response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('missing', { status: 404 }))
		);

		expect(await fetchPremiumAsset(URL_UNDER_TEST)).toBeNull();
	});

	it('returns null when the network rejects', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch');
			})
		);

		expect(await fetchPremiumAsset(URL_UNDER_TEST)).toBeNull();
	});

	it('aborts a hanging request and returns null after the timeout', async () => {
		const fetchMock = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						reject(new DOMException('The operation was aborted.', 'AbortError'));
					});
				})
		);
		vi.stubGlobal('fetch', fetchMock);

		const started = Date.now();
		const asset = await fetchPremiumAsset(URL_UNDER_TEST, 25);

		expect(asset).toBeNull();
		expect(Date.now() - started).toBeGreaterThanOrEqual(20);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('aborts an external signal mid-request and returns null', async () => {
		const fetchMock = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						reject(new DOMException('The operation was aborted.', 'AbortError'));
					});
				})
		);
		vi.stubGlobal('fetch', fetchMock);

		const controller = new AbortController();
		const request = fetchPremiumAsset(URL_UNDER_TEST, 1500, {
			signal: controller.signal
		});
		setTimeout(() => controller.abort(), 10);

		expect(await request).toBeNull();
		expect(controller.signal.aborted).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
