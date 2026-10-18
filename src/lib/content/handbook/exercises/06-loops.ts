import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 6 exercises. Handbook MDX spreads each record into `<ExerciseCard>`.
 * Every solution compiles under cc -std=c11 -Wall -Wextra -Werror and writes
 * the same stdout the chapter promises, so the grader's diff is exact.
 */

export const loanPayoff: HandbookExercise = {
	id: 'hb-06-loan-payoff',
	concept: 'while loops and a running balance',
	prompt:
		"Leo Vance takes out an interest-free bike loan of 48000 pence (480 pounds) and repays 11000 pence (110 pounds) each month, except in the final month, when he pays only the balance that remains. Write a complete C17 program with a while loop that prints each month's payment and the remaining debt, then a closing line with the month count. Print the debt in pounds and pence, for example 37000p (£370.00).",
	hints: [
		'Loop while any debt remains, and count the month at the top of the loop body so the final count is the number of payments.',
		'Each payment is the full monthly amount unless less than that is left, in which case it is the whole remainder. A ternary keeps that decision in one expression.',
		'Subtract the payment from the debt before printing the line, so the last month prints a remaining debt of 0.',
		'The pounds come from debt / 100 and the pence from debt % 100; the closing line is printed once, after the loop.'
	],
	expectedStdout: `Month 1: paid 11000p | remaining debt: 37000p (£370.00)
Month 2: paid 11000p | remaining debt: 26000p (£260.00)
Month 3: paid 11000p | remaining debt: 15000p (£150.00)
Month 4: paid 11000p | remaining debt: 4000p (£40.00)
Month 5: paid 4000p | remaining debt: 0p (£0.00)
Loan cleared in 5 months!`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    // TODO: declare the starting debt and the fixed monthly payment.

    // TODO: loop while the debt is above zero, paying the full amount
    //       or the remainder in the final month.

    // TODO: print the line that reports how many months the loan took.

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int debtPence = 48000;
    const int MONTHLY_PAYMENT = 11000;
    int month = 0;

    while (debtPence > 0) {
        month++;
        int payment = (debtPence >= MONTHLY_PAYMENT) ? MONTHLY_PAYMENT : debtPence;
        debtPence -= payment;
        printf("Month %d: paid %dp | remaining debt: %dp (£%d.%02d)\\n",
               month, payment, debtPence, debtPence / 100, debtPence % 100);
    }

    printf("Loan cleared in %d months!\\n", month);
    return 0;
}`
};

export const unbeatenRun: HandbookExercise = {
	id: 'hb-06-unbeaten-run',
	concept: 'for loops with continue',
	prompt:
		"Rovers FC play a ten-match run, from match 1 to match 10. For each match, if match % 3 == 0 Rovers draw and gain 1 point; otherwise they win and gain 3 points. Match 4 is a non-league friendly, which is skipped with continue: print Match 4: Friendly (skipped) and add no league points. Write a complete C17 program with a for loop that prints each outcome with the running points total, then the final total.",
	hints: [
		'Run the counter from 1 to 10 inclusive, so the match number is both the loop variable and part of every message.',
		'Test the friendly first and call continue there, so the rest of that iteration never runs for match 4.',
		'Only after that check decide between a draw and a win, using the remainder of the match number divided by three.',
		'Print the running total, not the match number, at the end of each line, and copy the spacing exactly: the win line carries two spaces before the arrow and the draw line one.'
	],
	expectedStdout: `Match 1: Win (+3)  -> Total: 3 pts
Match 2: Win (+3)  -> Total: 6 pts
Match 3: Draw (+1) -> Total: 7 pts
Match 4: Friendly (skipped)
Match 5: Win (+3)  -> Total: 10 pts
Match 6: Draw (+1) -> Total: 11 pts
Match 7: Win (+3)  -> Total: 14 pts
Match 8: Win (+3)  -> Total: 17 pts
Match 9: Draw (+1) -> Total: 18 pts
Match 10: Win (+3)  -> Total: 21 pts
Final league points from run: 21`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    // TODO: declare the running points total.

    // TODO: loop over the ten matches.

    // TODO: skip match 4 as a friendly, then add 1 for a draw
    //       or 3 for a win and print the running total.

    // TODO: print the final total after the loop.

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int totalPoints = 0;

    for (int match = 1; match <= 10; match++) {
        if (match == 4) {
            printf("Match %d: Friendly (skipped)\\n", match);
            continue;
        }

        if (match % 3 == 0) {
            totalPoints += 1;
            printf("Match %d: Draw (+1) -> Total: %d pts\\n", match, totalPoints);
        } else {
            totalPoints += 3;
            printf("Match %d: Win (+3)  -> Total: %d pts\\n", match, totalPoints);
        }
    }

    printf("Final league points from run: %d\\n", totalPoints);
    return 0;
}`
};

export const loopBugs: HandbookExercise = {
	id: 'hb-06-loop-bugs',
	concept: 'loop bug hunting',
	prompt:
		'The price-chart program below should print a three-row by four-column stadium seat chart from nested for loops, where the price of each seat in pounds is row * 10 + col. Three loop bugs have crept in: the inner counter stops one column short, the price formula multiplies the wrong variable, and the newline that should end each row is missing. Fix all three so the chart prints as three separate rows starting at £11 and ending at £34. Keep the row labels and the two-space gap before each price exactly as they are.',
	hints: [
		'Start with the inner loop bound. Count how many columns the chart needs, then check whether the condition admits that many values.',
		'For row 1 the chart must read 11, 12, 13, 14, so the tens digit comes from the row and the units digit from the column. Which of the two is being multiplied by ten?',
		'Each row currently runs straight into the next on the same line. Something that belongs at the end of the outer loop body is absent.',
		'A newline is not a separator between rows in the source: it is a character you print, so the fix is one printf of its own inside the outer loop.'
	],
	expectedStdout: `Row 1:  £11  £12  £13  £14
Row 2:  £21  £22  £23  £24
Row 3:  £31  £32  £33  £34`,
	expectedExitCode: 0,
	starter: `// Broken code: find all three loop bugs.
#include <stdio.h>

int main(void) {
    for (int row = 1; row <= 3; row++) {
        printf("Row %d:", row);
        for (int col = 1; col < 4; col++) {
            int pricePounds = row + col * 10;
            printf("  £%2d", pricePounds);
        }
    }
    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    for (int row = 1; row <= 3; row++) {
        printf("Row %d:", row);
        for (int col = 1; col <= 4; col++) {
            int pricePounds = row * 10 + col;
            printf("  £%2d", pricePounds);
        }
        printf("\\n");
    }
    return 0;
}`
};