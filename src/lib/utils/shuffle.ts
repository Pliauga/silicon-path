/**
 * Deterministic shuffling.
 *
 * Quiz options must not sit in authored order (the correct answer was first in
 * 61 of 63 quizzes), but they must not reshuffle on every render either: a
 * screen-reader user, or a learner who reloads, would find the list rearranged
 * under them. The order is therefore a pure function of a string seed, which
 * for a quiz is its stable id.
 */

/** xmur3: turns a string into a well-mixed 32-bit seed. */
function hashSeed(seed: string): number {
	let h = 1779033703 ^ seed.length;
	for (let i = 0; i < seed.length; i += 1) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	h = Math.imul(h ^ (h >>> 16), 2246822507);
	h = Math.imul(h ^ (h >>> 13), 3266489909);
	return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32: a tiny seeded PRNG returning floats in [0, 1). */
function mulberry32(state: number): () => number {
	let a = state;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * A permutation of `0..length-1`, fixed for a given seed (Fisher-Yates driven
 * by a seeded PRNG). `seededOrder(4, 'q')[0]` is the original index shown first.
 */
export function seededOrder(length: number, seed: string): number[] {
	const order = Array.from({ length: Math.max(0, length) }, (_, index) => index);
	const random = mulberry32(hashSeed(seed));
	for (let i = order.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1));
		const held = order[i] as number;
		order[i] = order[j] as number;
		order[j] = held;
	}
	return order;
}
