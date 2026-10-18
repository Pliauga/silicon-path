import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 10 exercises: pass-by-value, pointer parameters and recursion.
 * The MDX spreads each record into `<ExerciseCard>`; keeping the C source here
 * means blank lines survive and every solution can be compiled by the verify
 * script.
 */

export const transferPence: HandbookExercise = {
	id: 'hb-10-transfer-pence',
	concept: 'pointer parameters and boolean results',
	prompt:
		'Write a C17 function `bool transferPence(int *fromSlip, int *toSlip, int amountPence)` that moves money between two accounts through pointers. It must first check that `amountPence > 0` and that `*fromSlip >= amountPence`. If both hold, subtract the amount from `*fromSlip`, add it to `*toSlip`, and return `true`; otherwise leave both balances untouched and return `false`. In `main`, start with Leo on 50000p and Maya on 10000p, print the opening balances, attempt a 15000p transfer from Leo to Maya, then attempt a 40000p transfer from Leo to Maya and show that it is declined with both balances unchanged. Match the expected output exactly.',
	hints: [
		'Both balances must be reached through the two pointer parameters; main should still hold the real integers.',
		'Validate before you move anything: check the amount is positive and that the source balance is large enough in the same if statement.',
		'Return true only after both writes have landed, so a declined transfer leaves both boxes exactly as they were.',
		'The second transfer is attempted against the already reduced balance of 35000p, and its line still reads DECLINED.'
	],
	expectedStdout: `Initial: Leo = 50000p, Maya = 10000p
Transfer 15000p: SUCCESS -> Leo = 35000p, Maya = 25000p
Transfer 40000p: DECLINED -> Leo = 35000p, Maya = 25000p
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>
#include <stdbool.h>

// TODO: write the prototype for transferPence() here, then define it below main.

int main(void) {
    // TODO: declare Leo's 50000p account and Maya's 10000p account.

    // TODO: print the "Initial:" line.

    // TODO: attempt the 15000p transfer and print its result line.

    // TODO: attempt the 40000p transfer against the reduced balance and print it.

    return 0;
}`,
	solution: `#include <stdio.h>
#include <stdbool.h>

bool transferPence(int *fromSlip, int *toSlip, int amountPence) {
    if (amountPence <= 0 || *fromSlip < amountPence) {
        return false;
    }
    *fromSlip -= amountPence;
    *toSlip += amountPence;
    return true;
}

int main(void) {
    int leoPence = 50000;
    int mayaPence = 10000;

    printf("Initial: Leo = %dp, Maya = %dp\\n", leoPence, mayaPence);

    bool ok1 = transferPence(&leoPence, &mayaPence, 15000);
    printf("Transfer 15000p: %s -> Leo = %dp, Maya = %dp\\n",
           ok1 ? "SUCCESS" : "DECLINED", leoPence, mayaPence);

    bool ok2 = transferPence(&leoPence, &mayaPence, 40000);
    printf("Transfer 40000p: %s -> Leo = %dp, Maya = %dp\\n",
           ok2 ? "SUCCESS" : "DECLINED", leoPence, mayaPence);

    return 0;
}`
};

