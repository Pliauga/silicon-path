import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 1 exercises. Handbook MDX spreads each record into `<ExerciseCard>`.
 * Keeping the C source here (not in MDX attributes) means blank lines survive,
 * the editor receives an exact program, and the data is type-checked.
 */

export const savingsReceipt: HandbookExercise = {
	id: 'hb-01-savings-receipt',
	concept: 'printf and format specifiers',
	prompt:
		"Write a complete C17 program that stores three integer variables for a saver's opening balance (8500 pence), a cash deposit (3250 pence), and a monthly bonus (150 pence), plus a character variable for the branch code ('N'). Print a formatted receipt showing the branch, each amount in pence, and the combined closing balance.",
	hints: [
		'Receipt lines line up in columns — copy the spacing from the expected output exactly.',
		'Compute the closing balance once, with +, before printing it.',
		'Print the branch with %c and each pence amount with %d.'
	],
	expectedStdout: `Branch: N
Opening balance: 8500 pence
Deposit:         3250 pence
Bonus:           150 pence
Closing balance: 11900 pence`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    // TODO: declare the branch code and the three pence amounts.

    // TODO: compute the closing balance and print the receipt.

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    char branch = 'N';
    int openingPence = 8500;
    int depositPence = 3250;
    int bonusPence = 150;
    int closingPence = openingPence + depositPence + bonusPence;

    printf("Branch: %c\\n", branch);
    printf("Opening balance: %d pence\\n", openingPence);
    printf("Deposit:         %d pence\\n", depositPence);
    printf("Bonus:           %d pence\\n", bonusPence);
    printf("Closing balance: %d pence\\n", closingPence);

    return 0;
}`
};

export const attendanceBoard: HandbookExercise = {
	id: 'hb-01-attendance-board',
	concept: 'printf with several integer fields',
	prompt:
		"Write a complete C17 program for Rovers FC that stores the home stand attendance (14200), away stand attendance (1850), hospitality box attendance (450), and pitch zone code ('W'). Print each stand's attendance and the total stadium attendance.",
	hints: [
		'The total is the sum of the three attendance fields.',
		'Use a char for the zone and %c to print it.',
		"Keep the expected output's spacing: some labels are padded so the numbers align."
	],
	expectedStdout: `Pitch Zone: W
Home stand:  14200 supporters
Away stand:  1850 supporters
Hospitality: 450 supporters
Total crowd: 16500 supporters`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    // TODO: declare the zone code and the three attendance counts.

    // TODO: compute the total crowd and print the board.

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    char zone = 'W';
    int homeStand = 14200;
    int awayStand = 1850;
    int hospitality = 450;
    int totalCrowd = homeStand + awayStand + hospitality;

    printf("Pitch Zone: %c\\n", zone);
    printf("Home stand:  %d supporters\\n", homeStand);
    printf("Away stand:  %d supporters\\n", awayStand);
    printf("Hospitality: %d supporters\\n", hospitality);
    printf("Total crowd: %d supporters\\n", totalCrowd);

    return 0;
}`
};

export const fourBugs: HandbookExercise = {
	id: 'hb-01-four-bugs',
	concept: 'reading compiler diagnostics',
	prompt:
		'The program below is supposed to print a savings summary for Maya Lin, but it contains four beginner bugs: syntax and format-specifier errors. Fix all four so it compiles with zero warnings under cc -std=c17 -Wall -Wextra -Wpedantic.',
	hints: [
		'Start at the first error and fix only that; the later errors may disappear on their own.',
		'A char holds one character. Double quotes create a string, which is a different type.',
		'Check every format specifier against the type of the argument it prints.',
		'Inside a printf format string, a literal percent sign must be written as two percent signs.'
	],
	expectedStdout: `Account #704 (Status A)
Savings: 45000 pence (100% protected)`,
	expectedExitCode: 0,
	starter: `// Broken code: find all four bugs.
#include <stdio.h>

int main(void) {
    int accountId = 704
    int savingsPence = 45000;
    char status = "A";

    printf("Account #%s (Status %c)\\n", accountId, status);
    printf("Savings: %d pence (100% protected)\\n", savingsPence);
    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int accountId = 704;
    int savingsPence = 45000;
    char status = 'A';

    printf("Account #%d (Status %c)\\n", accountId, status);
    printf("Savings: %d pence (100%% protected)\\n", savingsPence);
    return 0;
}`
};