import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 14 exercises. Handbook MDX spreads each record into `<ExerciseCard>`.
 * The C source lives here rather than in MDX attributes so blank lines survive,
 * the editor receives an exact program, and the data is type-checked.
 */

export const refactoredAccounts: HandbookExercise = {
	id: 'hb-14-refactored-accounts',
	concept: 'replacing mutable globals with pointer parameters',
	prompt:
		'The program below keeps both account balances in mutable globals (gAccountA and gAccountB), so each fee function is welded to one fixed account. Refactor it into a clean C17 program with zero mutable globals: keep const int MONTHLY_FEE_PENCE = 250; at file scope, move both balances into main, and replace the two fee functions with a single void applyFee(int *accountSlip) that takes the account to update. Call it once per account, then print the fee constant and both new balances on the two lines shown in the expected output.',
	hints: [
		'Delete the two globals first. The compiler will then point at every function that depended on them.',
		'A pointer parameter carries both the identity of the account and the permission to change it: *accountSlip -= MONTHLY_FEE_PENCE; updates the integer the caller owns.',
		'Call applyFee twice before printing anything, once with &accountA and once with &accountB.',
		'Print the constant on its own line, then both balances on one line with two %d conversions.'
	],
	expectedStdout: `Fee constant: 250 pence
After monthly fee -> Account A: 9750 pence, Account B: 4250 pence`,
	expectedExitCode: 0,
	starter: `// Spaghetti global version: refactor me.
#include <stdio.h>

const int MONTHLY_FEE_PENCE = 250;

// TODO: delete both mutable globals and move the balances into main.
int gAccountA = 10000;
int gAccountB = 4500;

void applyFeeToA(void) {
    // TODO: replace this function with applyFee(int *accountSlip).
    gAccountA -= MONTHLY_FEE_PENCE;
}

void applyFeeToB(void) {
    // TODO: replace this function with the same pointer version.
    gAccountB -= MONTHLY_FEE_PENCE;
}

int main(void) {
    // TODO: declare accountA and accountB here, with the same values.

    // TODO: apply the fee to each account through a pointer.

    // TODO: print the fee constant, then both balances.

    return 0;
}`,
	solution: `#include <stdio.h>

const int MONTHLY_FEE_PENCE = 250;

void applyFee(int *accountSlip) {
    *accountSlip -= MONTHLY_FEE_PENCE;
}

int main(void) {
    int accountA = 10000;
    int accountB = 4500;

    applyFee(&accountA);
    applyFee(&accountB);

    printf("Fee constant: %d pence\\n", MONTHLY_FEE_PENCE);
    printf("After monthly fee -> Account A: %d pence, Account B: %d pence\\n",
           accountA, accountB);

    return 0;
}`
};

