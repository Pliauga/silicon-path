import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 20 exercises: macro precedence, conditional compilation, and the
 * sizeof-based array-length idiom. The MDX spreads each record into
 * `<ExerciseCard>`; keeping the C source here means blank lines survive and
 * `node scripts/verify-handbook.mjs` can compile every solution.
 */

export const vatPrecedence: HandbookExercise = {
	id: 'hb-20-vat-precedence',
	concept: 'macro precedence bugs',
	prompt:
		"The program below defines a VAT macro with no parentheses, so it silently computes the wrong tax. Expand `BAD_VAT(1000 + 500)` by hand to show why it prints 1100 pence instead of the 300 pence that 20 per cent of 1500 pence should be, then add a properly parenthesised `SAFE_VAT(pence)` macro written as `(((pence) * 20) / 100)`. Print the broken result, the safe result, and a total that keeps the 1500 pence principal and adds the corrected VAT, exactly as the expected output shows.",
	hints: [
		'Write the expansion out on paper before you touch the code: substitute 1000 + 500 for pence and apply operator precedence as written.',
		'Multiplication and division bind tighter than addition, which is why the missing pair of parentheses moves 500 out of the sum.',
		'A safe macro wraps every parameter and then the entire body, so `pence` becomes `(pence)` and the whole expression gains one more pair around it.',
		'A literal percent sign inside a printf format string is written as two percent signs.'
	],
	expectedStdout: `BAD_VAT(1000 + 500)  = 1100 pence (BUG: computed 1000 + (500 * 20 / 100)!)
SAFE_VAT(1000 + 500) = 300 pence  (Correct: 20% of 1500p)
Total with SAFE_VAT:   1800 pence
`,
	expectedExitCode: 0,
	starter: `// Broken code: the macro below silently computes the wrong answer.
#include <stdio.h>

#define BAD_VAT(pence)  pence * 20 / 100

int main(void) {
    int badResult = BAD_VAT(1000 + 500);
    printf("BAD_VAT(1000 + 500)  = %d pence\\n", badResult);

    // TODO: add the properly parenthesised SAFE_VAT(pence) macro above main.

    // TODO: print the safe result, then the total that keeps the 1500p
    // principal and adds the corrected VAT.

    return 0;
}`,
	solution: `#include <stdio.h>

#define BAD_VAT(pence)  pence * 20 / 100
#define SAFE_VAT(pence) (((pence) * 20) / 100)

int main(void) {
    int badResult = BAD_VAT(1000 + 500);
    int safeResult = SAFE_VAT(1000 + 500);
    int totalWithVat = (1000 + 500) + SAFE_VAT(1000 + 500);

    printf("BAD_VAT(1000 + 500)  = %d pence (BUG: computed 1000 + (500 * 20 / 100)!)\\n",
           badResult);
    printf("SAFE_VAT(1000 + 500) = %d pence  (Correct: 20%% of 1500p)\\n",
           safeResult);
    printf("Total with SAFE_VAT:   %d pence\\n", totalWithVat);

    return 0;
}`
};

