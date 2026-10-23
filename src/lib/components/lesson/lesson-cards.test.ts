// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/svelte';
import QuizCard from './QuizCard.svelte';
import PredictCard from './PredictCard.svelte';
import { assessments } from '$lib/stores/assessments.svelte';
import { predictions } from '$lib/stores/predictions.svelte';

const options = ['The right one is here', 'Wrong b', 'Wrong c', 'Wrong d'];

function labels(container: HTMLElement): string[] {
	return [...container.querySelectorAll('label')].map((label) => label.textContent?.trim() ?? '');
}

afterEach(() => cleanup());

beforeEach(() => {
	assessments.clearAll();
	predictions.clearAll();
});

describe('QuizCard', () => {
	it('shuffles deterministically and keeps every option', () => {
		const props = { id: 'shuffle-q', question: 'Q?', options, answer: 0, explanation: 'Because.' };
		const first = labels(render(QuizCard, { props }).container);
		cleanup();
		const second = labels(render(QuizCard, { props }).container);
		expect(first).toEqual(second);
		expect([...first].sort()).toEqual([...options].sort());
	});

	it('can be asked again after being solved', async () => {
		const { container } = render(QuizCard, {
			props: { id: 'retry-q', question: 'Q?', options, answer: 0, explanation: 'Because.' }
		});
		const getByText = within(container).getByText;
		const radios = [...container.querySelectorAll('input[type=radio]')] as HTMLInputElement[];
		const correct = radios.find((radio) => radio.value === '0') as HTMLInputElement;
		await fireEvent.click(correct);
		await fireEvent.click(getByText('Check answer'));
		expect(assessments.isSolved('retry-q')).toBe(true);
		await fireEvent.click(getByText('Ask me again'));
		const again = [...container.querySelectorAll('input[type=radio]')] as HTMLInputElement[];
		expect(again.every((radio) => !radio.disabled && !radio.checked)).toBe(true);
		const wrong = again.find((radio) => radio.value === '1') as HTMLInputElement;
		await fireEvent.click(wrong);
		await fireEvent.click(getByText('Check answer'));
		expect(assessments.streak('retry-q')).toBe(0);
		expect(assessments.attempts('retry-q')).toBe(2);
	});
});

describe('PredictCard', () => {
	const props = {
		id: 'predict-test',
		questions: ['What prints?', 'Why?'],
		answers: ['The secret `42`', 'Because **reasons**']
	};

	it('keeps the model answers out of the DOM until the prediction is committed', async () => {
		const { container } = render(PredictCard, { props });
		const { getByText, queryByText } = within(container);
		expect(container.textContent).not.toContain('42');
		expect(container.textContent).not.toContain('reasons');
		const commit = getByText('Commit prediction').closest('button') as HTMLButtonElement;
		expect(commit.disabled).toBe(true);

		const boxes = [...container.querySelectorAll('textarea')];
		await fireEvent.input(boxes[0] as HTMLTextAreaElement, { target: { value: 'forty' } });
		expect(commit.disabled).toBe(true);
		await fireEvent.input(boxes[1] as HTMLTextAreaElement, { target: { value: 'no idea' } });
		expect(commit.disabled).toBe(false);

		await fireEvent.click(commit);
		expect(predictions.isCommitted('predict-test')).toBe(true);
		expect(container.textContent).toContain('42');
		expect(container.textContent).toContain('forty');
		expect(queryByText('Commit prediction')).toBeNull();
	});
});
