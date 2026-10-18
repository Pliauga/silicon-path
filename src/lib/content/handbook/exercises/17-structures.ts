import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 17 exercises. Handbook MDX spreads each record into `<ExerciseCard>`.
 * Every program is single-file: the struct typedefs live inline, and no task
 * needs malloc, headers of its own, or command-line arguments.
 */

export const branchLedgerAudit: HandbookExercise = {
	id: 'hb-17-branch-ledger-audit',
	concept: 'arrays of structs and pointers to struct',
	prompt:
		"Create a `typedef struct` named `BankAccount` with `char holder[20]`, `int id`, and `int balancePence`. In `main`, initialise an array of three accounts: Leo Vance (ID 101, 145000 pence), Maya Lin (ID 102, 320000 pence), and Samira Khan (ID 103, 95000 pence). Write a function `const BankAccount *findRichestAccount(const BankAccount accounts[], size_t count)` that returns a pointer to the account with the highest `balancePence`, then print the winner's name, ID, and balance in `main` using the arrow operator.",
	hints: [
		'The function returns a pointer, so it should remember an address rather than a copy: begin with `&accounts[0]` as the candidate.',
		'Loop from index 1. Index 0 is already your candidate, so comparing it with itself wastes a turn but breaks nothing.',
		'Compare each `accounts[i].balancePence` with `best->balancePence` and move the pointer when you find a larger one.',
		'Print through the returned pointer with `->`, and split the balance with `/ 100` and `% 100` so the pence part keeps two digits.'
	],
	expectedStdout: `Audited 3 accounts.
Richest account: #102 (Maya Lin) with 320000 pence (£3200.00)`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

typedef struct {
    char holder[20];
    int id;
    int balancePence;
} BankAccount;

const BankAccount *findRichestAccount(const BankAccount accounts[], size_t count) {
    // TODO: walk the array and return a pointer to the account with the
    // highest balancePence. Returning the first account is a placeholder.
    (void)count;
    return &accounts[0];
}

int main(void) {
    // TODO: fill in the three accounts with designated initialisers:
    // Leo Vance (101, 145000), Maya Lin (102, 320000), Samira Khan (103, 95000).
    BankAccount branch[3] = {0};

    // TODO: call findRichestAccount, then print the audit line for the winner
    // through the returned pointer, using -> for every field.
    (void)branch;

    return 0;
}`,
	solution: `#include <stdio.h>

typedef struct {
    char holder[20];
    int id;
    int balancePence;
} BankAccount;

const BankAccount *findRichestAccount(const BankAccount accounts[], size_t count) {
    const BankAccount *best = &accounts[0];
    for (size_t i = 1; i < count; i++) {
        if (accounts[i].balancePence > best->balancePence) {
            best = &accounts[i];
        }
    }
    return best;
}

int main(void) {
    BankAccount branch[3] = {
        { .holder = "Leo Vance",   .id = 101, .balancePence = 145000 },
        { .holder = "Maya Lin",    .id = 102, .balancePence = 320000 },
        { .holder = "Samira Khan", .id = 103, .balancePence = 95000  }
    };

    const BankAccount *richest = findRichestAccount(branch, 3);

    printf("Audited %zu accounts.\\n", sizeof(branch) / sizeof(branch[0]));
    printf("Richest account: #%d (%s) with %d pence (£%d.%02d)\\n",
           richest->id, richest->holder, richest->balancePence,
           richest->balancePence / 100, richest->balancePence % 100);

    return 0;
}`
};

export const leagueTableUpdate: HandbookExercise = {
	id: 'hb-17-league-table-update',
	concept: 'updating a struct through a pointer',
	prompt:
		"Define a `typedef struct` named `ClubRecord` with fields `char club[20]`, `int played`, `int wins`, `int draws`, `int losses`, and `int points`. Write a function `void recordMatchResult(ClubRecord *home, ClubRecord *away, int homeGoals, int awayGoals)` that updates `played`, `wins`, `draws`, `losses`, and `points` for both clubs through their pointers. Test it in `main` when Rovers (10 played, 6W 2D 2L, 20 points) beat Athletic (10 played, 5W 3D 2L, 18 points) by 3 - 1, then print both rows with the supplied `printClubRow` helper.",
	hints: [
		'Both clubs played, so both records need `played++` before the score decides anything else.',
		'The score has three branches: home win, draw, away win. Each branch touches the counters of both clubs.',
		'A win is 3 points and a draw is 1 point each. The losing club still takes a loss, even though it earns nothing.',
		'`printClubRow` already exists; your work is the updater and the two designated initialisers in `main`.'
	],
	expectedStdout: `After Rovers 3 - 1 Athletic:
Rovers   | P:11 W:7 D:2 L:2 | Pts: 23
Athletic | P:11 W:5 D:3 L:3 | Pts: 18`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

typedef struct {
    char club[20];
    int played;
    int wins;
    int draws;
    int losses;
    int points;
} ClubRecord;

void printClubRow(const ClubRecord *c) {
    printf("%-8s | P:%2d W:%d D:%d L:%d | Pts: %2d\\n",
           c->club, c->played, c->wins, c->draws, c->losses, c->points);
}

void recordMatchResult(ClubRecord *home, ClubRecord *away,
                       int homeGoals, int awayGoals) {
    // TODO: increment played on both records, then update wins, draws and
    // losses from the score. A win is worth 3 points, a draw 1 point each.
    (void)home;
    (void)away;
    (void)homeGoals;
    (void)awayGoals;
}

int main(void) {
    // TODO: initialise both clubs with designated initialisers.
    ClubRecord rovers = {0};
    ClubRecord athletic = {0};
    (void)rovers;
    (void)athletic;

    // TODO: record a 3 - 1 home win, print the heading, then print both rows.

    return 0;
}`,
	solution: `#include <stdio.h>

typedef struct {
    char club[20];
    int played;
    int wins;
    int draws;
    int losses;
    int points;
} ClubRecord;

void recordMatchResult(ClubRecord *home, ClubRecord *away,
                       int homeGoals, int awayGoals) {
    home->played++;
    away->played++;

    if (homeGoals > awayGoals) {
        home->wins++;
        home->points += 3;
        away->losses++;
    } else if (homeGoals == awayGoals) {
        home->draws++;
        home->points += 1;
        away->draws++;
        away->points += 1;
    } else {
        away->wins++;
        away->points += 3;
        home->losses++;
    }
}

void printClubRow(const ClubRecord *c) {
    printf("%-8s | P:%2d W:%d D:%d L:%d | Pts: %2d\\n",
           c->club, c->played, c->wins, c->draws, c->losses, c->points);
}

int main(void) {
    ClubRecord rovers = {
        .club = "Rovers",   .played = 10, .wins = 6, .draws = 2, .losses = 2, .points = 20
    };
    ClubRecord athletic = {
        .club = "Athletic", .played = 10, .wins = 5, .draws = 3, .losses = 2, .points = 18
    };

    recordMatchResult(&rovers, &athletic, 3, 1);

    printf("After Rovers 3 - 1 Athletic:\\n");
    printClubRow(&rovers);
    printClubRow(&athletic);

    return 0;
}`
};

