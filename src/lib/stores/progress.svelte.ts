/**
 * Lesson progress, persisted to `localStorage` (§2 constraint 6, §6.3).
 *
 * A lesson is either untouched, "in progress" (opened but not marked done), or
 * complete. The home page's "continue where you left off" card and the overall
 * progress ring both derive from this one map.
 */

const STORAGE_KEY = 'silicon-path:progress';

export interface LessonProgress {
	/** ISO timestamp of the last visit. */
	lastVisited: string;
	/** ISO timestamp of completion, absent until the learner marks it done. */
	completedAt?: string;
}

export type ProgressMap = Record<string, LessonProgress>;

function readStored(): ProgressMap {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		const entries = Object.entries(parsed as Record<string, unknown>);
		const clean: ProgressMap = {};
		for (const [slug, value] of entries) {
			if (!value || typeof value !== 'object') continue;
			const record = value as Record<string, unknown>;
			if (typeof record.lastVisited !== 'string') continue;
			clean[slug] = {
				lastVisited: record.lastVisited,
				...(typeof record.completedAt === 'string'
					? { completedAt: record.completedAt }
					: {})
			};
		}
		return clean;
	} catch {
		return {};
	}
}

class ProgressStore {
	#map = $state<ProgressMap>(readStored());

	/** Every slug the learner has opened. */
	get visited(): string[] {
		return Object.keys(this.#map);
	}

	/** Every slug marked complete. */
	get completed(): string[] {
		return Object.entries(this.#map)
			.filter(([, entry]) => entry.completedAt !== undefined)
			.map(([slug]) => slug);
	}

	get count(): number {
		return this.completed.length;
	}

	isComplete(slug: string): boolean {
		return this.#map[slug]?.completedAt !== undefined;
	}

	isVisited(slug: string): boolean {
		return this.#map[slug] !== undefined;
	}

	/** The most recently touched lesson that is started but not finished. */
	lastVisitedIncomplete(): string | undefined {
		const candidates = Object.entries(this.#map)
			.filter(([, entry]) => entry.completedAt === undefined)
			.sort(([, a], [, b]) => Date.parse(b.lastVisited) - Date.parse(a.lastVisited));
		return candidates[0]?.[0];
	}

	/** The most recently finished lesson. */
	mostRecentlyCompleted(): string | undefined {
		const candidates = Object.entries(this.#map)
			.filter(([, entry]) => entry.completedAt !== undefined)
			.sort(
				([, a], [, b]) => Date.parse(b.completedAt ?? '') - Date.parse(a.completedAt ?? '')
			);
		return candidates[0]?.[0];
	}

	/** Records a visit without completing the lesson. */
	visit(slug: string): void {
		const existing = this.#map[slug];
		this.#map = {
			...this.#map,
			[slug]: {
				lastVisited: new Date().toISOString(),
				...(existing?.completedAt ? { completedAt: existing.completedAt } : {})
			}
		};
		this.#persist();
	}

	/** Marks a lesson complete (idempotent). */
	complete(slug: string): void {
		const now = new Date().toISOString();
		this.#map = {
			...this.#map,
			[slug]: {
				lastVisited: now,
				completedAt: this.#map[slug]?.completedAt ?? now
			}
		};
		this.#persist();
	}

	/** Undoes a completion but keeps the visit on record. */
	uncomplete(slug: string): void {
		const existing = this.#map[slug];
		if (!existing) return;
		this.#map = {
			...this.#map,
			[slug]: { lastVisited: existing.lastVisited }
		};
		this.#persist();
	}

	#persist(): void {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#map));
		} catch {
			// Storage full or unavailable: progress degrades to in-memory only.
		}
	}
}

export const progress = new ProgressStore();
