import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 13 exercises: static locals, their zero-initialisation and their
 * address stability across calls. The MDX spreads each record into
 * `<ExerciseCard>`; keeping the C source here means blank lines survive and
 * every solution can be compiled by the verify script.
 */

export const peakBalance: HandbookExercise = {
	id: 'hb-13-peak-balance',
	concept: 'static locals as a high-water mark',
	prompt:
		'Write a C17 function int updatePeakBalance(int currentBalancePence) that uses a static int peakBalancePence = 0; to remember the highest balance seen across all calls. Update peakBalancePence whenever currentBalancePence is greater than the stored peak, and return peakBalancePence. Call it from main with the balances 12000, 35000, 21000 and 48000, printing the current balance and the all-time peak after each call, exactly as the expected output shows.',
	hints: [
		'The peak belongs inside the function, not in main — putting it there is what lets the value survive between calls.',
		'Only assign to peakBalancePence when the new balance beats the stored record; a lower balance must leave the peak untouched.',
		'Print from main after each call, using the value the function returned.',
		'An int array of the four snapshots plus a for loop keeps the call and the print together.'
	],
	expectedStdout: `Current: 12000p | All-time peak: 12000p
Current: 35000p | All-time peak: 35000p
Current: 21000p | All-time peak: 35000p
Current: 48000p | All-time peak: 48000p
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

/* TODO: declare updatePeakBalance() here. It takes the current balance in
   pence, keeps the highest value ever seen in a static local, and returns
   that peak. */

int main(void) {
    // TODO: call the function with 12000, 35000, 21000 and 48000, printing
    // the current balance and the peak after each call.

    return 0;
}`,
	solution: `#include <stdio.h>

int updatePeakBalance(int currentBalancePence) {
    static int peakBalancePence = 0;
    if (currentBalancePence > peakBalancePence) {
        peakBalancePence = currentBalancePence;
    }
    return peakBalancePence;
}

int main(void) {
    int snapshots[4] = {12000, 35000, 21000, 48000};
    for (size_t i = 0; i < 4; i++) {
        int peak = updatePeakBalance(snapshots[i]);
        printf("Current: %dp | All-time peak: %dp\\n", snapshots[i], peak);
    }
    return 0;
}`
};

export const challengeQuota: HandbookExercise = {
	id: 'hb-13-challenge-quota',
	concept: 'a static quota shared across calls',
	prompt:
		'In a tournament trial, a head coach is allowed at most 2 bench review challenges per match. Write a C17 function bool requestCoachChallenge(void) that keeps a static int challengesUsed = 0;. For the first 2 calls it increments challengesUsed, prints "Challenge #n granted", and returns true. On the 3rd and any later call it prints "Challenge denied — quota of 2 exhausted!" and returns false. Test it by calling it 4 times in main, printing the call number before each call and the returned value afterwards, exactly as the expected output shows.',
	hints: [
		'The quota has to survive from one call to the next, so an ordinary local counter will not do.',
		'While challengesUsed is below 2, grant the challenge and increment; otherwise refuse without incrementing.',
		'Each branch prints its own message, and the function returns true or false for main to print.',
		'Print the call number before the function runs and the returned value after it, so the pieces form one line.'
	],
	expectedStdout: `Call 1: Challenge #1 granted (returned 1)
Call 2: Challenge #2 granted (returned 1)
Call 3: Challenge denied — quota of 2 exhausted! (returned 0)
Call 4: Challenge denied — quota of 2 exhausted! (returned 0)
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>
#include <stdbool.h>

/* TODO: declare requestCoachChallenge() here. It keeps a static counter,
   grants at most two challenges, and reports the decision. */

int main(void) {
    // TODO: call it four times, printing the call number first and the
    // returned value afterwards.

    return 0;
}`,
	solution: `#include <stdio.h>
#include <stdbool.h>

bool requestCoachChallenge(void) {
    static int challengesUsed = 0;
    if (challengesUsed < 2) {
        challengesUsed++;
        printf("Challenge #%d granted", challengesUsed);
        return true;
    }
    printf("Challenge denied — quota of 2 exhausted!");
    return false;
}

int main(void) {
    for (int call = 1; call <= 4; call++) {
        printf("Call %d: ", call);
        bool ok = requestCoachChallenge();
        printf(" (returned %d)\\n", ok);
    }
    return 0;
}`
};

export const sharedCounterSlip: HandbookExercise = {
	id: 'hb-13-shared-counter-slip',
	concept: 'returning a pointer to static storage',
	prompt:
		'In Chapter 12 we saw that returning &localVar from a function is a fatal dangling-pointer bug, because localVar lives on the stack and dies on return. What if the variable inside the function is declared static int vaultCounter = 0;? Write a C17 function int *getSharedCounterSlip(void) that increments a static int vaultCounter and returns &vaultCounter. Call it twice in main, dereference the returned pointer to add 10 directly, then call the function one more time, printing exactly the sequence shown in the expected output.',
	hints: [
		'The counter must be static inside the function, or the address you return points at a dead stack frame.',
		'Increment before returning the address, so the first call reports 1.',
		'Store the returned pointer in a local int * and read through it with *slip.',
		'Adding 10 through *slip modifies the same box that the next call increments, which is why the last answer is 13.'
	],
	expectedStdout: `After call 1: *slip = 1
After call 2: *slip = 2
After *slip += 10 in main, call 3 gives: 13
`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>
#include <stddef.h>

int *getSharedCounterSlip(void) {
    // TODO: keep a static counter, increment it on each call, and return its
    // address instead of the value.
    return NULL;
}

int main(void) {
    // TODO: call twice and print through the returned pointer, add 10 through
    // that pointer, then call once more and print the result.

    return 0;
}`,
	solution: `#include <stdio.h>

int *getSharedCounterSlip(void) {
    static int vaultCounter = 0;   // Lives in static memory, NOT the stack!
    vaultCounter++;
    return &vaultCounter;          // Safe: vaultCounter lives until main exits
}

int main(void) {
    int *slip = getSharedCounterSlip();
    printf("After call 1: *slip = %d\\n", *slip);

    slip = getSharedCounterSlip();
    printf("After call 2: *slip = %d\\n", *slip);

    *slip += 10;
    slip = getSharedCounterSlip();
    printf("After *slip += 10 in main, call 3 gives: %d\\n", *slip);

    return 0;
}`
};
