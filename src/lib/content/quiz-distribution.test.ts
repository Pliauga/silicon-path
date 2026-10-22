import { describe, expect, it } from 'vitest';
import { seededOrder } from '$lib/utils/shuffle';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Authored answers sit at index 0 in almost every quiz. The display order is a
 * seeded shuffle of the ids, so what the learner sees must be spread across
 * positions. This guards that: if a quiz id scheme changes or the shuffle
 * regresses to identity, the answer would be position A again.
 */
function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

describe('quiz answer position', () => {
	const ids = walk('src/content')
		.filter((file) => file.endsWith('.mdx'))
		.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/<QuizCard[^>]*?\bid="([^"]+)"/g)].map((m) => m[1] as string));

	it('finds the authored quizzes', () => {
		expect(ids.length).toBeGreaterThan(30);
	});

	it('does not show the authored-first answer in any one slot more than 40% of the time', () => {
		const counts = [0, 0, 0, 0];
		for (const id of ids) {
			const position = seededOrder(4, id).indexOf(0);
			counts[position] = (counts[position] ?? 0) + 1;
		}
		for (const count of counts) expect(count / ids.length).toBeLessThanOrEqual(0.4);
	});
});
