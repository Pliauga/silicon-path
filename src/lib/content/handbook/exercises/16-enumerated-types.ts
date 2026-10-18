import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 16 exercises. Handbook MDX spreads each record into `<ExerciseCard>`.
 * Keeping the C source here (not in MDX attributes) means blank lines survive,
 * the editor receives an exact program, and the data is type-checked.
 */

export const directDebitStateMachine: HandbookExercise = {
	id: 'hb-16-direct-debit-state-machine',
	concept: 'enum states and a switch-to-text helper',
	prompt:
		"Write a complete C17 program for a direct-debit state machine. Define `typedef enum { DD_SCHEDULED = 0, DD_PAID = 1, DD_BOUNCED = 2, DD_CANCELLED = 3 } DirectDebitState;` and a function `DirectDebitState processDirectDebit(DirectDebitState current, int *balanceSlip, int billPence)`. If `current` is anything other than `DD_SCHEDULED`, leave `*balanceSlip` untouched and return `current`. If it is `DD_SCHEDULED` and `*balanceSlip >= billPence`, deduct `billPence` and return `DD_PAID`; otherwise deduct a 500p unpaid-item penalty and return `DD_BOUNCED`. In `main`, start with 20000p and run two bills of 12000p, printing the state name, its numeric code, and the remaining balance after each call.",
	hints: [
		'Write the state-name helper first: one `switch` over `DirectDebitState` with a `case` per enumerator, each returning a string literal.',
		'Compare `*balanceSlip` with `billPence` before you deduct anything, then deduct exactly once on each path.',
		'The bounced path still charges something: subtract the 500p penalty from `*balanceSlip` after the failed comparison.',
		'The second call receives the 8000p left behind by the first, not the original 20000p, so it is the same function call with a different answer.'
	],
	expectedStdout: `Bill 1 (12000p): state = PAID (code 1), remaining balance = 8000p
Bill 2 (12000p): state = BOUNCED (code 2), remaining balance = 7500p`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

typedef enum {
    DD_SCHEDULED = 0,
    DD_PAID      = 1,
    DD_BOUNCED   = 2,
    DD_CANCELLED = 3
} DirectDebitState;

// TODO: write const char *ddStateName(DirectDebitState s), a switch that
//       returns "SCHEDULED", "PAID", "BOUNCED" or "CANCELLED".

// TODO: write DirectDebitState processDirectDebit(DirectDebitState current,
//       int *balanceSlip, int billPence) following the rules in the prompt.

int main(void) {
    // TODO: start with 20000p, run two 12000p bills, and print after each one.

    return 0;
}`,
	solution: `#include <stdio.h>

typedef enum {
    DD_SCHEDULED = 0,
    DD_PAID      = 1,
    DD_BOUNCED   = 2,
    DD_CANCELLED = 3
} DirectDebitState;

const char *ddStateName(DirectDebitState s) {
    switch (s) {
        case DD_SCHEDULED: return "SCHEDULED";
        case DD_PAID:      return "PAID";
        case DD_BOUNCED:   return "BOUNCED";
        case DD_CANCELLED: return "CANCELLED";
        default:           return "UNKNOWN";
    }
}

DirectDebitState processDirectDebit(DirectDebitState current,
                                    int *balanceSlip,
                                    int billPence) {
    if (current != DD_SCHEDULED) {
        return current;
    }
    if (*balanceSlip >= billPence) {
        *balanceSlip -= billPence;
        return DD_PAID;
    }
    *balanceSlip -= 500;
    return DD_BOUNCED;
}

int main(void) {
    int balancePence = 20000;

    DirectDebitState s1 = processDirectDebit(DD_SCHEDULED, &balancePence, 12000);
    printf("Bill 1 (12000p): state = %s (code %d), remaining balance = %dp\\n",
           ddStateName(s1), s1, balancePence);

    DirectDebitState s2 = processDirectDebit(DD_SCHEDULED, &balancePence, 12000);
    printf("Bill 2 (12000p): state = %s (code %d), remaining balance = %dp\\n",
           ddStateName(s2), s2, balancePence);

    return 0;
}`
};

export const matchPhaseClock: HandbookExercise = {
	id: 'hb-16-match-phase-clock',
	concept: 'enum as an array bound and lookup index',
	prompt:
		"Write a complete C17 program that defines `typedef enum { PHASE_PRE_MATCH = 0, PHASE_FIRST_HALF, PHASE_HALF_TIME, PHASE_SECOND_HALF, PHASE_FULL_TIME, PHASE_COUNT } MatchPhase;`. Because the enumerators start at 0 and increase by 1, `PHASE_COUNT` is automatically the number of real phases, which is 5. Use `PHASE_COUNT` to size a string lookup array `const char *phaseNames[PHASE_COUNT]` holding the names Pre-Match Warmup, First Half, Half-Time Interval, Second Half and Full Time in that order. Print the total, then loop from 0 to `PHASE_COUNT - 1`, printing each phase number and name.",
	hints: [
		'Only the first enumerator needs `= 0`; every later one counts up by itself, so you never write the others by hand.',
		'Keep `PHASE_COUNT` as the final enumerator so it lands one past the last real phase and can size the array.',
		'The loop counter `p` is a plain `int`, and it indexes `phaseNames` directly because the enum values are 0, 1, 2, 3, 4.',
		'The loop condition is `p < PHASE_COUNT`; using `<=` would read one entry past the end of the array.'
	],
	expectedStdout: `Total match phases (PHASE_COUNT): 5
  Phase 0: Pre-Match Warmup
  Phase 1: First Half
  Phase 2: Half-Time Interval
  Phase 3: Second Half
  Phase 4: Full Time`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

typedef enum {
    PHASE_PRE_MATCH = 0,
    PHASE_FIRST_HALF,
    PHASE_HALF_TIME,
    PHASE_SECOND_HALF,
    PHASE_FULL_TIME,
    PHASE_COUNT
} MatchPhase;

int main(void) {
    // TODO: declare const char *phaseNames[PHASE_COUNT] and fill it in order.

    // TODO: print PHASE_COUNT as an integer.

    // TODO: loop from 0 to PHASE_COUNT - 1 and print each phase and name.

    return 0;
}`,
	solution: `#include <stdio.h>

typedef enum {
    PHASE_PRE_MATCH = 0,
    PHASE_FIRST_HALF,
    PHASE_HALF_TIME,
    PHASE_SECOND_HALF,
    PHASE_FULL_TIME,
    PHASE_COUNT
} MatchPhase;

int main(void) {
    const char *phaseNames[PHASE_COUNT] = {
        "Pre-Match Warmup",
        "First Half",
        "Half-Time Interval",
        "Second Half",
        "Full Time"
    };

    printf("Total match phases (PHASE_COUNT): %d\\n", PHASE_COUNT);
    for (int p = 0; p < PHASE_COUNT; p++) {
        printf("  Phase %d: %s\\n", p, phaseNames[p]);
    }

    return 0;
}`
};

