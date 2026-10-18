import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 7 exercises. Handbook MDX spreads each record into `<ExerciseCard>`.
 * Every solution compiles under cc -std=c11 -Wall -Wextra -Werror and writes
 * the same stdout the chapter promises, so the grader's diff is exact.
 */

export const reversedCashflows: HandbookExercise = {
	id: 'hb-07-reversed-cashflows',
	concept: 'in-place traversal with sizeof',
	prompt:
		"One week of daily cashflows in pence is 1500, -400, 2200, -900, 3100 and 800, stored in an int cashflows[6]. Write a complete C17 program that reverses the array in place, swapping cashflows[i] with cashflows[count - 1 - i] for the first half of the array, then prints the reversed values on one line and the net weekly cashflow below them. Print the label Reversed cashflows (pence): followed by each value preceded by a single space, then the net on its own line as a whole number of pence with the pounds and pence in brackets, for example 6300 pence (£63.00).",
	hints: [
		'Compute the element count with sizeof(cashflows) / sizeof(cashflows[0]) before the loop, so the mirror index is always count - 1 - i.',
		'Only the first half needs work: once i reaches count / 2, every pair has already been swapped twice and would be undone.',
		'Park one value in a temporary int before the first assignment, or the value you still need is overwritten.',
		'Accumulate the net in the same loop that prints the values, then split it into pounds and pence with division and remainder.'
	],
	expectedStdout: `Reversed cashflows (pence): 800 3100 -900 2200 -400 1500
Net weekly cashflow: 6300 pence (£63.00)`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    // TODO: declare cashflows[6] with the six pence amounts from the prompt.

    // TODO: compute count, then reverse the array in place using a temp.

    // TODO: print the label and each value, accumulating the net pence.

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int cashflows[6] = {1500, -400, 2200, -900, 3100, 800};
    size_t count = sizeof(cashflows) / sizeof(cashflows[0]);

    for (size_t i = 0; i < count / 2; i++) {
        int temp = cashflows[i];
        cashflows[i] = cashflows[count - 1 - i];
        cashflows[count - 1 - i] = temp;
    }

    int netPence = 0;
    printf("Reversed cashflows (pence):");
    for (size_t i = 0; i < count; i++) {
        printf(" %d", cashflows[i]);
        netPence += cashflows[i];
    }
    printf("\\nNet weekly cashflow: %d pence (£%d.%02d)\\n",
           netPence, netPence / 100, netPence % 100);

    return 0;
}`
};

export const cleanSheets: HandbookExercise = {
	id: 'hb-07-clean-sheets',
	concept: 'parallel arrays and bounds',
	prompt:
		"Rovers FC play six matches. The goals they scored are 1, 2, 3, 0, 0 and 4, stored in an int goalsFor[6], and the goals they conceded are 0, 2, 0, 1, 0 and 3, stored in an int goalsAgainst[6]. Write a complete C17 program that loops through both arrays at once, counts how many clean sheets Rovers kept (matches where goalsAgainst[i] is 0) and how many points they earned across the six matches, scoring 3 for a win, 1 for a draw and 0 for a loss. Print the matches played, the clean sheets kept and the total points earned, each on its own line in that order.",
	hints: [
		'Both arrays are indexed by the same match number, so one loop counter is enough for the pair.',
		'Derive the match count from goalsFor with sizeof rather than typing 6, so the loop length stays honest.',
		'A clean sheet and a result are two separate tests. Count the clean sheet first, then add the points.',
		'Compare goalsFor[i] with goalsAgainst[i] twice: once for the win, once for the draw. If neither holds, it was a loss and nothing is added.'
	],
	expectedStdout: `Matches played: 6
Clean sheets kept: 3
Total points earned: 11`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    // TODO: declare goalsFor[6] and goalsAgainst[6] from the prompt.

    // TODO: derive the match count, then count clean sheets and points.

    // TODO: print matches played, clean sheets kept, total points earned.

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int goalsFor[6]     = {1, 2, 3, 0, 0, 4};
    int goalsAgainst[6] = {0, 2, 0, 1, 0, 3};
    size_t matches = sizeof(goalsFor) / sizeof(goalsFor[0]);

    int cleanSheetCount = 0;
    int points = 0;

    for (size_t i = 0; i < matches; i++) {
        if (goalsAgainst[i] == 0) {
            cleanSheetCount++;
        }
        if (goalsFor[i] > goalsAgainst[i]) {
            points += 3;
        } else if (goalsFor[i] == goalsAgainst[i]) {
            points += 1;
        }
    }

    printf("Matches played: %zu\\n", matches);
    printf("Clean sheets kept: %d\\n", cleanSheetCount);
    printf("Total points earned: %d\\n", points);

    return 0;
}`
};

export const standTotals: HandbookExercise = {
	id: 'hb-07-stand-totals',
	concept: 'row-major 2D traversal',
	prompt:
		"Ticket sales in hundreds fill a 3 by 4 grid across three stadium stands (North, East, South) over four matchdays, stored in an int sales[3][4]. Row 0 is 40, 42, 38, 45; row 1 is 30, 31, 29, 35; row 2 is 25, 28, 27, 30. Write a complete C17 program using nested loops that accumulates each row total and the grand total across all twelve entries. Print one line per stand in the form Stand 0 total: 165, numbered from zero, then a final line Grand total: followed by three spaces and 400 so that number lines up under the stand totals.",
	hints: [
		'The outer loop walks the stands and the inner loop walks the four matchdays within one stand.',
		'Reset the stand total to 0 at the start of each outer iteration, otherwise the totals accumulate into one another.',
		'Add the finished stand total to the grand total after the inner loop ends, not inside it.',
		'Number the stand with the outer index and print it with %zu, and copy the exact spacing of the grand total line from the expected output.'
	],
	expectedStdout: `Stand 0 total: 165
Stand 1 total: 125
Stand 2 total: 110
Grand total:   400`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    // TODO: declare sales[3][4] with the twelve figures from the prompt.

    // TODO: nested loops: a stand total per row, added to a grand total.

    // TODO: print each stand total, then the grand total lined up beneath.

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int sales[3][4] = {
        {40, 42, 38, 45},
        {30, 31, 29, 35},
        {25, 28, 27, 30}
    };

    int grandTotal = 0;
    for (size_t stand = 0; stand < 3; stand++) {
        int standTotal = 0;
        for (size_t day = 0; day < 4; day++) {
            standTotal += sales[stand][day];
        }
        grandTotal += standTotal;
        printf("Stand %zu total: %d\\n", stand, standTotal);
    }
    printf("Grand total:   %d\\n", grandTotal);

    return 0;
}`
};