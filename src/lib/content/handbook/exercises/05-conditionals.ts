import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 5 exercises. Handbook MDX spreads each record into `<ExerciseCard>`.
 * Every solution compiles under cc -std=c11 -Wall -Wextra -Werror and writes
 * the same stdout the chapter promises, so the grader's diff is exact.
 */

export const saverTiers: HandbookExercise = {
	id: 'hb-05-saver-tiers',
	concept: 'if / else if / else ladders and switch',
	prompt:
		"Write a complete C17 program for High Street Bank that stores a saver's balance of 620000 pence (£6,200.00) and an account code of 'G' for Gold. Print the balance in pence and in pounds, then use an if / else if / else ladder to classify it: a balance below 0 prints Status: Overdrawn (charge 500p fee); a balance below 100000 prints Status: Starter saver (1% bonus); a balance up to and including 500000 prints Status: Regular saver (3% bonus); anything larger prints Status: Premier saver (5% bonus). Finally, switch on the account code to print the monthly perk: 'G' gives Free travel insurance, 'S' gives No foreign ATM fees, 'B' gives Standard debit card, and any other character gives Unknown tier.",
	hints: [
		'Work top to bottom: print the balance line first, then run the ladder, then print the perk line.',
		'The ladder branches are ordered, so each one only needs to test one edge of its band. The earlier branches have already ruled out everything smaller.',
		'Format money as pounds and pence with %d.%02d, passing the pence amount, the whole pounds, and the remainder.',
		'A percent sign inside a printf format string must be written twice. A switch needs a break after every case and after default.'
	],
	expectedStdout: `Balance: 620000 pence (£6200.00)
Status: Premier saver (5% bonus)
Tier 'G' perk: Free travel insurance`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    // TODO: declare balancePence and accountCode.

    // TODO: print the balance line, pounds then pence.

    // TODO: classify the balance with if / else if / else.

    // TODO: print the perk with a switch on accountCode.

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int balancePence = 620000;
    char accountCode = 'G';

    printf("Balance: %d pence (£%d.%02d)\\n",
           balancePence, balancePence / 100, balancePence % 100);

    if (balancePence < 0) {
        printf("Status: Overdrawn (charge 500p fee)\\n");
    } else if (balancePence < 100000) {
        printf("Status: Starter saver (1%% bonus)\\n");
    } else if (balancePence <= 500000) {
        printf("Status: Regular saver (3%% bonus)\\n");
    } else {
        printf("Status: Premier saver (5%% bonus)\\n");
    }

    printf("Tier '%c' perk: ", accountCode);
    switch (accountCode) {
        case 'G':
            printf("Free travel insurance\\n");
            break;
        case 'S':
            printf("No foreign ATM fees\\n");
            break;
        case 'B':
            printf("Standard debit card\\n");
            break;
        default:
            printf("Unknown tier\\n");
            break;
    }

    return 0;
}`
};

export const matchPoints: HandbookExercise = {
	id: 'hb-05-match-points',
	concept: 'ternary selection and switch on a char',
	prompt:
		"Write a complete C17 program for Rovers FC. Store homeGoals = 2, awayGoals = 2 and a ticket category of 'C'. Print the scoreline as Rovers 2 - 2 Athletic. Then use if / else if / else to print the result: a home win prints Result: Home Win (3 pts), a draw prints Result: Draw (1 pt), and an away win prints Result: Away Win (0 pts). Store the league points in an int using the ternary operator and print them as Points added to table: 1. Finally, switch on the ticket category to find the price in pence — 'A' is 3000, 'C' is 1500, 'J' is 800 — and print it with the pounds and pence, for example 1500 pence (£15.00).",
	hints: [
		'There are three decisions to make: the result text, the points, and the ticket price. Keep them in that order.',
		'The ternary can be nested once: home win gives 3, a draw gives 1, and the remaining case gives 0.',
		'Store the price into an int inside the switch, then print it once after the switch has finished, so the output line lives in a single printf.',
		'A char case label uses single quotes, and a missing break would make every category fall through to the next price.'
	],
	expectedStdout: `Scoreline: Rovers 2 - 2 Athletic
