import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 9 exercises: pointers, address-of, dereference and pointer walk.
 * The MDX spreads each record into `<ExerciseCard>`; keeping the C source here
 * means blank lines survive and every solution can be compiled by the verify
 * script.
 */

export const vaultTransfer: HandbookExercise = {
	id: 'hb-09-vault-transfer',
	concept: 'dereferencing pointers to modify variables',
	prompt:
		'Declare two integers, savingsBox = 40000 and currentBox = 12000, and two pointers, fromSlip pointing at savingsBox and toSlip pointing at currentBox. Using only *fromSlip and *toSlip after the pointers are set, transfer 8500 pence from the savings box to the current box, then print the final values of savingsBox and currentBox. Print the before and after states exactly as the expected output shows.',
	hints: [
		'Set both pointers with the address-of operator before you print anything.',
		'Subtract the transfer amount through *fromSlip and add it through *toSlip; never name the integers again after the pointers are ready.',
		'Print savingsBox and currentBox by name at the end — reading them proves the writes landed in the real boxes.',
		'Keep the two label lines separate: the transfer line ends with a colon, and the final values are printed on the next line.'
	],
	expectedStdout: `Before transfer: savings = 40000p, current = 12000p
After *fromSlip -> *toSlip transfer of 8500p:
savingsBox = 31500p, currentBox = 20500p
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    int savingsBox = 40000;
    int currentBox = 12000;

    // TODO: point fromSlip at savingsBox and toSlip at currentBox.

    // TODO: print the "Before transfer" line.

    // TODO: move 8500 pence through the two pointers only.

    // TODO: print the transfer line and the final values.

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int savingsBox = 40000;
    int currentBox = 12000;

    int *fromSlip = &savingsBox;
    int *toSlip = &currentBox;

    printf("Before transfer: savings = %dp, current = %dp\\n",
           savingsBox, currentBox);

    int transferPence = 8500;
    *fromSlip -= transferPence;
    *toSlip += transferPence;

    printf("After *fromSlip -> *toSlip transfer of %dp:\\n", transferPence);
    printf("savingsBox = %dp, currentBox = %dp\\n", savingsBox, currentBox);

    return 0;
}`
};

export const squadPointerWalk: HandbookExercise = {
	id: 'hb-09-squad-pointer-walk',
	concept: 'pointer walk over an array',
	prompt:
		'Given int shirtNumbers[5] = {1, 4, 6, 9, 10}; declare a pointer const int *runner = shirtNumbers; and a limit const int *end = shirtNumbers + 5;. Write a while (runner < end) loop that uses only pointer dereferencing (*runner) and pointer increment (runner++) — no square brackets anywhere in the loop — to print every shirt number and add it to a running sum. Print the numbers on one line, then the sum on the next, exactly as the expected output shows.',
	hints: [
		'An array name is already a pointer to its first element, so runner starts at shirtNumbers.',
		'shirtNumbers + 5 is one past the last element — a legal address to compare against, but never to dereference.',
		'Print the leading label once, before the loop, then each number with a leading space and a hash sign.',
		'Add *runner to the sum before you call runner++, or you will skip the first shirt.'
	],
	expectedStdout: `Squad numbers via pointer walk: #1 #4 #6 #9 #10
Sum of shirt numbers: 30
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    int shirtNumbers[5] = {1, 4, 6, 9, 10};

    // TODO: start runner at the first element and end one past the last.
    int sum = 0;

    // TODO: walk the row with *runner and runner++ only, printing each number.

    // TODO: print the sum.

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int shirtNumbers[5] = {1, 4, 6, 9, 10};
    const int *runner = shirtNumbers;
    const int *end = shirtNumbers + 5;
    int sum = 0;

    printf("Squad numbers via pointer walk:");
    while (runner < end) {
        printf(" #%d", *runner);
        sum += *runner;
        runner++;
    }
    printf("\\nSum of shirt numbers: %d\\n", sum);

    return 0;
}`
};

export const richestAccount: HandbookExercise = {
	id: 'hb-09-richest-account',
	concept: 'pointer difference and indirect updates',
	prompt:
		'Given int balancesPence[4] = {18000, 95000, 42000, 61000}; create int *richestSlip = &balancesPence[0];. Loop over the array and, whenever balancesPence[i] is greater than *richestSlip, update richestSlip = &balancesPence[i];. Then deduct a 500p wealth management fee through *richestSlip -= 500; and print the index that was updated (richestSlip - balancesPence) with the highest balance found, followed by the new balance at that index, exactly as the expected output shows.',
	hints: [
		'richestSlip must start by pointing at element 0, then move to whichever element holds the largest value.',
		'Compare against *richestSlip, not against the array index; the pointer is your running best.',
		'Subtracting two pointers into the same array yields a ptrdiff_t, which you print with %td.',
		'Deduct the fee before you print the new balance, and read the balance back through the array to prove the write landed there.'
	],
	expectedStdout: `Highest balance found at index 1: 95000 pence
After 500p fee via *richestSlip, balancesPence[1] = 94500 pence
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>
#include <stddef.h>

int main(void) {
    int balancesPence[4] = {18000, 95000, 42000, 61000};
    int *richestSlip = &balancesPence[0];

    // TODO: loop over the array and repoint richestSlip at the largest balance.

    // TODO: compute the winning index with pointer difference.

    // TODO: print the index and value, deduct the 500p fee, print the new balance.

    return 0;
}`,
	solution: `#include <stdio.h>
#include <stddef.h>

int main(void) {
    int balancesPence[4] = {18000, 95000, 42000, 61000};
    int *richestSlip = &balancesPence[0];

    for (size_t i = 1; i < 4; i++) {
        if (balancesPence[i] > *richestSlip) {
            richestSlip = &balancesPence[i];
        }
    }

    ptrdiff_t index = richestSlip - balancesPence;
    printf("Highest balance found at index %td: %d pence\\n",
           index, *richestSlip);

    *richestSlip -= 500;
    printf("After 500p fee via *richestSlip, balancesPence[%td] = %d pence\\n",
           index, balancesPence[index]);

    return 0;
}`
};