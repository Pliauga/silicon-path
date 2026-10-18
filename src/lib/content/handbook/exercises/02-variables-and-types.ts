import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 2 exercises. Handbook MDX spreads each record into `<ExerciseCard>`.
 * Keeping the C source here (not in MDX attributes) means blank lines survive,
 * the editor receives an exact program, and the data is type-checked.
 */

export const vaultCapacity: HandbookExercise = {
	id: 'hb-02-vault-capacity',
	concept: 'types, sizeof and large values',
	prompt:
		"Write a complete C17 program for a regional bank that tracks three values: a teller window letter ('C') in a char, a personal ISA balance of 1850000 pence in an int, and a corporate treasury reserve of 500000000000LL pence in a long long. Print each value with its sizeof in bytes, then print a final line that names INT_MAX and explains why the reserve cannot live in a 32-bit int.",
	hints: [
		'Give each value its own variable, and pick the type that can actually hold it.',
		'sizeof is an operator, not a function: sizeof window needs no parentheses.',
		'Print a char with %c, an int with %d, a long long with %lld, and a sizeof with %zu.',
		'The last line prints two values — INT_MAX and the reserve — so it needs two format specifiers.'
	],
	expectedStdout: `Window: C (uses 1 byte)
ISA balance: 1850000 pence (uses 4 bytes)
Treasury reserve: 500000000000 pence (uses 8 bytes)
Max 32-bit int is 2147483647, so 500000000000 needs long long!`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>
#include <limits.h>

int main(void) {
    // TODO: declare the window letter, the ISA balance and the treasury reserve.

    // TODO: print each value with its sizeof, then explain the int limit.

    return 0;
}`,
	solution: `#include <stdio.h>
#include <limits.h>

int main(void) {
    char window = 'C';
    int isaPence = 1850000;
    long long treasuryPence = 500000000000LL;

    printf("Window: %c (uses %zu byte)\\n", window, sizeof window);
    printf("ISA balance: %d pence (uses %zu bytes)\\n", isaPence, sizeof isaPence);
    printf("Treasury reserve: %lld pence (uses %zu bytes)\\n",
           treasuryPence, sizeof treasuryPence);
    printf("Max 32-bit int is %d, so %lld needs long long!\\n",
           INT_MAX, treasuryPence);

    return 0;
}`
};

export const turnstileWrap: HandbookExercise = {
	id: 'hb-02-turnstile-wrap',
	concept: 'unsigned wraparound',
	prompt:
		'Rovers FC has an old electronic turnstile that stores its count in an unsigned short, which holds 0 to 65535. On cup final day 65534 fans have already entered and 5 more walk through one by one. Write a C17 program that starts an unsigned short at 65534, adds 5 to it with a cast back to unsigned short, and prints the before and after readings next to USHRT_MAX from limits.h. Add an int32_t holding the true crowd of 65534 + 5, and print that with its sizeof, so the wrapped turnstile and the upgraded counter sit side by side.',
	hints: [
		'The turnstile is fine until the sixth fan: 65534 plus 5 is 65539, which no longer fits in 16 bits.',
		'USHRT_MAX is a constant from limits.h; cast it to unsigned int before printing with %u.',
		'Cast the sum back to the narrow type — (unsigned short)(oldTurnstile + 5) — before printing it.',
		'The upgraded counter is an int32_t, so print it with %d and its sizeof with %zu.'
	],
	expectedStdout: `Turnstile max (USHRT_MAX): 65535
Old turnstile before:      65534
Old turnstile after +5:    3 (wrapped around!)
Upgraded 32-bit counter:   65539 (uses 4 bytes)`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>
#include <limits.h>
#include <stdint.h>

int main(void) {
    // TODO: start the unsigned short turnstile and the int32_t counter at 65534.

    // TODO: print USHRT_MAX and the before reading.

    // TODO: add five to both, then print the after readings.

    return 0;
}`,
	solution: `#include <stdio.h>
#include <limits.h>
#include <stdint.h>

int main(void) {
    unsigned short oldTurnstile = 65534;
    int32_t upgradedCounter = 65534;

    printf("Turnstile max (USHRT_MAX): %u\\n", (unsigned int)USHRT_MAX);
    printf("Old turnstile before:      %u\\n", (unsigned int)oldTurnstile);

    oldTurnstile = (unsigned short)(oldTurnstile + 5);
    upgradedCounter = upgradedCounter + 5;

    printf("Old turnstile after +5:    %u (wrapped around!)\\n",
           (unsigned int)oldTurnstile);
    printf("Upgraded 32-bit counter:   %d (uses %zu bytes)\\n",
           upgradedCounter, sizeof upgradedCounter);

    return 0;
}`
};

export const memoryBoxInspector: HandbookExercise = {
	id: 'hb-02-memory-box-inspector',
	concept: 'addresses and type widths',
	prompt:
		"Declare three int variables (boxA = 100, boxB = 200, boxC = 300) and three char variables (tag1 = 'X', tag2 = 'Y', tag3 = 'Z'). Print each variable's value, its sizeof in bytes, and its memory address using %p, casting every pointer to (void *). Then compare the rows: the int addresses step by 4 bytes while the char addresses step by 1, which is the widths of the types made visible.",
	hints: [
		'Print in declaration order and compare the addresses by eye; the compiler, not you, decides the layout.',
		'A pointer must be cast to (void *) before %p will accept it without a warning.',
		'Each line prints three things: the value, the sizeof of the variable, and its address.',
		'sizeof returns a size_t, so print it with %zu — %d will trigger a warning.'
	],
	starter: `#include <stdio.h>

int main(void) {
    // TODO: declare three ints (100, 200, 300) and three chars ('X', 'Y', 'Z').

    // TODO: print each value, its sizeof, and its address as (void *).

    return 0;
}`,
	solution: `#include <stdio.h>

int main(void) {
    int boxA = 100;
    int boxB = 200;
    int boxC = 300;
    char tag1 = 'X';
    char tag2 = 'Y';
    char tag3 = 'Z';

    printf("boxA = %d (%zu bytes) at %p\\n", boxA, sizeof boxA, (void *)&boxA);
    printf("boxB = %d (%zu bytes) at %p\\n", boxB, sizeof boxB, (void *)&boxB);
    printf("boxC = %d (%zu bytes) at %p\\n", boxC, sizeof boxC, (void *)&boxC);

    printf("tag1 = %c (%zu byte)  at %p\\n", tag1, sizeof tag1, (void *)&tag1);
    printf("tag2 = %c (%zu byte)  at %p\\n", tag2, sizeof tag2, (void *)&tag2);
    printf("tag3 = %c (%zu byte)  at %p\\n", tag3, sizeof tag3, (void *)&tag3);

    return 0;
}`
};