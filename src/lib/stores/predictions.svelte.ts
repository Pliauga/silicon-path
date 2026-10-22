/**
 * Learner predictions for "Predict before you run" cards.
 *
 * A prediction is committed once per card: the typed text is stored with the
 * time it was locked in, and the model answer is only shown after that. The
 * text is kept so a reload does not erase what the learner actually thought,
 * which is the whole point of comparing it with the answer afterwards.
 */

const STORAGE_KEY = 'silicon-path:predictions';

export interface PredictionRecord {
	/** One entry per question, in question order. */
	guesses: string[];
	/** ISO timestamp of the commit. */
	committedAt: string;
}

type PredictionMap = Record<string, PredictionRecord>;

function readStored(): PredictionMap {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return {};
		const map: PredictionMap = {};
		for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (!value || typeof value !== 'object') continue;
			const record = value as Partial<PredictionRecord>;
			if (!Array.isArray(record.guesses) || typeof record.committedAt !== 'string') continue;
			map[id] = {
				guesses: record.guesses.filter((guess): guess is string => typeof guess === 'string'),
				committedAt: record.committedAt
			};
		}
		return map;
	} catch {
		return {};
	}
}

class PredictionStore {
	#records = $state<PredictionMap>(readStored());

	get(id: string): PredictionRecord | undefined {
		return this.#records[id];
	}

	isCommitted(id: string): boolean {
		return Boolean(this.#records[id]);
	}

	commit(id: string, guesses: string[]): void {
		this.#records = {
			...this.#records,
			[id]: { guesses: guesses.map((guess) => guess.trim()), committedAt: new Date().toISOString() }
		};
		this.#persist();
	}

	/** Forget a commitment so the learner can predict again from scratch. */
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

	#persist(): void {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#records));
		} catch {
			/* quota or private-mode failure: in-memory state still works */
		}
	}
}

export const predictions = new PredictionStore();
