import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 15 exercises: typedef aliases for fixed-width integers, for a
 * fixed-size array, and for a function pointer. The MDX spreads each record
 * into `<ExerciseCard>`; keeping the C source here means blank lines survive
 * and every solution can be compiled by the verify script.
 */

export const basisPointFee: HandbookExercise = {
	id: 'hb-15-basis-point-fee',
	concept: 'typedef aliases for money units',
	prompt:
		'In finance one basis point (bps) is one hundredth of one percent, so 100 bps is 1% and 10000 bps is 100%. Define two typedef aliases, `typedef int64_t Pence;` and `typedef int32_t BasisPoints;`, then write a C17 function `Pence computeFee(Pence amount, BasisPoints bps)` that returns `(amount * bps) / 10000`. In `main`, calculate the management fee on a portfolio of 1500000 pence at 75 basis points, and print the portfolio, the fee rate, the fee and the net balance exactly as the expected output shows.',
	hints: [
		'Write the typedef declarations before any function, so every later line can name Pence and BasisPoints.',
		'Both aliases are just names for existing fixed-width types: the arithmetic inside computeFee is ordinary integer arithmetic.',
		'Compute the fee once and the net balance as the portfolio minus that fee; do not recompute the fee for each line.',
		'Print the 64-bit amounts with PRId64 from inttypes.h and cast the rate with (double) before dividing by 100.0 for the percentage.'
	],
	expectedStdout: `Portfolio:       1500000 pence (£15000.00)
Fee rate:        75 bps (0.75%)
Management fee:  11250 pence (£112.50)
Net portfolio:   1488750 pence (£14887.50)`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>
#include <stdint.h>
#include <inttypes.h>

/* TODO: define two aliases with typedef: Pence for a 64-bit signed integer,
   and BasisPoints for a 32-bit signed integer. */

/* TODO: declare Pence computeFee(Pence amount, BasisPoints bps) here. It
   returns (amount * bps) / 10000. */

int main(void) {
    // TODO: store a portfolio of 1500000 pence and a rate of 75 basis points.

    // TODO: compute the fee and the net balance, then print the four aligned
    // lines shown in the expected output.

    return 0;
}`,
	solution: `#include <stdio.h>
#include <stdint.h>
#include <inttypes.h>

typedef int64_t Pence;
typedef int32_t BasisPoints;

Pence computeFee(Pence amount, BasisPoints bps) {
    return (amount * bps) / 10000;
}

int main(void) {
    Pence portfolio = 1500000;
    BasisPoints rateBps = 75;
    Pence fee = computeFee(portfolio, rateBps);
    Pence net = portfolio - fee;

    printf("Portfolio:       %" PRId64 " pence (£%" PRId64 ".%02" PRId64 ")\\n",
           portfolio, portfolio / 100, portfolio % 100);
    printf("Fee rate:        %" PRId32 " bps (%.2f%%)\\n",
           rateBps, (double)rateBps / 100.0);
    printf("Management fee:  %" PRId64 " pence (£%" PRId64 ".%02" PRId64 ")\\n",
           fee, fee / 100, fee % 100);
    printf("Net portfolio:   %" PRId64 " pence (£%" PRId64 ".%02" PRId64 ")\\n",
           net, net / 100, net % 100);

    return 0;
}`
};

export const formGuidePoints: HandbookExercise = {
	id: 'hb-15-form-guide-points',
	concept: 'typedef for a fixed-size array type',
	prompt:
		'C lets you typedef a whole array, not just a scalar. Define `typedef char FormGuide[6];` (five match results plus the null terminator) and `typedef int LeaguePoints;`, then create `FormGuide roversForm = "WWDLW";`. Write `LeaguePoints scoreFormGuide(const FormGuide form)` that walks the five characters and returns the points: W scores 3, D scores 1, L scores 0. Print the form and the total, exactly as the expected output shows.',
	hints: [
		'The alias is a complete type: `typedef char FormGuide[6];` can be used wherever you would otherwise write `char[6]`, including as a parameter type.',
		'A parameter declared as `const FormGuide form` receives the array itself, so `form[i]` works exactly as it does for a plain string.',
		'Stop the loop at the null terminator rather than at a hard-coded index of 5; the terminator is what tells you the form really ended.',
		'Add 3 for W and 1 for D, and let L add nothing at all.'
	],
	expectedStdout: `Rovers 5-match form: WWDLW
Points from last 5 matches: 10`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

/* TODO: define FormGuide as an alias for a 6-byte char array (five match
   results plus the null terminator), and LeaguePoints as an alias for int. */

/* TODO: declare LeaguePoints scoreFormGuide(const FormGuide form) here.
   Walk the string until the null terminator, add 3 for W, 1 for D, and
   nothing for L. */

int main(void) {
    // TODO: create a form guide holding "WWDLW".

    // TODO: score it and print the form and the points.

    return 0;
}`,
	solution: `#include <stdio.h>

typedef char FormGuide[6];
typedef int LeaguePoints;

LeaguePoints scoreFormGuide(const FormGuide form) {
    LeaguePoints pts = 0;
    for (int i = 0; form[i] != '\\0'; i++) {
        if (form[i] == 'W') {
            pts += 3;
        } else if (form[i] == 'D') {
            pts += 1;
        }
    }
    return pts;
}

int main(void) {
    FormGuide roversForm = "WWDLW";
    LeaguePoints recentPts = scoreFormGuide(roversForm);

    printf("Rovers 5-match form: %s\\n", roversForm);
    printf("Points from last 5 matches: %d\\n", recentPts);

    return 0;
}`
};

