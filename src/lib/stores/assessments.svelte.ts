/**
 * Per-assessment results: exercised and quizzed, solved or not.
 *
 * Deliberately separate from `progress.svelte.ts` (which only knows
 * lesson-level visit/complete). Card ids are globally unique across the
 * curriculum, so a flat map is enough and the two stores stay independently
 * resettable — a student can clear what they scored on exercises without
 * losing where they had read to.
 */

const STORAGE_KEY = 'silicon-path:assessments';

export interface AssessmentRecord {
	/** How many times the student has submitted an answer. */
	attempts: number;
	/** ISO timestamp of the most recent submission. */
	lastAttemptAt: string;
	/** ISO timestamp of the FIRST submission graded correct, if any. Sticky: "ever verified". */
	solvedAt?: string;
	/** ISO timestamp of the most recent correct submission (moves on every re-answer). */
	lastCorrectAt?: string;
	/** Consecutive correct submissions; a wrong answer resets it to 0. */
	streak?: number;
	/**
	 * ISO timestamp of a theory note being marked read. Deliberately separate
	 * from `solvedAt`: reading is not verification, and nothing here was graded.
	 */
	readAt?: string;
}

type AssessmentMap = Record<string, AssessmentRecord>;

function readStored(): AssessmentMap {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return {};
		const map: AssessmentMap = {};
		for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (!value || typeof value !== 'object') continue;
			const record = value as Partial<AssessmentRecord>;
			if (typeof record.attempts !== 'number') continue;
			map[id] = {
				attempts: record.attempts,
				lastAttemptAt: typeof record.lastAttemptAt === 'string' ? record.lastAttemptAt : '',
				...(typeof record.solvedAt === 'string' ? { solvedAt: record.solvedAt } : {}),
				...(typeof record.lastCorrectAt === 'string' ? { lastCorrectAt: record.lastCorrectAt } : {}),
				...(typeof record.streak === 'number' ? { streak: record.streak } : {}),
				...(typeof record.readAt === 'string' ? { readAt: record.readAt } : {})
			};
		}
		return map;
	} catch {
		return {};
	}
}

class AssessmentStore {
	#records = $state<AssessmentMap>(readStored());

	/** Raw record for a card id, if it has ever been attempted. */
	get(id: string): AssessmentRecord | undefined {
		return this.#records[id];
	}

	isSolved(id: string): boolean {
		return Boolean(this.#records[id]?.solvedAt);
	}

	attempts(id: string): number {
		return this.#records[id]?.attempts ?? 0;
	}

	/** Consecutive correct answers since the last miss. */
	streak(id: string): number {
		return this.#records[id]?.streak ?? 0;
	}

	/** True once a theory note has been marked read (or, for legacy data, "solved"). */
	isRead(id: string): boolean {
		const record = this.#records[id];
		return Boolean(record?.readAt || record?.solvedAt);
	}

	/**
	 * Record one submission. `solvedAt` is sticky (the first correct answer is
	 * "ever verified"), but a quiz is never permanently green: `streak` and
	 * `lastCorrectAt` move with every re-answer, so a later miss is visible.
	 */
	record(id: string, correct: boolean): void {
		const now = new Date().toISOString();
		const previous = this.#records[id];
		const solvedAt = correct ? (previous?.solvedAt ?? now) : previous?.solvedAt;
		const lastCorrectAt = correct ? now : previous?.lastCorrectAt;
		this.#records = {
			...this.#records,
			[id]: {
				...previous,
				attempts: (previous?.attempts ?? 0) + 1,
				lastAttemptAt: now,
				streak: correct ? (previous?.streak ?? 0) + 1 : 0,
				...(solvedAt ? { solvedAt } : {}),
				...(lastCorrectAt ? { lastCorrectAt } : {})
			}
		};
		this.#persist();
	}

	/**
	 * Mark a theory note as read. This is NOT a submission: it never touches
	 * `attempts`, `solvedAt` or `streak`, so it cannot be mistaken for verified work.
	 */
	markRead(id: string): void {
		const previous = this.#records[id];
		if (previous?.readAt) return;
		const now = new Date().toISOString();
		this.#records = {
			...this.#records,
			[id]: {
				...previous,
				attempts: previous?.attempts ?? 0,
				lastAttemptAt: previous?.lastAttemptAt ?? '',
				readAt: now
			}
		};
		this.#persist();
	}

	/** Used by the dev-only "reset this lesson" affordance. */
	clear(id: string): void {
		if (!(id in this.#records)) return;
		const next = { ...this.#records };
		delete next[id];
		this.#records = next;
		this.#persist();
	}

	clearAll(): void {
		this.#records = {};
		this.#persist();
	}

	get solvedCount(): number {
		return Object.values(this.#records).filter((record) => record.solvedAt).length;
	}

	#persist(): void {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#records));
		} catch {
			/* quota or private-mode failure: in-memory state still works */
		}
	}
}

export const assessments = new AssessmentStore();