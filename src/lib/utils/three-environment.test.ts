import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene, WebGLRenderer } from 'three';
import { loadEnvironment, PREMIUM_HDRIS } from './three-environment';

const mocks = vi.hoisted(() => ({
	fetchPremiumAsset: vi.fn(),
	createDataTexture: vi.fn(),
	loadAsync: vi.fn(),
	fromEquirectangular: vi.fn(),
	disposePmrem: vi.fn(),
	prepareHdr: vi.fn()
}));

vi.mock('./progressive-assets', () => ({
	fetchPremiumAsset: mocks.fetchPremiumAsset
}));

vi.mock('three', () => ({
	EquirectangularReflectionMapping: 303,
	PMREMGenerator: class {
		fromEquirectangular = mocks.fromEquirectangular;
		dispose = mocks.disposePmrem;
	}
}));

vi.mock('three/examples/jsm/loaders/HDRLoader.js', () => ({
	HDRLoader: class {
		createDataTexture = mocks.createDataTexture;
		loadAsync = mocks.loadAsync;
	}
}));

const OPTIONS = {
	premium: PREMIUM_HDRIS.veniceSunset,
	fallbackUrl: '/hdri/studio_small_08_1k.hdr',
	intensity: 0.71,
	label: 'test scene',
	prepareHdr: mocks.prepareHdr
};

function fakeHdr() {
	return { mapping: 0, dispose: vi.fn() };
}

function fakeScene() {
	return { environment: null, environmentIntensity: 1 } as unknown as Scene;
}

function fakeRenderer() {
	return {} as WebGLRenderer;
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.fromEquirectangular.mockReturnValue({ texture: { isTexture: true } });
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('loadEnvironment', () => {
	it('uses the premium HDR and disposes the source and PMREM generator', async () => {
		const premium = fakeHdr();
		mocks.fetchPremiumAsset.mockResolvedValue(new ArrayBuffer(8));
		mocks.createDataTexture.mockReturnValue(premium);

		const scene = fakeScene();
		const result = await loadEnvironment(
			fakeRenderer(),
			scene,
			new AbortController().signal,
			() => false,
			OPTIONS
		);

		expect(result?.source).toBe('premium');
		expect(scene.environment).toBe(result?.texture);
		expect(scene.environmentIntensity).toBe(0.71);
		expect(mocks.prepareHdr).toHaveBeenCalledWith(premium);
		expect(mocks.fetchPremiumAsset).toHaveBeenCalledWith(PREMIUM_HDRIS.veniceSunset.url, 1500, {
			signal: expect.any(AbortSignal),
			integrity: PREMIUM_HDRIS.veniceSunset.sri
		});
		expect(mocks.loadAsync).not.toHaveBeenCalled();
		expect(premium.dispose).toHaveBeenCalledOnce();
		expect(mocks.disposePmrem).toHaveBeenCalledOnce();
	});

	it('falls back to the bundled HDR when the premium fetch misses', async () => {
		const bundled = fakeHdr();
		mocks.fetchPremiumAsset.mockResolvedValue(null);
		mocks.loadAsync.mockResolvedValue(bundled);

		const result = await loadEnvironment(
			fakeRenderer(),
			fakeScene(),
			new AbortController().signal,
			() => false,
			OPTIONS
		);

		expect(result?.source).toBe('bundled');
		expect(mocks.createDataTexture).not.toHaveBeenCalled();
		expect(mocks.loadAsync).toHaveBeenCalledWith(OPTIONS.fallbackUrl);
		expect(bundled.dispose).toHaveBeenCalledOnce();
	});

	it('falls back to the bundled HDR when the premium bytes cannot be decoded', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const bundled = fakeHdr();
		mocks.fetchPremiumAsset.mockResolvedValue(new ArrayBuffer(8));
		mocks.createDataTexture.mockImplementation(() => {
			throw new Error('bad HDR');
		});
		mocks.loadAsync.mockResolvedValue(bundled);

		const result = await loadEnvironment(
			fakeRenderer(),
			fakeScene(),
			new AbortController().signal,
			() => false,
			OPTIONS
		);

		expect(result?.source).toBe('bundled');
		expect(bundled.dispose).toHaveBeenCalledOnce();
		expect(warn).toHaveBeenCalled();
	});

	it('returns null and leaves the scene untouched when both tiers fail', async () => {
		const scene = fakeScene();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		mocks.fetchPremiumAsset.mockResolvedValue(null);
		mocks.loadAsync.mockRejectedValue(new Error('offline'));

		const result = await loadEnvironment(
			fakeRenderer(),
			scene,
			new AbortController().signal,
			() => false,
			OPTIONS
		);

		expect(result).toBeNull();
		expect(scene.environment).toBeNull();
		expect(warn).toHaveBeenCalled();
	});

	it('stops before decoding or falling back when the scene was disposed', async () => {
		mocks.fetchPremiumAsset.mockResolvedValue(new ArrayBuffer(8));

		const result = await loadEnvironment(
			fakeRenderer(),
			fakeScene(),
			new AbortController().signal,
			() => true,
			OPTIONS
		);

		expect(result).toBeNull();
		expect(mocks.createDataTexture).not.toHaveBeenCalled();
		expect(mocks.loadAsync).not.toHaveBeenCalled();
	});
});