export const bonusRuleBugs: HandbookExercise = {
	id: 'hb-15-bonus-rule-bugs',
	concept: 'debugging typedef declarations and function pointers',
	prompt:
		'The program below is supposed to load two bonus rules through a `typedef int (*BonusRule)(int basePence);` alias, but it contains four beginner bugs: a missing semicolon after a typedef, a reversed typedef, a function pointer initialised by calling the function instead of naming it, and a format specifier that does not match a 64-bit `Pence` argument. Fix all four so the program compiles with zero warnings under `-Wall -Wextra -Werror` and prints the expected output.',
	hints: [
		'Start at the first error and fix only that one; the errors below it are often consequences, not separate mistakes.',
		'A typedef declaration is an ordinary declaration with typedef in front, so the new name comes last, just before the semicolon.',
		'To store a function in a function pointer you name it without parentheses: `standardBonus`, not `standardBonus()`.',
		'A `Pence` is a 64-bit value, so printing it with %d hands printf the wrong width; use the PRId64 macro from inttypes.h.'
	],
	expectedStdout: `Account #40881920
Standard rule on 40000p: 2000p bonus
Premier rule on 40000p:  4000p bonus`,
	expectedExitCode: 0,
	starter: `// Broken code: find all four bugs.
#include <stdio.h>
#include <stdint.h>
#include <inttypes.h>

typedef uint32_t AccountId
typedef Pence int64_t;

typedef int (*BonusRule)(int basePence);

int standardBonus(int basePence) {
    return basePence / 20;
}

int premierBonus(int basePence) {
    return basePence / 10;
}

int main(void) {
    AccountId accountId = 40881920U;
    Pence stakePence = 40000;

    printf("Account #%" PRIu32 "\\n", accountId);

    BonusRule activeRule = standardBonus();
    printf("Standard rule on %dp: %dp bonus\\n", stakePence, activeRule(40000));

    activeRule = premierBonus;
    printf("Premier rule on %dp:  %dp bonus\\n", stakePence, activeRule(40000));

    return 0;
}`,
	solution: `#include <stdio.h>
#include <stdint.h>
#include <inttypes.h>

typedef uint32_t AccountId;
typedef int64_t Pence;

typedef int (*BonusRule)(int basePence);

int standardBonus(int basePence) {
    return basePence / 20;
}

int premierBonus(int basePence) {
    return basePence / 10;
}

int main(void) {
    AccountId accountId = 40881920U;
    Pence stakePence = 40000;

    printf("Account #%" PRIu32 "\\n", accountId);

    BonusRule activeRule = standardBonus;
    printf("Standard rule on %" PRId64 "p: %dp bonus\\n",
           stakePence, activeRule(40000));

    activeRule = premierBonus;
    printf("Premier rule on %" PRId64 "p:  %dp bonus\\n",
           stakePence, activeRule(40000));

    return 0;
}`
};