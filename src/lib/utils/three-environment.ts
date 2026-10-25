import type { DataTexture, Scene, Texture, WebGLRenderer } from 'three';
import { fetchPremiumAsset } from './progressive-assets';

/**
 * Shared progressive-enhancement environment loading for the 3D scenes.
 *
 * The chain is deliberately three-tiered:
 *   1. a commit-pinned, SRI-checked HDRI from jsDelivr;
 *   2. the bundled studio HDRI (works offline);
 *   3. no environment map at all, leaving the scene's procedural lights in
 *      charge. This module never adds or removes lights — the caller's light rig
 *      is the final fallback and is already in the scene.
 *
 * The premium request is cancelled through the caller's `AbortSignal`, so a
 * component teardown during the 1.5 s fetch cannot install an environment into
 * a scene that is already being destroyed.
 */

const THREE_EXAMPLES_COMMIT = '9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8';
const EQUIRECTANGULAR_BASE = `https://cdn.jsdelivr.net/gh/mrdoob/three.js@${THREE_EXAMPLES_COMMIT}/examples/textures/equirectangular`;

export type PremiumHdri = {
	readonly url: string;
	/** SHA-384 SRI digest of the exact CDN bytes. */
	readonly sri: string;
};

/**
 * The HDRI choices for the four progressive-enhancement scenes.
 *
 * All are Three.js r186 examples, pinned to the same immutable commit. The SRI
 * values were computed with `openssl dgst -sha384 -binary | base64` against the
 * bytes served by jsDelivr.
 *
 * - `veniceSunset`: warm, directional golden-hour light for the CPU package and
 *   the home hero.
 * - `ferndaleStudio`: a dark, coloured studio with cool practicals — used for
 *   the PCB-like memory hierarchy.
 * - `monochromeStudio`: a neutral cyclorama; the compiler scene warms it in
 *   `prepareHdr` so it matches the ivory-and-clay room.
 */
export const PREMIUM_HDRIS = {
	veniceSunset: {
		url: `${EQUIRECTANGULAR_BASE}/venice_sunset_1k.hdr`,
		sri: 'sha384-qF8CTgbo5SXaZBRQulYjWlJOqUPse8sQwxwCL6OI1UMbv+Rg3g/zV3xuimvIjRrU'
	},
	ferndaleStudio: {
		url: `${EQUIRECTANGULAR_BASE}/ferndale_studio_04_1k.hdr`,
		sri: 'sha384-h5ljFtKBU5x+Bg5T34rSJpbT6WCz05+E3uIcBGBxwkteiTOFi2qWqkT4BeeMPadt'
	},
	monochromeStudio: {
		url: `${EQUIRECTANGULAR_BASE}/monochrome_studio_02_1k.hdr`,
		sri: 'sha384-V9JlN7pDtje9077dCtpo4+9Kbb8IUfXNkoE+jFnmNkjq/bcJOBEXrhnWcv4W03N3'
	}
} as const satisfies Record<string, PremiumHdri>;

export type EnvironmentSource = 'premium' | 'bundled';

export type LoadedEnvironment = {
	/** PMREM-filtered environment map, also assigned to `scene.environment`. */
	texture: Texture;
	source: EnvironmentSource;
};

export type LoadEnvironmentOptions = {
	/** CDN HDRI and its SRI digest. */
	premium: PremiumHdri;
	/** Bundled offline fallback, resolved through SvelteKit's `asset()`. */
	fallbackUrl: string;
	/** `scene.environmentIntensity`; the per-scene value is preserved. */
	intensity?: number;
	/** Prefix for warnings, e.g. `HomeHero`. */
	label?: string;
	/**
	 * Last chance to mutate the decoded HDR before PMREM filtering, e.g. the
	 * compiler scene's warm tint. Both premium and bundled paths go through it.
	 */
	prepareHdr?: (hdr: DataTexture) => void;
	/** Budget for the CDN request only. Defaults to 1500 ms, like the pilot. */
	timeoutMs?: number;
};

/**
 * Load a PMREM environment map with a CDN → bundled → procedural fallback.
 *
 * @param renderer  The scene's renderer; PMREM runs on its WebGL context.
 * @param scene     Receives `environment` and `environmentIntensity` on success.
 * @param signal    Caller's teardown signal; aborts the premium request.
 * @param isDisposed Polled after every await so a late result is discarded.
 * @param options   Asset locations, intensity and optional HDR preparation.
 * @returns The owned PMREM texture and which tier supplied it, or `null` when
 *          both HDRIs failed (the caller's procedural lights remain in charge).
 *
 * The returned texture is owned by the caller: pass it to
 * `disposeObject3D(root, [texture])` as a kept resource and dispose it exactly
 * once in teardown. This function only disposes the source HDR and the PMREM
 * generator; the filtered texture must outlive them.
 */
export async function loadEnvironment(
	renderer: WebGLRenderer,
	scene: Scene,
	signal: AbortSignal,
	isDisposed: () => boolean,
	options: LoadEnvironmentOptions
): Promise<LoadedEnvironment | null> {
	const label = options.label ?? 'three-environment';
	let hdr: DataTexture | null = null;
	let pmrem: import('three').PMREMGenerator | null = null;

	try {
		const [THREE, hdrModule] = await Promise.all([
			import('three'),
			import('three/examples/jsm/loaders/HDRLoader.js')
		]);
		if (isDisposed() || signal.aborted) return null;

		const hdrLoader = new hdrModule.HDRLoader();
		let source: EnvironmentSource = 'bundled';

		const premiumBytes = await fetchPremiumAsset(
			options.premium.url,
			options.timeoutMs ?? 1500,
			{
				signal,
				integrity: options.premium.sri
			}
		);
		// A teardown aborts the signal; do not fall through to the bundled file in
		// that case, otherwise a destroyed scene would still allocate a GPU texture.
		if (isDisposed() || signal.aborted) return null;

		if (premiumBytes) {
			try {
				hdr = hdrLoader.createDataTexture(premiumBytes);
				source = 'premium';
			} catch (error) {
				console.warn(
					`[${label}] Premium HDRI could not be decoded; using the bundled fallback.`,
					error
				);
			}
		}

		if (!hdr) {
			try {
				hdr = await hdrLoader.loadAsync(options.fallbackUrl);
				source = 'bundled';
			} catch (error) {
				console.warn(
					`[${label}] Bundled HDRI failed to load; keeping procedural lighting.`,
					error
				);
				return null;
			}
		}

		if (isDisposed() || signal.aborted) return null;

		hdr.mapping = THREE.EquirectangularReflectionMapping;
		options.prepareHdr?.(hdr);

		pmrem = new THREE.PMREMGenerator(renderer);
		const texture = pmrem.fromEquirectangular(hdr).texture;
		scene.environment = texture;
		scene.environmentIntensity = options.intensity ?? 0.92;

		return { texture, source };
	} catch (error) {
		console.warn(`[${label}] Environment setup failed; keeping procedural lighting.`, error);
		return null;
	} finally {
		// The PMREM map is independent of both; only the source and the generator
		// are disposable here.
		hdr?.dispose();
		pmrem?.dispose();
	}
}
