/**
 * The three lab exercises on `/reference`.
 *
 * They are deliberately small: each one isolates a single idea that the
 * lecture prose states but does not let the student touch — a branch, a
 * comparison, a write through a pointer. Every program is self-contained
 * (no stdin), because an exercise card runs with an empty input buffer and a
 * `scanf` would otherwise hand every student EOF and a failed check.
 */

export interface LabExercise {
	readonly id: string;
	readonly prompt: string;
	readonly concept: string;
	readonly starter: string;
	readonly solution: string;
	readonly expectedStdout: string;
	readonly hints: readonly string[];
}

export const labExercises: readonly LabExercise[] = [
	{
		id: 'lab-voting-eligibility',
		concept: 'if / else',
		prompt:
			'An age of 18 or more is eligible to vote. Starting from `age = 20`, print exactly `Eligible` when the condition holds and `Not eligible` otherwise. Then change the value to 16 and confirm the other branch runs.',
		starter: `#include <stdio.h>

int main(void) {
    int age = 20;

    /* TODO: print "Eligible" or "Not eligible" */
    printf("%d\\n", age);

    return 0;
}
`,
		solution: `#include <stdio.h>

int main(void) {
    int age = 20;

    if (age >= 18) {
        printf("Eligible\\n");
    } else {
        printf("Not eligible\\n");
    }

    return 0;
}
`,
		expectedStdout: 'Eligible\n',
		hints: [
			'Compare with `>=`, not `==`: 18 itself is eligible.',
			'Both branches need braces if you want to add a line later; C only needs them for multi-line bodies.',
			'Print the string with a newline: `printf("Eligible\\n");`.'
		]
	},
	{
		id: 'lab-integer-comparison',
		concept: 'comparison operators',
		prompt:
			'Given `x = 3` and `y = 7`, print `greater` if x is larger, `less` if smaller, and `equal` if they match. The expected output for the starter values is `less`.',
		starter: `#include <stdio.h>

int main(void) {
    int x = 3;
    int y = 7;

    /* TODO: compare x and y, then print one of the three words */
    printf("%d %d\\n", x, y);

    return 0;
}
`,
		solution: `#include <stdio.h>

int main(void) {
    int x = 3;
    int y = 7;

    if (x > y) {
        printf("greater\\n");
    } else if (x < y) {
        printf("less\\n");
    } else {
        printf("equal\\n");
    }

    return 0;
}
`,
		expectedStdout: 'less\n',
		hints: [
			'Two comparisons cover the three cases: `x > y`, then `x < y`, else equal.',
			'A common slip is `=` (assignment) where `==` is meant — but here you do not need equality at all.',
			'Order matters: the `else if` chain is only reached when the earlier condition was false.'
		]
	},
	{
		id: 'lab-pointer-basics',
		concept: 'dereference and write',
		prompt:
			'`n` starts at 41. Without touching `n` directly, make it 42 by writing through `p`, then print `n`. The program must print `42`.',
		starter: `#include <stdio.h>

int main(void) {
    int n = 41;
    int *p = &n;

    /* TODO: change n through p */

    printf("%d\\n", n);

    return 0;
}
`,
		solution: `#include <stdio.h>

int main(void) {
    int n = 41;
    int *p = &n;

    *p = *p + 1;

    printf("%d\\n", n);

    return 0;
}
`,
		expectedStdout: '42\n',
		hints: [
			'`*p` is an lvalue: it names the cell `p` points at, so it can sit on the left of `=`.',
			'`*p += 1;` and `*p = *p + 1;` mean the same thing here.',
			'`p = p + 1;` would move the pointer instead — that is the mistake this exercise is fishing for.'
		]
	}
];