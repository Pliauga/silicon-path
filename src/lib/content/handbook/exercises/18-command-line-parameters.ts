import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 18 exercises: `argc`, `argv`, and safe parsing with `strtol`.
 *
 * The handbook runner supplies no command-line arguments, so every program here
 * keeps `int main(int argc, char *argv[])` and falls back to a simulated
 * argument array when `argc == 1`. That way the authored expected output is
 * reachable in the browser and from a bare `./program` in a terminal. The MDX
 * spreads each record into `<ExerciseCard>`; keeping the C source here means
 * blank lines survive and every solution can be compiled by the verify script.
 */

export const penceSplitter: HandbookExercise = {
	id: 'hb-18-pence-splitter',
	concept: 'argv as an array of strings, strtol validation',
	prompt:
		'Write a complete C17 program that accepts any number of pence amounts on the command line and falls back to the simulated array {"./splitter", "1999", "450", "12005"} when the runner supplies no arguments, that is when argc is 1. For each argument from index 1 onward, parse it with strtol, add it to a grand total, and print the item number, the amount in pence, and the same amount as £x.yy. Finish with one total line. Reject an argument that is not a whole number: report it on stderr and return 1. Keep main as int main(int argc, char *argv[]) and copy the column layout of the expected output exactly.',
	hints: [
		'Decide the number of items and where each text lives before you parse anything: argc tells you the first, the fallback array tells you the second.',
		'When argc is 1 there are no real arguments, so read the simulated array at the same index instead. Both are const char *, so no cast is needed.',
		'Check the parse before you trust the value: end == text means nothing was converted, and *end != \'\\0\' means the number had trailing rubbish.',
		'Pence to pounds is value / 100 and value % 100, printed with %ld and %02ld.'
	],
	starter: `#include <stdio.h>
#include <stdlib.h>

int main(int argc, char *argv[]) {
    /* TODO: when the runner supplies no arguments (argc == 1), fall back to a
       simulated list such as {"./splitter", "1999", "450", "12005"}.
       TODO: otherwise read the real argv from index 1 onward.
       TODO: parse each amount with strtol and add it to a running total.
       TODO: print one Item line per amount, then the grand total. */
    (void)argc;
    (void)argv;

    return 0;
}`,
	solution: `#include <stdio.h>
#include <stdlib.h>

int main(int argc, char *argv[]) {
    const char *fallbackArgs[] = {"./splitter", "1999", "450", "12005"};
    int count = (argc > 1) ? argc : 4;

    long totalPence = 0;
    for (int i = 1; i < count; i++) {
        // Real arguments win; with none supplied, read the simulated list.
        const char *text = (argc > 1) ? argv[i] : fallbackArgs[i];

        char *end = NULL;
        long value = strtol(text, &end, 10);
        if (end == text || *end != '\\0') {
            fprintf(stderr, "Invalid amount: %s\\n", text);
            return 1;
        }

        totalPence += value;
        printf("Item %d: %ldp (£%ld.%02ld)\\n", i, value, value / 100, value % 100);
    }

    printf("Total across %d items: %ldp (£%ld.%02ld)\\n",
           count - 1, totalPence, totalPence / 100, totalPence % 100);
    return 0;
}`,
	expectedStdout: `Item 1: 1999p (£19.99)
Item 2: 450p (£4.50)
Item 3: 12005p (£120.05)
Total across 3 items: 14454p (£144.54)`,
	expectedExitCode: 0
};

