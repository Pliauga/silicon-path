/**
 * Warm the studio HDRI so metal and glass reflect the ivory-and-clay room the
 * page is set in, not a cold blue studio.
 *
 * Reflections come from the environment map, not from ambient lights: a
 * metalness-1 surface has no diffuse term, so a warm HemisphereLight cannot
 * tint it. The tint therefore multiplies the equirectangular pixels once,
 * before PMREM filtering. That is a one-off pass at scene load; there is no
 * per-frame cost.
 *
 * Pure and Three-free so it can be unit-tested: it takes the texture's raw
 * pixel buffer (RGBE-decoded to RGBA half-float or float).
 */

/** Warm ambient colour shared by the 3D scenes (matches HomeHero). */
export const WARM_AMBIENT = 0xffd9b3;

/** #FFD9B3 as linear-ish multipliers. */
const WARM_RGB: readonly [number, number, number] = [1, 0xd9 / 255, 0xb3 / 255];

const F32 = new Float32Array(1);
const U32 = new Uint32Array(F32.buffer);

export function halfToFloat(half: number): number {
	const sign = (half & 0x8000) >> 15;
	const exponent = (half & 0x7c00) >> 10;
	const fraction = half & 0x03ff;
	if (exponent === 0) return (sign ? -1 : 1) * 2 ** -14 * (fraction / 1024);
	if (exponent === 0x1f) return fraction ? Number.NaN : sign ? -Infinity : Infinity;
	return (sign ? -1 : 1) * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

export function floatToHalf(value: number): number {
	F32[0] = value;
	const bits = U32[0];
	const sign = (bits >>> 16) & 0x8000;
	const exponent = ((bits >>> 23) & 0xff) - 127 + 15;
	const fraction = bits & 0x7fffff;
	if (exponent >= 0x1f) return sign | 0x7c00;
	if (exponent <= 0) {
		if (exponent < -10) return sign;
		const subnormal = (fraction | 0x800000) >> (1 - exponent);
		return sign | ((subnormal + 0x1000) >> 13);
	}
	return sign | (exponent << 10) | ((fraction + 0x1000) >> 13);
}

export type PixelBuffer = Uint16Array | Float32Array;

/**
 * Multiply an RGBA pixel buffer's colour channels toward `WARM_RGB`.
 * `strength` 0 leaves it untouched, 1 applies the full tint. Alpha is kept.
 * Mutates and returns the buffer.
 */
export function tintPixels(data: PixelBuffer, strength = 0.55): PixelBuffer {
	const mix = Math.min(1, Math.max(0, strength));
	const scale = WARM_RGB.map((channel) => 1 + (channel - 1) * mix);
	const half = data instanceof Uint16Array;
	for (let index = 0; index + 3 < data.length; index += 4) {
		for (let channel = 0; channel < 3; channel += 1) {
			const value = half ? halfToFloat(data[index + channel]) : data[index + channel];
			const tinted = value * scale[channel];
			data[index + channel] = half ? floatToHalf(tinted) : tinted;
		}
	}
	return data;
}

/** A DataTexture-shaped value: what `HDRLoader.loadAsync` resolves to. */
interface PixelTexture {
	image?: { data?: unknown };
	needsUpdate?: boolean;
}

/** Tint a loaded HDR texture in place. Silently skips unknown pixel layouts. */
export function warmEnvironment<T extends PixelTexture>(texture: T, strength = 0.55): T {
	const data = texture.image?.data;
	if (data instanceof Uint16Array || data instanceof Float32Array) {
		tintPixels(data, strength);
		texture.needsUpdate = true;
	}
	return texture;
}
