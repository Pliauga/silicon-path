import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 12 exercises: block scope, stack lifetime and shadowing.
 * The MDX spreads each record into `<ExerciseCard>`; keeping the C source here
 * means blank lines survive and every solution can be compiled by the verify
 * script.
 */

export const shadowedBalance: HandbookExercise = {
	id: 'hb-12-shadowed-balance',
	concept: 'block scope and accidental shadowing',
	prompt:
		'The program below is supposed to add a 2000p bonus and deduct a 300p fee from balancePence, then print the final balance with the tax paid at the end of main. Two scope bugs break it: one declaration hides the outer balancePence, and one variable is declared inside the if block but needed after it. Fix both so the program compiles and prints the expected output.',
	hints: [
		'Compile first and read the error: it names the variable it cannot find after the if statement, and that name is your first clue.',
		'The tax box has to outlive the if block, so declare it in the scope of main, before the condition, and start it at 0.',
		'Look closely at the 12000 line. The type word in front of the name is what creates a second, inner variable; removing it turns the line into an assignment to the outer box.',
		'Keep the order of the arithmetic: the balance becomes 12000, then the 300 tax comes off it, so the printed total is 11700.'
	],
	expectedStdout: `Final balance: 11700 pence (tax paid: 300 pence)
`,
	expectedExitCode: 0,
	starter: `// Broken code: fix the 2 scope bugs.
#include <stdio.h>

int main(void) {
    int balancePence = 10000;

    if (balancePence >= 10000) {
        int balancePence = 12000;   // Bug 1: shadows outer balancePence!
        int taxPence = 300;         // Bug 2: declared inside if-block, needed outside!
        balancePence -= taxPence;
    }

    printf("Final balance: %d pence (tax paid: %d pence)\\n",
           balancePence, taxPence);
    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int balancePence = 10000;
    int taxPence = 0;

    if (balancePence >= 10000) {
        balancePence = 12000;
        taxPence = 300;
        balancePence -= taxPence;
    }

    printf("Final balance: %d pence (tax paid: %d pence)\\n",
           balancePence, taxPence);
    return 0;
}`
};

export const saferPoints: HandbookExercise = {
	id: 'hb-12-safer-points',
	concept: 'caller-owned output parameters',
	prompt:
		'A junior analyst wrote int *badComputePoints(int wins, int draws), which created a local int pts and returned its address, so the pointer dangled the moment the function returned. Rewrite the idea safely as void computePointsSafely(int wins, int draws, int *outPts): main owns the box, the function writes through the pointer. Call it with 14 wins and 6 draws, storing the result in the int roversPts that main already owns, and print the expected output.',
	hints: [
		'The function must not declare a points variable at all: the only place the answer may live is the box main gave it.',
		'Write through the pointer with a dereference: *outPts = (wins * 3) + draws;',
		'In main, declare int roversPts = 0; then pass its address with &roversPts, so the callee and the caller name the same box.',
		'The caller initialises the box and the callee fills it, which is why the printed value survives after the function has returned.'
	],
	expectedStdout: `Rovers (14 wins, 6 draws) safely stored in main's box: 48 points
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

// TODO: define computePointsSafely here. It returns nothing and writes through
// the pointer that main hands it.

int main(void) {
    int roversPts = 0;

    // TODO: call computePointsSafely(14, 6, ...) so it fills roversPts.

    // TODO: print the result line.

    (void)roversPts;
    return 0;
}`,
	solution: `#include <stdio.h>

void computePointsSafely(int wins, int draws, int *outPts) {
    *outPts = (wins * 3) + draws;
}

int main(void) {
    int roversPts = 0;
    computePointsSafely(14, 6, &roversPts);
    printf("Rovers (14 wins, 6 draws) safely stored in main's box: %d points\\n",
           roversPts);
    return 0;
}`
};

export const nestedScopes: HandbookExercise = {
	id: 'hb-12-nested-scopes',
	concept: 'nested scopes and per-iteration lifetime',
	prompt:
		'Predict the exact output of a program with three nested scopes, then write and run it to check your prediction. main holds int total = 100. A for loop runs three rounds, each round declaring its own int bonus equal to (round + 1) * 10; an inner if block then adds that bonus to the total and prints the round. After the loop, main prints the final total. Print the four lines exactly as the expected output shows.',
	hints: [
		'bonus is declared inside the loop body, so it is born at the start of each iteration and destroyed at the closing brace of that same iteration.',
		'total is declared in main, outside the loop, so it keeps every addition across all three rounds.',
		'Work the rounds by hand first: bonus 10 gives 110, bonus 20 gives 130, bonus 30 gives 160.',
		'The final line is printed once, after the loop, by main itself; the round lines are printed from inside the nested block.'
	],
	expectedStdout: `Round 0: inner bonus = 10, running total = 110
Round 1: inner bonus = 20, running total = 130
Round 2: inner bonus = 30, running total = 160
Final outer total: 160
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    int total = 100;

    // TODO: loop round from 0 while round is less than 3.
    //       Inside the loop declare int bonus = (round + 1) * 10;
    //       Inside an inner if block, add bonus to total and print the round line.

    // TODO: print the final total after the loop.

    (void)total;
    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int total = 100;

    for (int round = 0; round < 3; round++) {
        int bonus = (round + 1) * 10;   // created fresh each iteration
        if (bonus > 0) {
            total += bonus;
            printf("Round %d: inner bonus = %d, running total = %d\\n",
                   round, bonus, total);
        }
    }

    printf("Final outer total: %d\\n", total);
    return 0;
}`
};