export const matchCli: HandbookExercise = {
	id: 'hb-18-match-cli',
	concept: 'parsing flags with strcmp and strtol',
	prompt:
		"Write a C17 function void parseMatchCli(int count, const char *args[]) that walks args from index 1 to count - 1 and recognises three flags. On --verbose it records that verbose mode is on. On --club it takes the next word as the club name, and on --wins it takes the next word and parses it with strtol. After the walk it prints [VERBOSE MODE ON] only when that flag was seen, then one summary line with the club, the wins, and the league points (three per win). Test it from main with the simulated list {\"./match_cli\", \"--verbose\", \"--club\", \"Rovers\", \"--wins\", \"21\"} when argc is 1, and with the real arguments otherwise. Keep main as int main(int argc, char *argv[]) and include <string.h> and <stdbool.h>.",
	hints: [
		'One for loop over the indexes, three if branches inside it. The flags are ordinary strings, so compare them with strcmp against the whole word.',
		'A flag that carries a value consumes the next slot: check i + 1 < count first, then read args[++i] and let the loop skip that value.',
		'Give the club and the wins safe starting values before the loop, so a command line with no flags still prints something sensible.',
		'strtol(args[++i], NULL, 10) parses the win count; this program only needs the value, not the stopping point.'
	],
	starter: `#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <string.h>

/* TODO: declare parseMatchCli(int count, const char *args[]) here. It walks the
   list from index 1, recognises --verbose, --club NAME and --wins N, then prints
   the banner and the one-line summary. */

int main(int argc, char *argv[]) {
    /* TODO: fall back to the simulated list
       {"./match_cli", "--verbose", "--club", "Rovers", "--wins", "21"}
       when argc == 1; otherwise pass the real arguments through. */
    (void)argc;
    (void)argv;

    return 0;
}`,
	solution: `#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <string.h>

void parseMatchCli(int count, const char *args[]) {
    bool verbose = false;
    const char *club = "Unknown";
    long wins = 0;

    for (int i = 1; i < count; i++) {
        if (strcmp(args[i], "--verbose") == 0) {
            verbose = true;
        } else if (strcmp(args[i], "--club") == 0 && i + 1 < count) {
            club = args[++i];
        } else if (strcmp(args[i], "--wins") == 0 && i + 1 < count) {
            wins = strtol(args[++i], NULL, 10);
        }
    }

    if (verbose) {
        printf("[VERBOSE MODE ON]\\n");
    }
    printf("Club: %s | Wins: %ld | League Points: %ld\\n",
           club, wins, wins * 3);
}

int main(int argc, char *argv[]) {
    const char *simArgs[] = {
        "./match_cli", "--verbose", "--club", "Rovers", "--wins", "21"
    };

    if (argc > 1) {
        parseMatchCli(argc, (const char **)argv);
    } else {
        parseMatchCli(6, simArgs);
    }
    return 0;
}`,
	expectedStdout: `[VERBOSE MODE ON]
Club: Rovers | Wins: 21 | League Points: 63`,
	expectedExitCode: 0
};

export const nullSentinelBugs: HandbookExercise = {
	id: 'hb-18-null-sentinel-bugs',
	concept: 'walking argv through its trailing NULL sentinel',
	prompt:
		"The program below is supposed to walk a null-terminated argument array using only the trailing NULL sentinel, without consulting a count, and print every argument after the program name. It contains three bugs: one the compiler refuses, and two it will happily compile. Fix all three so the program compiles with zero warnings and prints the four arguments followed by the sentinel line. Keep int main(int argc, char *argv[]) and keep the fallback: when argc is 1 walk the simulated list, otherwise walk the real argv from argv[1].",
	hints: [
		'Fix the compiler diagnostic first. printf takes the string, but an argument array holds pointers to strings, so one dereference is missing.',
		'Look closely at the loop condition: the pointer variable itself is never NULL, only what it points at can be.',
		'The program name occupies index 0. The walk must start at the slot after it, or the first line of output will be ./bank_app.',
		'Write the loop as a pointer walk over a const char ** that starts one slot past the list head, then stop when the pointed-at slot is NULL.'
	],
	starter: `// Broken code: find all three bugs.
#include <stdio.h>

int main(int argc, char *argv[]) {
    (void)argc;
    (void)argv;

    const char *simArgv[] = {
        "./bank_app", "--deposit", "5000", "--branch", "North", NULL
    };

    for (const char **arg = simArgv; arg != NULL; arg++) {
        printf("Arg: %s\\n", arg);
    }
    printf("Reached NULL sentinel!\\n");

    return 0;
}`,
	solution: `#include <stdio.h>

int main(int argc, char *argv[]) {
    const char *simArgv[] = {
        "./bank_app", "--deposit", "5000", "--branch", "North", NULL
    };
    const char **list = (argc > 1) ? (const char **)argv : simArgv;

    // Start after the program name and stop at the guaranteed NULL sentinel.
    for (const char **arg = list + 1; *arg != NULL; arg++) {
        printf("Arg: %s\\n", *arg);
    }
    printf("Reached NULL sentinel!\\n");

    return 0;
}`,
	expectedStdout: `Arg: --deposit
Arg: 5000
Arg: --branch
Arg: North
Reached NULL sentinel!`,
	expectedExitCode: 0
};