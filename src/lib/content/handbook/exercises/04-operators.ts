import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 4 exercises. Handbook MDX spreads each record into `<ExerciseCard>`.
 * Keeping the C source here (not in MDX attributes) means blank lines survive,
 * the editor receives an exact program, and the data is type-checked.
 */

export const coinDispenser: HandbookExercise = {
	id: 'hb-04-coin-dispenser',
	concept: 'integer division and modulo',
	prompt:
		'A self-checkout till must dispense 387 pence (£3.87) in change using the fewest UK coins possible: £2 (200 pence), £1 (100 pence), 50p, 20p, 10p, 5p, 2p and 1p. Write a complete C17 program that uses `/` and `%` (or `%=`) to work out how many of each coin are dispensed, then prints the receipt exactly as shown in the expected output — the header line with the amount in pounds and two-digit pence, then one line per denomination, with every count starting in the same column. Cover every denomination from 200 pence down to 1 pence, even when the count is zero.',
	hints: [
		'Work down from the largest coin. For each denomination, the count is what is left divided by that value, and the new remainder is what is left modulo that value.',
		'Modulo assignment is the tidiest way to carry the remainder forward: after taking the 200p coins, write `remaining %= 200;` before moving to 100p.',
		'The last coin needs no division: once every larger denomination has been taken out, whatever remains is the number of 1p coins.',
		'Count the padding in the expected output. Labels are shorter than the numbers column, so some lines need two spaces after the colon and some need one.'
	],
	expectedStdout: `Change for 387 pence (£3.87):
£2 coins:  1
£1 coins:  1
50p coins: 1
20p coins: 1
10p coins: 1
5p coins:  1
2p coins:  1
1p coins:  0`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    // TODO: store 387 pence in an int, plus a running remainder.

    // TODO: work down from 200 pence to 1 pence with / and %, keeping a
    // count for each denomination and taking it out of the remainder.

    // TODO: print the header, then one line per denomination with the
    // counts aligned in a single column.

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int amountPence = 387;
    int remaining = amountPence;

    int coins200 = remaining / 200; remaining %= 200;
    int coins100 = remaining / 100; remaining %= 100;
    int coins50  = remaining / 50;  remaining %= 50;
    int coins20  = remaining / 20;  remaining %= 20;
    int coins10  = remaining / 10;  remaining %= 10;
    int coins5   = remaining / 5;   remaining %= 5;
    int coins2   = remaining / 2;   remaining %= 2;
    int coins1   = remaining;

    printf("Change for %d pence (£%d.%02d):\\n",
           amountPence, amountPence / 100, amountPence % 100);
    printf("£2 coins:  %d\\n", coins200);
    printf("£1 coins:  %d\\n", coins100);
    printf("50p coins: %d\\n", coins50);
    printf("20p coins: %d\\n", coins20);
    printf("10p coins: %d\\n", coins10);
    printf("5p coins:  %d\\n", coins5);
    printf("2p coins:  %d\\n", coins2);
    printf("1p coins:  %d\\n", coins1);

    return 0;
}`
};

export const strikeRate: HandbookExercise = {
	id: 'hb-04-strike-rate',
	concept: 'casting and the ternary operator',
	prompt:
		'Striker Leo Vance played 1665 minutes across 19 appearances for Rovers FC and scored 12 goals. Write a complete C17 program that prints three facts: how many full 90-minute matches those minutes contain and how many minutes are left over; why integer division of 12 by 19 reports 0 goals per game while the true double average reports 0.63; and whether Leo makes the Golden Boot shortlist, decided by `goals >= 10 && appearances >= 15` with a ternary printing `YES` or `NO`. Print the four lines exactly as shown in the expected output, padding the shorter labels so all four values start in the same column, and use a cast so the true average is computed in floating point rather than after the truncation.',
	hints: [
		'Minutes divide by 90 the same way players divide into teams: the quotient is whole matches and the remainder is the leftover minutes.',
		'The 0 goals per game line is not a bug in your program — it is the integer division of goals by appearances, printed with %d.',
		'Cast one operand before dividing: `(double)goals / appearances` converts the numerator first, so the division itself happens in floating point.',
		'A ternary is an expression, so it can sit directly inside a printf argument: `shortlisted ? "YES" : "NO"` with %s prints the word.'
	],
	expectedStdout: `Playing time: 1665 mins (18 full 90-min matches + 45 mins)