export const attendanceGate: HandbookExercise = {
	id: 'hb-14-attendance-gate',
	concept: 'file-private state behind accessor functions',
	prompt:
		'A stadium turnstile module has to remember how many supporters are inside, but no other part of the program should be able to overwrite that count directly. Write a complete C17 program with static int sTotalStadiumAttendance = 0; and const int MAX_STADIUM_CAPACITY = 20000; at file scope, plus two functions. bool admitGroup(int groupSize) adds the group only when the stadium still has room and returns true when admitted, false when rejected. int getCurrentAttendance(void) returns the current count. Send three groups through it (12000, 7500 and 1000 supporters) and print one line per group.',
	hints: [
		'Mark the counter static so it has internal linkage: the name is visible throughout this file and nowhere else.',
		'Check whether the group fits before you change anything. If it does not, return false without adding.',
		'Reject a negative group size as well, or a bogus group silently frees up capacity.',
		'Print the decision with a conditional expression, and read the running total back through getCurrentAttendance() rather than touching the static directly.'
	],
	expectedStdout: `Admit 12000: APPROVED -> Attendance: 12000 / 20000
Admit 7500: APPROVED -> Attendance: 19500 / 20000
Admit 1000: REJECTED -> Attendance: 19500 / 20000`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>
#include <stdbool.h>

const int MAX_STADIUM_CAPACITY = 20000;
static int sTotalStadiumAttendance = 0;

bool admitGroup(int groupSize) {
    // TODO: reject a group that would overflow the stadium or is negative.
    if (groupSize <= 0) {
        return false;
    }

    // TODO: otherwise add it to sTotalStadiumAttendance and return true.
    return false;
}

int getCurrentAttendance(void) {
    // TODO: return the running total.
    return sTotalStadiumAttendance;
}

int main(void) {
    int groups[3] = {12000, 7500, 1000};

    for (size_t i = 0; i < 3; i++) {
        bool admitted = admitGroup(groups[i]);
        // TODO: add the running total and the capacity to this line.
        printf("Admit %d: %s\\n", groups[i], admitted ? "APPROVED" : "REJECTED");
    }

    return 0;
}`,
	solution: `#include <stdio.h>
#include <stdbool.h>

const int MAX_STADIUM_CAPACITY = 20000;
static int sTotalStadiumAttendance = 0;

bool admitGroup(int groupSize) {
    if (groupSize < 0 ||
        sTotalStadiumAttendance + groupSize > MAX_STADIUM_CAPACITY) {
        return false;
    }
    sTotalStadiumAttendance += groupSize;
    return true;
}

int getCurrentAttendance(void) {
    return sTotalStadiumAttendance;
}

int main(void) {
    int groups[3] = {12000, 7500, 1000};

    for (size_t i = 0; i < 3; i++) {
        bool ok = admitGroup(groups[i]);
        printf("Admit %d: %s -> Attendance: %d / %d\\n",
               groups[i],
               ok ? "APPROVED" : "REJECTED",
               getCurrentAttendance(),
               MAX_STADIUM_CAPACITY);
    }

    return 0;
}`
};

export const shadowingBugs: HandbookExercise = {
	id: 'hb-14-shadowing-bugs',
	concept: 'global versus local shadowing',
	prompt:
		'The program below is supposed to print the four trace lines in the expected output, but two statements are wrong. Inside incrementGlobal() the counter is replaced instead of increased by five, and inside shadowGlobal() the write lands on the global instead of on a new local variable of the same name. Fix both bugs so the four lines print, and make sure gCounter is still 15 when main prints line 4.',
	hints: [
		'Run it and compare the output with the four expected lines; the first line that differs tells you which function to read.',
		'One function needs an arithmetic assignment that adds to the existing value rather than replacing it.',
		'To shadow a global, the inner function needs its own declaration of the same name. Without the type and the name, the statement simply assigns to the global.',
		'Check the order of the printed lines once both fixes are in: line 4 must still report 15, not 999.'
	],
	expectedStdout: `1. Start in main:            gCounter = 10
2. Inside incrementGlobal(): gCounter = 15
3. Inside shadowGlobal():    local gCounter = 999
4. Back in main:             gCounter = 15`,
	expectedExitCode: 0,
	starter: `// Broken code: find both bugs.
#include <stdio.h>

int gCounter = 10;

void incrementGlobal(void) {
    gCounter = 5;            // BUG: this replaces the counter instead of raising it.
    printf("2. Inside incrementGlobal(): gCounter = %d\\n", gCounter);
}

void shadowGlobal(void) {
    gCounter = 999;          // BUG: no local declaration, so this writes the global.
    printf("3. Inside shadowGlobal():    local gCounter = %d\\n", gCounter);
}

int main(void) {
    printf("1. Start in main:            gCounter = %d\\n", gCounter);
    incrementGlobal();
    shadowGlobal();
    printf("4. Back in main:             gCounter = %d\\n", gCounter);
    return 0;
}`,
	solution: `#include <stdio.h>

int gCounter = 10;

void incrementGlobal(void) {
    gCounter += 5;
    printf("2. Inside incrementGlobal(): gCounter = %d\\n", gCounter);
}

void shadowGlobal(void) {
    int gCounter = 999;   // Local variable shadows global gCounter!
    printf("3. Inside shadowGlobal():    local gCounter = %d\\n", gCounter);
}

int main(void) {
    printf("1. Start in main:            gCounter = %d\\n", gCounter);
    incrementGlobal();
    shadowGlobal();
    printf("4. Back in main:             gCounter = %d\\n", gCounter);
    return 0;
}`
};