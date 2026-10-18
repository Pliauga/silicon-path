import type { HandbookExercise } from '$lib/content/types';

/**
 * Chapter 8 exercises. Handbook MDX spreads each record into `<ExerciseCard>`.
 * Every solution compiles under cc -std=c11 -Wall -Wextra -Werror and writes
 * the stdout the chapter promises, so the grader's diff is exact.
 */

export const accountMasker: HandbookExercise = {
	id: 'hb-08-account-masker',
	concept: 'strings, strlen, and in-place editing',
	prompt:
		'A bank prints masked sort-code and account references on receipts so only the last four digits stay visible. Given `char accountRef[] = "UK-9081-4421-7739";`, write a complete C program that loops through the reference using `strlen(accountRef)` and replaces every digit that appears before the last four characters with a star, leaving the hyphens, the letters, and the final four digits untouched. Print the original reference first and the masked reference second, copying the label spacing of the expected output exactly.',
	hints: [
		'Measure the string once with strlen and keep the result in a size_t.',
		'The last four characters start at index len minus four, so the loop can stop before it ever reaches them.',
		'A byte is a digit when it is at or above the character zero and at or below the character nine.',
		'Edit the array in place with a star, then print the same array again; its length never changes.'
	],
	expectedStdout: `Original reference: UK-9081-4421-7739
Masked reference:   UK-****-****-7739`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>
#include <string.h>

int main(void) {
    // TODO: declare accountRef with the value UK-9081-4421-7739.

    // TODO: print the original reference.

    // TODO: measure it with strlen, then walk it and mask each digit that
    //       appears before the last four characters.

    // TODO: print the masked reference.

    return 0;
}`,
	solution: `#include <stdio.h>
#include <string.h>

int main(void) {
    char accountRef[] = "UK-9081-4421-7739";
    size_t len = strlen(accountRef);

    printf("Original reference: %s\\n", accountRef);

    for (size_t i = 0; i + 4 < len; i++) {
        if (accountRef[i] >= '0' && accountRef[i] <= '9') {
            accountRef[i] = '*';
        }
    }

    printf("Masked reference:   %s\\n", accountRef);
    return 0;
}`
};

export const chantBanner: HandbookExercise = {
	id: 'hb-08-chant-banner',
	concept: 'iterating a char array in place',
	prompt:
		'Write a complete C program that starts from `char chant[] = "Come on you Rovers!";`, counts how many vowels it contains, and then converts every lowercase letter to uppercase in place before printing the banner. Count vowels in either case, and shift each lowercase letter by subtracting the difference between `a` and `A`, which is 32. Print the original chant, the vowel count, the uppercase banner, and finally the string length from `strlen` beside the buffer size from `sizeof`.',
	hints: [
		'One loop can do both jobs: test the current byte for a vowel, then test it again for lowercase before shifting it.',
		'A byte is lowercase when it is at or above the character a and at or below the character z.',
		'Subtracting lowercase a from the byte tells you its distance from a; subtracting that distance from uppercase A gives the uppercase letter.',
		'Count the vowels before you change anything, or the uppercase vowels will still be matched, but printing the count in the middle of the conversion is harder to follow.'
	],
	expectedStdout: `Original chant:  Come on you Rovers!
Vowel count:     7
Stadium banner:  COME ON YOU ROVERS!
Length: 19 chars | Buffer size: 20 bytes`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>
#include <string.h>

int main(void) {
    // TODO: declare chant with the value Come on you Rovers!

    // TODO: print the original chant.

    // TODO: walk the array until the terminator, counting vowels and
    //       converting lowercase letters to uppercase.

    // TODO: print the vowel count, the banner, and strlen beside sizeof.

    return 0;
}`,
	solution: `#include <stdio.h>
#include <string.h>

int main(void) {
    char chant[] = "Come on you Rovers!";
    int vowels = 0;

    printf("Original chant:  %s\\n", chant);

    for (size_t i = 0; chant[i] != '\\0'; i++) {
        char c = chant[i];
        if (c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u' ||
            c == 'A' || c == 'E' || c == 'I' || c == 'O' || c == 'U') {
            vowels++;
        }
        if (c >= 'a' && c <= 'z') {
            chant[i] = (char)(c - ('a' - 'A'));
        }
    }

    printf("Vowel count:     %d\\n", vowels);
    printf("Stadium banner:  %s\\n", chant);
    printf("Length: %zu chars | Buffer size: %zu bytes\\n",
           strlen(chant), sizeof(chant));

    return 0;
}`
};

export const clubSorter: HandbookExercise = {
	id: 'hb-08-club-sorter',
	concept: 'strcmp ordering and equality',
	prompt:
		'Given two strings, `char nameA[32] = "United";` and `char nameB[32] = "Athletic";`, use `strcmp(nameA, nameB)` to decide which one comes first alphabetically. A negative result means the first argument sorts before the second; a positive result means it sorts after. Print them in alphabetical order, and then report whether either name matches `"Rovers"`, answering `YES` or `NO`.',
	hints: [
		'Call strcmp once and store the result; then one branch is enough to order the two names.',
		'A zero result means the strings are equal, which for this pair never happens — but the test is still written the same way.',
		'Equality against Rovers is a separate question: compare each name with the literal and join the two answers with logical OR.',
		'Print the two lines only after both decisions are made, so the output order is independent of which name sorted first.'
	],
	expectedStdout: `Alphabetical order: 1. Athletic, 2. United
Is either club Rovers? NO`,
	expectedExitCode: 0,
	starter: `#include <stdio.h>
#include <string.h>

int main(void) {
    // TODO: declare nameA as United and nameB as Athletic, each in a
    //       32-byte array.

    // TODO: compare them with strcmp and print the alphabetical order.

    // TODO: test each name against Rovers and print YES or NO.

    return 0;
}`,
	solution: `#include <stdio.h>
#include <string.h>

int main(void) {
    char nameA[32] = "United";
    char nameB[32] = "Athletic";

    if (strcmp(nameA, nameB) <= 0) {
        printf("Alphabetical order: 1. %s, 2. %s\\n", nameA, nameB);
    } else {
        printf("Alphabetical order: 1. %s, 2. %s\\n", nameB, nameA);
    }

    int isRovers = (strcmp(nameA, "Rovers") == 0) ||
                   (strcmp(nameB, "Rovers") == 0);
    printf("Is either club Rovers? %s\\n", isRovers ? "YES" : "NO");

    return 0;
}`
};