Integer division trap (12 / 19): 0 goals/game
True strike rate:                0.63 goals/game
Golden Boot shortlist:           YES`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    // TODO: store the minutes, appearances and goals as int variables.

    // TODO: compute full matches and leftover minutes with / and %.
    // TODO: compute the integer average and the cast double average.
    // TODO: compute the shortlist condition with &&.

    // TODO: print the four aligned lines, using a ternary for YES or NO.

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int minutes = 1665;
    int appearances = 19;
    int goals = 12;

    int fullMatches = minutes / 90;
    int extraMinutes = minutes % 90;
    int wrongAvg = goals / appearances;
    double trueAvg = (double)goals / appearances;
    int shortlisted = (goals >= 10) && (appearances >= 15);

    printf("Playing time: %d mins (%d full 90-min matches + %d mins)\\n",
           minutes, fullMatches, extraMinutes);
    printf("Integer division trap (%d / %d): %d goals/game\\n",
           goals, appearances, wrongAvg);
    printf("True strike rate:                %.2f goals/game\\n", trueAvg);
    printf("Golden Boot shortlist:           %s\\n",
           shortlisted ? "YES" : "NO");

    return 0;
}`
};

export const shortCircuitGuard: HandbookExercise = {
	id: 'hb-04-short-circuit-guard',
	concept: 'short-circuit evaluation',
	prompt:
		'The program below is supposed to check whether the average transaction exceeds 5000 pence, first for a customer with no transactions and then for one with 4 transactions totalling 24000 pence. It divides before it checks, so the first test case divides by zero: undefined behaviour, and a trap in the app\'s WebAssembly runtime. Repair both conditions so that `transactions > 0` is tested first and `&&` short-circuits away the division when there are no transactions, then confirm both lines print without a crash. In a comment above the fixed condition, state in one sentence why the guarded version can never divide by zero.',
	hints: [
		'Run it first and watch where it stops: the trouble is in the very first condition, before anything has been printed.',
		'`&&` is lazy. If the left-hand side is false it never evaluates the right-hand side at all, so the division can simply not happen.',
		'Put `transactions > 0` on the left of the `&&` and the division comparison on the right, keeping the whole condition inside parentheses as one operand.',
		'Both conditions follow the same shape, so the second one needs the same guard even though 4 transactions happens to work without it.'
	],
	expectedStdout: `With 0 transactions -> high spender? 0 (safe, no crash!)
With 4 transactions (24000p) -> high spender? 1`,
	expectedExitCode: 0,
	starter: `// Broken code: the guard is missing, so the first test divides by zero.
#include <stdio.h>

int main(void) {
    int transactions = 0;
    int totalSpentPence = 0;

    int highSpenderZero = (totalSpentPence / transactions > 5000);
    printf("With 0 transactions -> high spender? %d (safe, no crash!)\\n",
           highSpenderZero);

    transactions = 4;
    totalSpentPence = 24000;
    int highSpenderFour = (totalSpentPence / transactions > 5000);
    printf("With 4 transactions (24000p) -> high spender? %d\\n",
           highSpenderFour);

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int transactions = 0;
    int totalSpentPence = 0;

    // Because transactions > 0 is false (0), && short-circuits and NEVER
    // evaluates (totalSpentPence / transactions), avoiding division by zero!
    int highSpenderZero = (transactions > 0) &&
                          (totalSpentPence / transactions > 5000);
    printf("With 0 transactions -> high spender? %d (safe, no crash!)\\n",
           highSpenderZero);

    transactions = 4;
    totalSpentPence = 24000;
    int highSpenderFour = (transactions > 0) &&
                          (totalSpentPence / transactions > 5000);
    printf("With 4 transactions (24000p) -> high spender? %d\\n",
           highSpenderFour);

    return 0;
}`
};