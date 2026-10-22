import { describe, expect, it } from 'vitest';

import { floatToHalf, halfToFloat, tintPixels, warmEnvironment } from './warm-environment';

describe('half-float conversion', () => {
	it('round-trips representative values within half precision', () => {
		for (const value of [0, 0.25, 0.5, 1, 2, 7.5, 100, 1000]) {
			expect(halfToFloat(floatToHalf(value))).toBeCloseTo(value, value > 100 ? 0 : 2);
		}
	});
});

describe('tintPixels', () => {
	it('leaves red alone and pulls blue down most (float data)', () => {
		const data = new Float32Array([1, 1, 1, 1]);
		tintPixels(data, 1);
		expect(data[0]).toBeCloseTo(1, 5);
		expect(data[1]).toBeCloseTo(0xd9 / 255, 5);
		expect(data[2]).toBeCloseTo(0xb3 / 255, 5);
		expect(data[3]).toBe(1);
		expect(data[2]).toBeLessThan(data[1]);
	});

	it('does nothing at strength 0', () => {
		const data = new Float32Array([0.5, 0.6, 0.7, 1]);
		tintPixels(data, 0);
		expect(Array.from(data)).toEqual([0.5, 0.6, 0.7, 1].map((v) => Math.fround(v)));
	});

	it('tints half-float data and keeps alpha', () => {
		const data = new Uint16Array([floatToHalf(2), floatToHalf(2), floatToHalf(2), floatToHalf(1)]);
		tintPixels(data, 1);
		expect(halfToFloat(data[0])).toBeCloseTo(2, 1);
		expect(halfToFloat(data[2])).toBeCloseTo(2 * (0xb3 / 255), 1);
		expect(halfToFloat(data[3])).toBe(1);
	});
});

describe('warmEnvironment', () => {
	it('tints a texture in place and flags it for upload', () => {
		const texture = { image: { data: new Float32Array([1, 1, 1, 1]) }, needsUpdate: false };
		expect(warmEnvironment(texture, 1)).toBe(texture);
		expect(texture.needsUpdate).toBe(true);
		expect(texture.image.data[2]).toBeLessThan(1);
	});

	it('skips textures with an unknown pixel layout', () => {
		const texture = { image: { data: new Uint8Array([255, 255, 255, 255]) }, needsUpdate: false };
		warmEnvironment(texture);
		expect(texture.needsUpdate).toBe(false);
		expect(Array.from(texture.image.data)).toEqual([255, 255, 255, 255]);
	});
});
