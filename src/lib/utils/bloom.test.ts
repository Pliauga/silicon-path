import { describe, expect, it } from 'vitest';
import type * as Three from 'three';
import { BLOOM, createBloom } from './bloom';

describe('bloom', () => {
	it('keeps the tamed settings from AGENTS.md section 5.1', () => {
		expect(BLOOM).toEqual({ threshold: 1.2, strength: 0.1, radius: 0.1 });
	});

	it('resolves null instead of throwing when the renderer cannot host a composer', async () => {
		const brokenRenderer = {
			getSize: () => {
				throw new Error('no WebGL');
			}
		} as unknown as Three.WebGLRenderer;
		const three = {} as typeof Three;
		const result = await createBloom(
			three,
			brokenRenderer,
			{} as Three.Scene,
			{} as Three.Camera
		);
		expect(result).toBeNull();
	});
});
