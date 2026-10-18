import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 19 exercises: the header/source split inside one translation unit.
 *
 * The browser editor compiles a single file, so each program below inlines the
 * interface half (include guard, struct, prototypes) at the top and the
 * implementation half below it. That is exactly the discipline a real
 * `ledger.h` / `ledger.c` pair enforces, minus the second file.
 */

export const interestModule: HandbookExercise = {
	id: 'hb-19-interest-module',
	concept: 'a guarded interface and its implementation in one file',
	prompt:
		'Write a complete C17 program that structures an interest calculation module the way a header and source pair would. Begin with an include guard named INTEREST_H, a typedef struct called SavingsPot with the fields int potId, int balancePence and int rateBasisPoints, and prototypes for void initSavingsPot(SavingsPot *pot, int id, int initialPence, int rateBps) and int creditYearlyInterest(SavingsPot *pot). Then implement both functions and write main to open pot 10 with 200000 pence at 450 basis points, print the opening line, credit one year of interest, and print the amount credited and the closing balance.',
	hints: [
		'The guard wraps the interface only: struct and prototypes inside it, #endif before the first function body.',
		'Interest is worked out in basis points, so divide by 10000, not 100: 450 bps is 4.50 percent and 9000 pence on 200000.',
		'Compute and store the interest before you change the balance, then return the amount credited.',
		'Print the opening line before crediting interest, or the receipt will show the closing balance twice.'
	],
	expectedStdout: `Pot #10 opened with 200000 pence at 450 bps (4.50%)
Interest credited: 9000 pence
Closing pot balance: 209000 pence (£2090.00)`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

/* === 1. Interface half: pretend this block lives in interest.h === */
#ifndef INTEREST_H
#define INTEREST_H

typedef struct {
    int potId;
    int balancePence;
    int rateBasisPoints;
} SavingsPot;

/* TODO: declare initSavingsPot() and creditYearlyInterest() here. */

#endif /* INTEREST_H */

/* === 2. Implementation half === */

/* TODO: define initSavingsPot(): copy the id, the opening balance and the
   rate into the struct the caller points at. */

/* TODO: define creditYearlyInterest(): work out one year of interest in
   pence, add it to the balance, and return the amount credited. */

int main(void) {
    // TODO: open pot 10 with 200000 pence at 450 basis points, print the
    // opening line, credit one year, then print the receipt.

    return 0;
}`,
	solution: `#include <stdio.h>

/* === 1. Interface half: pretend this block lives in interest.h === */
#ifndef INTEREST_H
#define INTEREST_H

typedef struct {
    int potId;
    int balancePence;
    int rateBasisPoints;
} SavingsPot;

void initSavingsPot(SavingsPot *pot, int id, int initialPence, int rateBps);
int creditYearlyInterest(SavingsPot *pot);

#endif /* INTEREST_H */

/* === 2. Implementation half === */
void initSavingsPot(SavingsPot *pot, int id, int initialPence, int rateBps) {
    pot->potId = id;
    pot->balancePence = initialPence;
    pot->rateBasisPoints = rateBps;
}

int creditYearlyInterest(SavingsPot *pot) {
    int interest = (pot->balancePence * pot->rateBasisPoints) / 10000;
    pot->balancePence += interest;
    return interest;
}

int main(void) {
    SavingsPot isa;
    initSavingsPot(&isa, 10, 200000, 450);

    printf("Pot #%d opened with %d pence at %d bps (%.2f%%)\\n",
           isa.potId, isa.balancePence, isa.rateBasisPoints,
           (double)isa.rateBasisPoints / 100.0);

    int earned = creditYearlyInterest(&isa);
    printf("Interest credited: %d pence\\n", earned);
    printf("Closing pot balance: %d pence (£%d.%02d)\\n",
           isa.balancePence, isa.balancePence / 100, isa.balancePence % 100);

    return 0;
}`
};

export const guardTwice: HandbookExercise = {
	id: 'hb-19-guard-twice',
	concept: 'include guards and repeated header text',
	prompt:
		'Prove that an include guard prevents double inclusion. Write a complete C17 program whose guarded MATCH_STATS_H block is pasted twice in a row at the top of the file: the block declares a ShotStats struct with the fields int totalShots and int shotsOnTarget plus a prototype for int computeShotAccuracyPercent(const ShotStats *s). Implement the function to return 0 when there are no shots and otherwise on-target shots times 100 divided by total shots, then have main build Rovers stats of 15 shots and 9 on target and print the accuracy, the on-target count and the shot count on one line. The program must compile with no redefinition errors, which is the proof that the second copy was skipped.',
	hints: [
		'Paste the entire guarded block a second time, guard and all; that is what a duplicate include path looks like to the preprocessor.',
		'The second copy is skipped because MATCH_STATS_H is already defined by the first copy.',
		'Keep the arithmetic in integers: on target times 100, divided by total shots.',
		'Guard the division by returning 0 first when totalShots is not positive.'
	],
	expectedStdout: `Header guard test passed! Rovers shot accuracy: 60% (9 on target / 15 shots)`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>

/* First inclusion of match_stats.h */
#ifndef MATCH_STATS_H
#define MATCH_STATS_H

typedef struct {
    int totalShots;
    int shotsOnTarget;
} ShotStats;

int computeShotAccuracyPercent(const ShotStats *s);

#endif /* MATCH_STATS_H */

/* TODO: paste the identical guarded block a second time, then add a short
   comment saying why the preprocessor ignores it. */

/* TODO: define computeShotAccuracyPercent(). */

int main(void) {
    // TODO: build the Rovers stats and print the guard test line.

    return 0;
}`,
	solution: `#include <stdio.h>

/* First inclusion of match_stats.h */
#ifndef MATCH_STATS_H
#define MATCH_STATS_H

typedef struct {
    int totalShots;
    int shotsOnTarget;
} ShotStats;

int computeShotAccuracyPercent(const ShotStats *s);

#endif /* MATCH_STATS_H */

/* Second (accidental duplicate) inclusion of match_stats.h, safely skipped
   because MATCH_STATS_H is already defined. */
#ifndef MATCH_STATS_H
#define MATCH_STATS_H

typedef struct {
    int totalShots;
    int shotsOnTarget;
} ShotStats;

int computeShotAccuracyPercent(const ShotStats *s);

#endif /* MATCH_STATS_H */

int computeShotAccuracyPercent(const ShotStats *s) {
    if (s->totalShots <= 0) {
        return 0;
    }
    return (s->shotsOnTarget * 100) / s->totalShots;
}

int main(void) {
    ShotStats rovers = { .totalShots = 15, .shotsOnTarget = 9 };
    printf("Header guard test passed! Rovers shot accuracy: %d%% (%d on target / %d shots)\\n",
           computeShotAccuracyPercent(&rovers),
           rovers.shotsOnTarget,
           rovers.totalShots);
    return 0;
}`
};

