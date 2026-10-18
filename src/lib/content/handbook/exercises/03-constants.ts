import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 3 exercises. Handbook MDX spreads each record into `<ExerciseCard>`.
 * Keeping the C source here (not in MDX attributes) means blank lines survive,
 * the editor receives an exact program, and the data is type-checked.
 */

export const atmFeeCalculator: HandbookExercise = {
	id: 'hb-03-atm-fee-calculator',
	concept: 'const and #define constants',
	prompt:
		'Rewrite the ATM fee calculation so that it contains no magic numbers. Define the macro DAILY_WITHDRAWAL_LIMIT_PENCE with the value 30000 (three hundred pounds), then declare two const int variables inside main: FOREIGN_FEE_PENCE = 150 (one pound fifty) and CARD_REPLACEMENT_PENCE = 500 (five pounds). A customer withdraws 12000 pence abroad and orders a replacement card; compute the total deducted from the account and how much of the daily withdrawal limit remains, so that the six receipt lines match the expected output exactly.',
	hints: [
		'The withdrawal limit is a macro; the two fees are typed read-only variables declared inside main.',
		'The total debit adds the cash and both fees; the remaining limit subtracts only the cash.',
		'The labels are padded so the numbers line up in one column; copy the spacing from the expected output character for character.',
		'Print the limit using the macro name itself, never a copied literal.'
	],
	expectedStdout: `Daily withdrawal limit: 30000 pence
Cash withdrawn:         12000 pence
Foreign ATM fee:        150 pence
Card replacement fee:   500 pence
Total account debit:    12650 pence
Remaining daily limit:  18000 pence
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

#define DAILY_WITHDRAWAL_LIMIT_PENCE 30000

int main(void) {
    // TODO: declare the foreign ATM fee (150 pence) and the card replacement
    // fee (500 pence) as const int values.

    // TODO: record the 12000 pence withdrawal, then compute the total account
    // debit and the remaining daily limit.

    // TODO: print the six receipt lines, aligned as in the expected output.

    return 0;
}`,
	solution: `#include <stdio.h>

#define DAILY_WITHDRAWAL_LIMIT_PENCE 30000

int main(void) {
    const int FOREIGN_FEE_PENCE = 150;
    const int CARD_REPLACEMENT_PENCE = 500;

    int withdrawalPence = 12000;
    int totalDebitPence = withdrawalPence + FOREIGN_FEE_PENCE + CARD_REPLACEMENT_PENCE;
    int remainingLimitPence = DAILY_WITHDRAWAL_LIMIT_PENCE - withdrawalPence;

    printf("Daily withdrawal limit: %d pence\\n", DAILY_WITHDRAWAL_LIMIT_PENCE);
    printf("Cash withdrawn:         %d pence\\n", withdrawalPence);
    printf("Foreign ATM fee:        %d pence\\n", FOREIGN_FEE_PENCE);
    printf("Card replacement fee:   %d pence\\n", CARD_REPLACEMENT_PENCE);
    printf("Total account debit:    %d pence\\n", totalDebitPence);
    printf("Remaining daily limit:  %d pence\\n", remainingLimitPence);

    return 0;
}`
};

export const leaguePointsAudit: HandbookExercise = {
	id: 'hb-03-league-points-audit',
	concept: 'named constants in arithmetic',
	prompt:
		'Use #define to set POINTS_PER_WIN to 3 and POINTS_PER_DRAW to 1. Inside main, declare const int PITCH_LENGTH_M = 105; and const int PITCH_WIDTH_M = 68;. For Rovers FC, with 18 wins and 7 draws, print the pitch area in square metres and the club total league points without using a single magic number in the calculations, matching the expected output exactly.',
	hints: [
		'The pitch area is length times width, and both are already named for you.',
		'A win is worth POINTS_PER_WIN and a draw is worth POINTS_PER_DRAW: multiply each count, then add the two products.',
		'Only the win and draw counts themselves may be literals; every scoring value must come from a macro.',
		'The area line quotes the dimensions again, so print the constants rather than repeating 105 and 68 in the format string.'
	],
	expectedStdout: `Rovers home pitch area: 7140 sq metres (105m x 68m)
Record: 18 wins, 7 draws
Total league points: 61
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

#define POINTS_PER_WIN 3
#define POINTS_PER_DRAW 1

int main(void) {
    // TODO: declare the pitch length (105) and width (68) as const int values.

    // TODO: compute the pitch area, and the league points from 18 wins and
    // 7 draws, using only the named constants.

    // TODO: print the three lines shown in the expected output.

    return 0;
}`,
	solution: `#include <stdio.h>

#define POINTS_PER_WIN 3
#define POINTS_PER_DRAW 1

int main(void) {
    const int PITCH_LENGTH_M = 105;
    const int PITCH_WIDTH_M = 68;

    int pitchArea = PITCH_LENGTH_M * PITCH_WIDTH_M;
    int wins = 18;
    int draws = 7;
    int totalPoints = (wins * POINTS_PER_WIN) + (draws * POINTS_PER_DRAW);

    printf("Rovers home pitch area: %d sq metres (%dm x %dm)\\n",
           pitchArea, PITCH_LENGTH_M, PITCH_WIDTH_M);
    printf("Record: %d wins, %d draws\\n", wins, draws);
    printf("Total league points: %d\\n", totalPoints);

    return 0;
}`
};

export const brokenMacro: HandbookExercise = {
	id: 'hb-03-broken-macro',
	concept: 'diagnosing const and #define mistakes',
	prompt:
		'The program below is supposed to print a savings total with a bonus, but it will not compile: three separate mistakes involve #define and const. Find and fix all three so that it builds cleanly with cc -std=c11 -Wall -Wextra -Werror and prints the total followed by the address of a real object.',
	hints: [
		'Fix the first error you are shown, then recompile; the later messages may be consequences of it.',
		'A #define is search-and-replace, so it takes a value — never an equals sign and never a semicolon.',
		'A const must receive its value on the same line as its declaration; it can never be assigned afterwards.',
		'You can only take the address of something that exists in memory. Ask which of the two names is a real object and which is only text.'
	],
	starter: `// Broken code — fix the 3 constant bugs!
#include <stdio.h>

#define BONUS_PENCE = 500;

int main(void) {
    const int BASE_SAVINGS_PENCE;
    BASE_SAVINGS_PENCE = 10000;

    int totalPence = BASE_SAVINGS_PENCE + BONUS_PENCE;
    printf("Total with bonus: %d pence (bonus address: %p)\\n",
           totalPence, (void *)&BONUS_PENCE);
    return 0;
}`,
	solution: `#include <stdio.h>

#define BONUS_PENCE 500

int main(void) {
    const int BASE_SAVINGS_PENCE = 10000;

    int totalPence = BASE_SAVINGS_PENCE + BONUS_PENCE;
    printf("Total with bonus: %d pence (base address: %p)\\n",
           totalPence, (void *)&BASE_SAVINGS_PENCE);
    return 0;
}`
};