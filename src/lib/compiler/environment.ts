/**
 * What the page can tell us about why the C toolchain would not start.
 *
 * The toolchain needs a secure, cross-origin-isolated page (SharedArrayBuffer
 * backs the stdin channel). When boot fails, the error panel shows these facts
 * verbatim, so a failure on someone else's machine can be diagnosed from one
 * screenshot instead of guessing at headers.
 *
 * Pure: takes the facts as input so it is unit-testable without a browser.
 */

export interface PageEnvironment {
	origin: string;
	crossOriginIsolated: boolean;
	isSecureContext: boolean;
	hasSharedArrayBuffer: boolean;
}

export interface EnvironmentReport {
	/** `label: value` pairs, in display order. */
	facts: { label: string; value: string }[];
	/** The single most likely cause, in one sentence. */
	hint: string;
}

/** Read the facts from a browser window. Returns null outside a browser. */
export function readPageEnvironment(
	scope: Pick<Window, 'location' | 'crossOriginIsolated' | 'isSecureContext'> | undefined = typeof window ===
	'undefined'
		? undefined
		: window
): PageEnvironment | null {
	if (!scope) return null;
	return {
		origin: scope.location.origin,
		crossOriginIsolated: scope.crossOriginIsolated,
		isSecureContext: scope.isSecureContext,
		hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined'
	};
}

export function describeEnvironment(env: PageEnvironment): EnvironmentReport {
	const facts = [
		{ label: 'Address', value: env.origin },
		{ label: 'crossOriginIsolated', value: String(env.crossOriginIsolated) },
		{ label: 'isSecureContext', value: String(env.isSecureContext) },
		{ label: 'SharedArrayBuffer', value: env.hasSharedArrayBuffer ? 'available' : 'missing' }
	];

	let hint: string;
	if (!env.isSecureContext) {
		hint =
			'This address is not a secure context. Open the app at http://localhost:5173, not a network address such as 192.168.x.x.';
	} else if (!env.crossOriginIsolated) {
		hint =
			'The page is not cross-origin isolated, so the server did not send both Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp. Use pnpm dev or pnpm preview, or add those headers to your server.';
	} else {
		hint =
			'The page is isolated, so the headers are fine. Another tab on this address may be holding the toolchain cache: close the other tabs, reload, and if it still fails clear site data for this address.';
	}

	return { facts, hint };
}