export const linkerDiagnosis: HandbookExercise = {
	id: 'hb-19-linker-diagnosis',
	concept: 'compiler errors versus linker errors',
	prompt:
		'The single-file program below is meant to print a diagnosis of two build errors, but it has three header-discipline bugs. Fix them so it compiles cleanly with -Wall -Wextra -Werror and prints the report as shown. Bug one: main calls taxDuePence before the compiler has seen any declaration of it, and the declaration the interface block owes its callers is missing. Bug two: the TAX_REPORT_H guard opens and never closes. Bug three: the last printf passes an int where the format string expects a string. Read the first compiler message, fix it, and recompile before looking at the next one.',
	hints: [
		'Start at the first message, not the last: the later errors are often noise until the first one is gone.',
		'The declaration belongs in the guarded interface block, above main, and it has to repeat the static keyword that the definition uses.',
		'Close the guard immediately after the last prototype, before the first definition, so the implementation half is outside it.',
		'Match every format specifier to its argument: the tax figure is an int.'
	],
	expectedStdout: `Error 1 (implicit declaration): COMPILER error.
  Fix: declare the prototype above main, or move the definition above its caller.

Error 2 (Undefined symbols):    LINKER error.
  Fix: pass every .c file to the compiler: cc -std=c17 -Wall main.c tax.c -o app
Sample band: 50000 pence due on 250000 pence gross`,
	expectedExitCode: 0,
	starter: `// Broken code: this single file has three header-discipline bugs.
#include <stdio.h>

/* === 1. Interface half: pretend this block lives in tax_report.h === */
#ifndef TAX_REPORT_H
#define TAX_REPORT_H

typedef struct {
    int grossPence;
    int ratePercent;
} TaxBand;

/* Bug 1: main() calls taxDuePence(), but no declaration of it is visible
   yet. Add the prototype here, keeping the static keyword. */

/* Bug 2: this guard opens and never closes. */

int main(void) {
    TaxBand band = { 250000, 20 };

    printf("Error 1 (implicit declaration): COMPILER error.\\n");
    printf("  Fix: declare the prototype above main, or move the definition above its caller.\\n\\n");
    printf("Error 2 (Undefined symbols):    LINKER error.\\n");
    printf("  Fix: pass every .c file to the compiler: cc -std=c17 -Wall main.c tax.c -o app\\n");

    int due = taxDuePence(&band);
    printf("Sample band: %s pence due on %d pence gross\\n", due, band.grossPence);
    return 0;
}

static int taxDuePence(const TaxBand *band) {
    return (band->grossPence * band->ratePercent) / 100;
}`,
	solution: `#include <stdio.h>

/* === 1. Interface half: pretend this block lives in tax_report.h === */
#ifndef TAX_REPORT_H
#define TAX_REPORT_H

typedef struct {
    int grossPence;
    int ratePercent;
} TaxBand;

static int taxDuePence(const TaxBand *band);

#endif /* TAX_REPORT_H */

/* === 2. Implementation half === */
int main(void) {
    TaxBand band = { 250000, 20 };

    printf("Error 1 (implicit declaration): COMPILER error.\\n");
    printf("  Fix: declare the prototype above main, or move the definition above its caller.\\n\\n");
    printf("Error 2 (Undefined symbols):    LINKER error.\\n");
    printf("  Fix: pass every .c file to the compiler: cc -std=c17 -Wall main.c tax.c -o app\\n");

    int due = taxDuePence(&band);
    printf("Sample band: %d pence due on %d pence gross\\n", due, band.grossPence);
    return 0;
}

static int taxDuePence(const TaxBand *band) {
    return (band->grossPence * band->ratePercent) / 100;
}`
};