export const cardFlagBugs: HandbookExercise = {
	id: 'hb-16-card-flag-bugs',
	concept: 'bit flags from power-of-two enum constants',
	prompt:
		'The program below builds a card permission set from power-of-two `enum` constants and reports which features are enabled, but it contains four bugs. One missing terminator stops the compiler at the enum declaration, one enumerator reuses a bit that another already owns, one format specifier asks `printf` to read an integer as a string, and one bit test compiles cleanly yet answers the wrong question. Fix all four so the program compiles with zero warnings under cc -std=c17 -Wall -Wextra -Wpedantic and prints a combined value of 3, with contactless and online enabled and abroad disabled.',
	hints: [
		'Read the first compiler error literally: an enum definition is a declaration, so the closing brace needs a semicolon after it.',
		'Each flag must own exactly one bit, so the shift amount has to differ for every enumerator: 1, 2, 4 means shifting by 0, 1 and 2.',
		'The first `printf` prints a number, so it needs the integer specifier; `%s` makes `printf` treat that number as an address and read memory there.',
		'A single ampersand tests whether one bit is set. Two ampersands only ask whether both operands are non-zero, which is true for almost every flag value.'
	],
	expectedStdout: `Combined card flags value: 3
  Contactless enabled? YES
  Online enabled?      YES
  Abroad enabled?      NO`,
	expectedExitCode: 0,
	starter: `// Broken code: find all four bugs.
#include <stdio.h>

enum CardFlags {
    FLAG_CONTACTLESS = 1 << 0,   // 1
    FLAG_ONLINE      = 1 << 0,   // 2
    FLAG_ABROAD      = 1 << 2    // 4
}

int main(void) {
    int myCard = FLAG_CONTACTLESS | FLAG_ONLINE;

    printf("Combined card flags value: %s\\n", myCard);
    printf("  Contactless enabled? %s\\n",
           (myCard & FLAG_CONTACTLESS) ? "YES" : "NO");
    printf("  Online enabled?      %s\\n",
           (myCard & FLAG_ONLINE) ? "YES" : "NO");
    printf("  Abroad enabled?      %s\\n",
           (myCard && FLAG_ABROAD) ? "YES" : "NO");

    return 0;
}`,
	solution: `#include <stdio.h>

enum CardFlags {
    FLAG_CONTACTLESS = 1 << 0,   // 1
    FLAG_ONLINE      = 1 << 1,   // 2
    FLAG_ABROAD      = 1 << 2    // 4
};

int main(void) {
    int myCard = FLAG_CONTACTLESS | FLAG_ONLINE;

    printf("Combined card flags value: %d\\n", myCard);
    printf("  Contactless enabled? %s\\n",
           (myCard & FLAG_CONTACTLESS) ? "YES" : "NO");
    printf("  Online enabled?      %s\\n",
           (myCard & FLAG_ONLINE) ? "YES" : "NO");
    printf("  Abroad enabled?      %s\\n",
           (myCard & FLAG_ABROAD) ? "YES" : "NO");

    return 0;
}`
};