export const clampInjuryTime: HandbookExercise = {
	id: 'hb-20-clamp-injury-time',
	concept: 'conditional compilation with #ifdef',
	prompt:
		"Write a C17 program for Rovers FC that defines a three-argument macro `CLAMP(val, lo, hi)` keeping a value at or above `lo` and at or below `hi`, and uses it to clamp an injury-time reading of 15 minutes and a negative reading of -2 minutes into the valid range from 1 to 10. Define `STADIUM_DEBUG` at the top of the file, and guard one diagnostic line with `#ifdef STADIUM_DEBUG` that prints the enclosing function name and the current line number using `__func__` and `__LINE__`.",
	hints: [
		'The diagnostic block is compiled only when STADIUM_DEBUG is defined, so define it above main, or pass -DSTADIUM_DEBUG on the command line instead.',
		'CLAMP takes three values and uses each of them more than once, so every parameter needs its own pair of parentheses.',
		'Two nested conditional expressions do the work: the outer one asks whether the value is below the floor, the inner one whether it is above the ceiling.',
		'__func__ expands to the name of the enclosing function and is printed with %s, while __LINE__ is an integer and is printed with %d.'
	],
	expectedStdout: `[DEBUG main:9] Clamping injury time values into [1..10]
Clamped 15 mins -> 10 mins
Clamped -2 mins -> 1 mins
Clamped  4 mins -> 4 mins
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

/* TODO: define STADIUM_DEBUG here, so the diagnostic block inside main is
   compiled in. */
/* TODO: define CLAMP(val, lo, hi) here. Each parameter is used more than
   once, so each needs its own parentheses, and the whole body needs one
   more pair. */

int main(void) {
#ifdef STADIUM_DEBUG
    // TODO: print "[DEBUG function:line] Clamping injury time values into [1..10]"
    // using __func__ and __LINE__.
#endif

    // TODO: print the clamped values for 15, -2 and 4 minutes.

    return 0;
}`,
	solution: `#include <stdio.h>

#define STADIUM_DEBUG
#define CLAMP(val, lo, hi) (((val) < (lo)) ? (lo) : (((val) > (hi)) ? (hi) : (val)))

int main(void) {
#ifdef STADIUM_DEBUG
    printf("[DEBUG %s:%d] Clamping injury time values into [1..10]\\n",
           __func__, __LINE__);
#endif

    printf("Clamped 15 mins -> %d mins\\n", CLAMP(15, 1, 10));
    printf("Clamped -2 mins -> %d mins\\n", CLAMP(-2, 1, 10));
    printf("Clamped  4 mins -> %d mins\\n", CLAMP(4,  1, 10));

    return 0;
}`
};

export const arrayLen: HandbookExercise = {
	id: 'hb-20-array-len',
	concept: 'a sizeof-based array length macro',
	prompt:
		"Write a C17 program that defines `ARRAY_LEN(arr)` as the array's total size in bytes divided by the size of its first element, and uses it to loop over two arrays without hardcoding either length: an `int` array of five bank deposits (1000, 1500, 2000, 1200, 1800) and a `const char *` array of three club names (Rovers, Athletic, United). Print each count and the sum of the deposits, in the exact layout of the expected output.",
	hints: [
		'sizeof applied to an array gives the size of the whole array in bytes, not the number of elements it holds.',
		'Dividing that total by the size of one element yields the element count, and the answer stays correct if the array grows later.',
		'Parenthesise the array parameter as well as the whole division, so the macro still behaves when it is used inside a larger expression.',
		'The loop counter can be a size_t, and %zu prints it without a cast.'
	],
	expectedStdout: `Deposits count: 5 | Sum: 7500 pence
Clubs count: 3 -> Rovers | Athletic | United
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

/* TODO: define ARRAY_LEN(arr) here. sizeof(arr) gives the whole array's size
   in bytes, so dividing by the size of one element gives the element count. */

int main(void) {
    // TODO: declare the five bank deposits (1000, 1500, 2000, 1200, 1800)
    // and the three club names (Rovers, Athletic, United).

    // TODO: sum the deposits in a loop bounded by ARRAY_LEN(deposits).

    // TODO: print the deposit count and the sum, then the club count and the
    // three names, matching the expected output exactly.

    return 0;
}`,
	solution: `#include <stdio.h>

#define ARRAY_LEN(arr) (sizeof(arr) / sizeof((arr)[0]))

int main(void) {
    int deposits[] = {1000, 1500, 2000, 1200, 1800};
    const char *clubs[] = {"Rovers", "Athletic", "United"};

    int sum = 0;
    for (size_t i = 0; i < ARRAY_LEN(deposits); i++) {
        sum += deposits[i];
    }
    printf("Deposits count: %zu | Sum: %d pence\\n",
           ARRAY_LEN(deposits), sum);

    printf("Clubs count: %zu -> %s | %s | %s\\n",
           ARRAY_LEN(clubs), clubs[0], clubs[1], clubs[2]);

    return 0;
}`
};