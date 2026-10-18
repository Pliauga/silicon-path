import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 11 exercises: checked parsing, character output and column alignment.
 * The MDX spreads each record into `<ExerciseCard>`; keeping the C source here
 * means blank lines survive and every solution can be compiled by the verify
 * script.
 */

export const ledgerParser: HandbookExercise = {
	id: 'hb-11-ledger-parser',
	concept: 'checked sscanf parsing and a running balance',
	prompt:
		'Given an array of three raw transaction strings, as if read line by line by `fgets`: `DEPOSIT 12500`, `CORRUPT_LINE` and `WITHDRAW 4000`, each still carrying its trailing newline. Write a C17 program that loops over all three lines, uses `sscanf(lines[i], "%15s %d", action, &amountPence)` and checks whether the return value equals 2. For valid lines, update a running `balancePence` (starting at 10000p) for `DEPOSIT` (add) or `WITHDRAW` (subtract). For invalid lines, print the warning message instead. Print the running balance after every valid line, then the final audited balance, exactly as the expected output shows.',
	hints: [
		'Copy the three strings into an array of const char * and loop with an index from 0 to 2.',
		'The check is the whole exercise: only touch the balance when sscanf returns 2.',
		'Compare the action word with strcmp. Only DEPOSIT adds, only WITHDRAW subtracts, and both print the balance afterwards.',
		'The final line divides by 100 for the pounds and uses the remainder for the pence, printed with %02d.'
	],
	expectedStdout: `Line 0: DEPOSIT 12500p -> Balance: 22500p
Line 1: Warning — skipped malformed line!
Line 2: WITHDRAW 4000p -> Balance: 18500p
Final audited balance: 18500 pence (£185.00)
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>
#include <string.h>

int main(void) {
    // TODO: copy the three transaction lines into an array of const char *.

    // TODO: start the running balance at 10000 pence.

    // TODO: loop over all three lines. Parse each one with sscanf and only
    // act when the return value is 2; print the warning otherwise.

    // TODO: print the running balance after each valid line, then the final
    // audited balance in pence and in pounds.

    return 0;
}`,
	solution: `#include <stdio.h>
#include <string.h>

int main(void) {
    const char *lines[3] = {
        "DEPOSIT 12500\\n",
        "CORRUPT_LINE\\n",
        "WITHDRAW 4000\\n"
    };

    int balancePence = 10000;

    for (size_t i = 0; i < 3; i++) {
        char action[16];
        int amountPence = 0;

        if (sscanf(lines[i], "%15s %d", action, &amountPence) == 2) {
            if (strcmp(action, "DEPOSIT") == 0) {
                balancePence += amountPence;
            } else if (strcmp(action, "WITHDRAW") == 0) {
                balancePence -= amountPence;
            }
            printf("Line %zu: %s %dp -> Balance: %dp\\n",
                   i, action, amountPence, balancePence);
        } else {
            printf("Line %zu: Warning — skipped malformed line!\\n", i);
        }
    }

    printf("Final audited balance: %d pence (£%d.%02d)\\n",
           balancePence, balancePence / 100, balancePence % 100);
    return 0;
}`
};

export const scorelineFilter: HandbookExercise = {
	id: 'hb-11-scoreline-filter',
	concept: 'putchar with a character test',
	prompt:
		'Suppose a noisy teleprinter feed sends the string `Rovers: 3 | Athletic: 1 [FT]` followed by a newline. Write a C17 program that walks the string one character at a time and uses `putchar` to print every character except the digits 0 to 9, which it replaces with a hash sign to make a guess-the-score quiz line. Count how many digits were hidden and print that count on its own line, exactly as the expected output shows.',
	hints: [
		'The feed already ends with a newline, so the loop output leaves the cursor on the next line without an extra newline of your own.',
		'Test each character against the two character constants, after the digit 0 and up to the digit 9, rather than calling a library function.',
		'Increment the counter only in the branch that prints the hash sign.',
		'Print the label Quiz feed: once before the loop, then the count after it.'
	],
	expectedStdout: `Quiz feed: Rovers: # | Athletic: # [FT]
Digits hidden: 2
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    const char *feed = "Rovers: 3 | Athletic: 1 [FT]\\n";
    int hiddenCount = 0;
    (void)feed;         /* TODO: delete once the filter walks the feed */
    (void)hiddenCount;  /* TODO: delete once digits are counted */

    // TODO: print the Quiz feed label once, before the loop.

    // TODO: walk the feed until the null terminator, printing each character
    // with putchar. Digits become a hash sign and are counted instead.

    // TODO: print how many digits were hidden.

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    const char *feed = "Rovers: 3 | Athletic: 1 [FT]\\n";
    int hiddenCount = 0;

    printf("Quiz feed: ");
    for (size_t i = 0; feed[i] != '\\0'; i++) {
        char ch = feed[i];
        if (ch >= '0' && ch <= '9') {
            putchar('#');
            hiddenCount++;
        } else {
            putchar(ch);
        }
    }

    printf("Digits hidden: %d\\n", hiddenCount);
    return 0;
}`
};

export const receiptColumns: HandbookExercise = {
	id: 'hb-11-receipt-columns',
	concept: 'printf column widths and checked parsing',
	prompt:
		'Write a C17 program that prints a receipt table for three amounts in pence: 450, 12990 and 75. The table has a header row, a row of dashes, and one line per item giving the item number, the raw pence amount, and the same amount formatted as pounds and pence. Use `printf` field widths such as `%4d` and `%11d` so the columns line up, and remember that the pence part needs `%02d` so that 5 prints as 05. If you read the three numbers one by one from a string stream with `sscanf` instead of storing them in an array, check that every return value is 1 and stop cleanly when it is not. The output must match the expected text exactly.',
	hints: [
		'Measure the columns from the expected output: the item number sits in a 4-wide field and the pence amount in an 11-wide field.',
		'pence / 100 is the pounds part and pence % 100 is the remainder; print the remainder with %02d so that 5 becomes 05.',
		'The money column is right-aligned as a whole, pounds sign included, so build that text with snprintf first and then print it with its own width.',
		'Each row prints its own newline at the end; the loop should not print a trailing blank line after the last item.'
	],
	expectedStdout: `Item |  Amount (p) |  Formatted
-------------------------------
   1 |         450 |      £4.50
   2 |       12990 |    £129.90
   3 |          75 |      £0.75
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

int main(void) {
    int items[3] = {450, 12990, 75};
    (void)items;  /* TODO: delete once the table prints */

    // TODO: print the header row and the dashed rule under it.

    // TODO: loop over the three amounts, build the pounds-and-pence text with
    // snprintf, and print one aligned row per item.

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int items[3] = {450, 12990, 75};

    printf("Item |  Amount (p) |  Formatted\\n");
    printf("-------------------------------\\n");
    for (int i = 0; i < 3; i++) {
        int pence = items[i];
        char money[16];

        snprintf(money, sizeof money, "£%d.%02d", pence / 100, pence % 100);
        printf("%4d | %11d | %11s\\n", i + 1, pence, money);
    }

    return 0;
}`
};