Result: Draw (1 pt)
Points added to table: 1
Category 'C' ticket price: 1500 pence (£15.00)`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    // TODO: declare homeGoals, awayGoals and ticketCategory.

    // TODO: print the scoreline.

    // TODO: print the result with if / else if / else.

    // TODO: choose the points with the ternary operator and print them.

    // TODO: look up the ticket price with switch and print it.

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int homeGoals = 2;
    int awayGoals = 2;
    char ticketCategory = 'C';

    printf("Scoreline: Rovers %d - %d Athletic\\n", homeGoals, awayGoals);

    if (homeGoals > awayGoals) {
        printf("Result: Home Win (3 pts)\\n");
    } else if (homeGoals == awayGoals) {
        printf("Result: Draw (1 pt)\\n");
    } else {
        printf("Result: Away Win (0 pts)\\n");
    }

    int pointsEarned = (homeGoals > awayGoals) ? 3 : ((homeGoals == awayGoals) ? 1 : 0);
    printf("Points added to table: %d\\n", pointsEarned);

    int pricePence = 0;
    switch (ticketCategory) {
        case 'A':
            pricePence = 3000;
            break;
        case 'C':
            pricePence = 1500;
            break;
        case 'J':
            pricePence = 800;
            break;
        default:
            pricePence = 0;
            break;
    }
    printf("Category '%c' ticket price: %d pence (£%d.%02d)\\n",
           ticketCategory, pricePence, pricePence / 100, pricePence % 100);

    return 0;
}`
};

export const conditionalBugs: HandbookExercise = {
	id: 'hb-05-conditional-bugs',
	concept: 'conditional bug hunting',
	prompt:
		'The ATM security program below contains four classic conditional bugs: an assignment where a comparison belongs, a chained inequality, a stray semicolon, and a missing break. The entered PIN is 4321 while the correct PIN is 1234, the withdrawal is 25000 pence, and the menu option is 1. Fix all four bugs so the PIN check rejects the customer, the range check reports that the withdrawal is outside the ten to two hundred pound band, and only Option 1 runs. Print nothing else, and keep every existing message exactly as written.',
	hints: [
		'Read the four suspicious lines in order. Each one is a different mistake, so fixing one will not hide the others.',
		'Inside a condition you want a question, not an order: which operator asks about a value instead of storing one?',
		'A comparison in C produces 0 or 1, so chaining two of them together compares the first result with the second limit. Join the two halves with a logical and instead.',
		'A semicolon directly after the closing parenthesis ends the if statement on the spot, and a case without a break continues into the next case.'
	],
	expectedStdout: `PIN rejected!
Withdrawal 25000 pence is outside £10-£200 range
Option 1: Check balance`,
	expectedExitCode: 0,
	starter: `// Broken code — find all 4 conditional bugs!
#include <stdio.h>

int main(void) {
    int enteredPin = 4321;
    int withdrawalPence = 25000;
    int option = 1;

    if (enteredPin = 1234) {
        printf("PIN accepted!\\n");
    } else {
        printf("PIN rejected!\\n");
    }

    if (1000 <= withdrawalPence <= 20000);
        printf("Withdrawal is between £10 and £200\\n");

    switch (option) {
        case 1:
            printf("Option 1: Check balance\\n");
        case 2:
            printf("Option 2: Close account!\\n");
            break;
    }
    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int enteredPin = 4321;
    int withdrawalPence = 25000;
    int option = 1;

    if (enteredPin == 1234) {
        printf("PIN accepted!\\n");
    } else {
        printf("PIN rejected!\\n");
    }

    if (withdrawalPence >= 1000 && withdrawalPence <= 20000) {
        printf("Withdrawal is between £10 and £200\\n");
    } else {
        printf("Withdrawal %d pence is outside £10-£200 range\\n", withdrawalPence);
    }

    switch (option) {
        case 1:
            printf("Option 1: Check balance\\n");
            break;
        case 2:
            printf("Option 2: Close account!\\n");
            break;
        default:
            break;
    }
    return 0;
}`
};