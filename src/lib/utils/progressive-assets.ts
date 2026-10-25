/**
 * Optional ("premium") visual assets, fetched at runtime with a hard timeout.
 *
 * The app is offline-first: a CDN asset is always an enhancement, never a
 * requirement. `navigator.onLine` is deliberately not consulted — it only says
 * whether an interface exists, not whether the origin is reachable (captive
 * portals, DNS failures, CORS and slow requests all report "online"). Instead
 * the request races an `AbortController`, and every failure mode resolves to
 * `null` so the caller can keep its bundled or procedural fallback.
 */

/**
 * Fetch an asset and return its bytes, or `null` if it cannot be obtained.
 *
 * The timeout covers the body as well as the headers: the timer is cleared only
 * after `arrayBuffer()` settles, so a stalled download cannot outlive
 * `timeoutMs`.
 *
 * @param url       Absolute URL of the asset.
 * @param timeoutMs Budget for the complete request, in milliseconds.
 * @param options   Optional caller abort signal and SRI metadata.
 * @returns The asset bytes, or `null` on HTTP error, network error, CORS
 *          rejection, abort, or timeout.
 */
export async function fetchPremiumAsset(
	url: string,
	timeoutMs = 1500,
	options: { signal?: AbortSignal; integrity?: string } = {}
): Promise<ArrayBuffer | null> {
	const { signal, integrity } = options;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const onExternalAbort = () => controller.abort();

	if (signal?.aborted) controller.abort();
	else signal?.addEventListener('abort', onExternalAbort, { once: true });

	try {
		const response = await fetch(url, {
			signal: controller.signal,
			credentials: 'omit',
			mode: 'cors',
			...(integrity ? { integrity } : {})
		});
		if (!response.ok) return null;
		return await response.arrayBuffer();
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener('abort', onExternalAbort);
	}
}