export const shirtSwap: HandbookExercise = {
	id: 'hb-10-shirt-swap',
	concept: 'pointer out-parameters',
	prompt:
		'Write two C17 functions. `void swapShirts(int *shirtA, int *shirtB)` swaps two players shirt numbers through pointers. `void getAttendanceStats(const int crowds[], size_t count, int *outMin, int *outMax)` scans an array of match attendances and writes the lowest attendance into `*outMin` and the highest into `*outMax`. In `main`, give Leo shirt 9 and Samira shirt 10, print them, swap, then print them again. Then run the attendance function over the five crowds 14500, 18900, 11200, 16400 and 15800, and print the lowest and highest. Match the expected output exactly, including the double space after the after-swap colon.',
	hints: [
		'The swap needs one temporary local integer; moving the pointed-at values is the same three moves as swapping ordinary variables.',
		'Seed both output values from crowds[0], then start the loop at index 1.',
		'Compare each crowd against the values behind the output pointers, writing back whenever a smaller or larger crowd appears.',
		'Print the shirt numbers and the attendances with %d; the arrow between them is a literal part of the format string.'
	],
	expectedStdout: `Before swap: Leo = #9, Samira = #10
After swap:  Leo = #10, Samira = #9
Attendance across 5 matches -> Lowest: 11200, Highest: 18900
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

// TODO: write the prototypes for swapShirts() and getAttendanceStats() here,
// then define both functions below main.

int main(void) {
    // TODO: declare Leo's shirt (9) and Samira's shirt (10).

    // TODO: print the "Before swap" line, call swapShirts(), then print the
    // "After swap" line.

    // TODO: declare the five attendances as an array.

    // TODO: declare lowest and highest, pass their addresses to
    // getAttendanceStats(), then print the attendance line.

    return 0;
}`,
	solution: `#include <stdio.h>

void swapShirts(int *shirtA, int *shirtB) {
    int temp = *shirtA;
    *shirtA = *shirtB;
    *shirtB = temp;
}

void getAttendanceStats(const int crowds[], size_t count, int *outMin, int *outMax) {
    *outMin = crowds[0];
    *outMax = crowds[0];
    for (size_t i = 1; i < count; i++) {
        if (crowds[i] < *outMin) {
            *outMin = crowds[i];
        }
        if (crowds[i] > *outMax) {
            *outMax = crowds[i];
        }
    }
}

int main(void) {
    int leoShirt = 9;
    int samiraShirt = 10;

    printf("Before swap: Leo = #%d, Samira = #%d\\n", leoShirt, samiraShirt);
    swapShirts(&leoShirt, &samiraShirt);
    printf("After swap:  Leo = #%d, Samira = #%d\\n", leoShirt, samiraShirt);

    int crowds[5] = {14500, 18900, 11200, 16400, 15800};
    int lowest = 0, highest = 0;
    getAttendanceStats(crowds, 5, &lowest, &highest);
    printf("Attendance across 5 matches -> Lowest: %d, Highest: %d\\n",
           lowest, highest);

    return 0;
}`
};

export const knockoutMatches: HandbookExercise = {
	id: 'hb-10-knockout-matches',
	concept: 'recursion and base cases',
	prompt:
		'A recursive function calls itself with a smaller input until it reaches a base case. Write a C17 function `int totalKnockoutMatches(int teams)` where `teams` is a power of two such as 16, and compute recursively how many matches are played in total to crown a winner. The base case: if `teams <= 1`, return `0`. The recursive step: store `teams / 2` in an integer named `matchesThisRound`, then return `matchesThisRound + totalKnockoutMatches(teams / 2)`. Call it once from `main` with `teams = 16`; `main` owns the only print, and the function itself prints nothing. Match the expected output exactly.',
	hints: [
		'Write the base case first and test it on paper with teams equal to 1.',
		'Each round halves the field, so this round contributes teams / 2 matches.',
		'The total is this round plus the total of the smaller tournament, which is the same function called again.',
		'Call the function once from main and let main do the printing; recursion should return numbers, not text.'
	],
	expectedStdout: `16-team knockout cup requires 15 total matches.
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int totalKnockoutMatches(int teams);

int main(void) {
    // TODO: store 16 in an integer named teams.

    // TODO: print the total matches line using one call to the function.

    return 0;
}

// TODO: define totalKnockoutMatches() recursively below main.`,
	solution: `#include <stdio.h>

int totalKnockoutMatches(int teams) {
    if (teams <= 1) {
        return 0;
    }
    int matchesThisRound = teams / 2;
    return matchesThisRound + totalKnockoutMatches(teams / 2);
}

int main(void) {
    int teams = 16;
    printf("%d-team knockout cup requires %d total matches.\\n",
           teams, totalKnockoutMatches(teams));
    return 0;
}`
};