export const structPaddingBugs: HandbookExercise = {
	id: 'hb-17-struct-padding-bugs',
	concept: 'struct padding and reading diagnostics',
	prompt:
		'The program below should print the size of two structs that hold the same three fields in different orders, and state where the padding goes. It contains four beginner bugs: one syntax error, one struct whose fields are declared in the wrong order, and two mistakes in the `printf` calls. Fix all four so it compiles with zero warnings under `cc -std=c17 -Wall -Wextra -Wpedantic` and prints the expected output.',
	hints: [
		'Start with the first compiler error. A missing semicolon after a closing brace stops the file from parsing, and every later message is noise.',
		'`sizeof` produces a `size_t`, so its format specifier is not `%d`.',
		'Padding appears when a four-byte `int` must begin on a four-byte boundary. Which field order forces the compiler to leave gaps, and which packs the fields tightly?',
		'Each `printf` line should report its own type. Check that the second call names the struct in its own label.'
	],
	expectedStdout: `sizeof(PaddedBox)  = 12 bytes (3 bytes padding after tagA + 3 bytes after tagB)
sizeof(CompactBox) = 8 bytes  (amount takes 4, tagA + tagB + 2 padding takes 4)`,
	expectedExitCode: 0,
	starter: `// Broken code: find all four bugs.
#include <stdio.h>

typedef struct {
    int amount;
    char tagA;
    char tagB;
} PaddedBox

typedef struct {
    int amount;
    char tagA;
    char tagB;
} CompactBox;

int main(void) {
    printf("sizeof(PaddedBox)  = %d bytes (3 bytes padding after tagA + 3 bytes after tagB)\\n",
           sizeof(PaddedBox));
    printf("sizeof(CompactBox) = %zu bytes  (amount takes 4, tagA + tagB + 2 padding takes 4)\\n",
           sizeof(PaddedBox));

    return 0;
}`,
	solution: `#include <stdio.h>

typedef struct {
    char tagA;
    int amount;
    char tagB;
} PaddedBox;

typedef struct {
    int amount;
    char tagA;
    char tagB;
} CompactBox;

int main(void) {
    printf("sizeof(PaddedBox)  = %zu bytes (3 bytes padding after tagA + 3 bytes after tagB)\\n",
           sizeof(PaddedBox));
    printf("sizeof(CompactBox) = %zu bytes  (amount takes 4, tagA + tagB + 2 padding takes 4)\\n",
           sizeof(CompactBox));

    return 0;
}`
};