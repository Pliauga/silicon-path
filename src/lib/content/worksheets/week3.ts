import type { WorksheetWeek } from './types';

/**
 * Week 3 — standard I/O, type conversion, loops, and number conversion in C.
 *
 * The worksheets assume the online GDB compiler; here every program runs under
 * the same C11 clang in the browser, with fixed stdin shown in the exercise.
 */
export const week3: WorksheetWeek = {
	week: 3,
	title: 'Input, Output & Loops',
	lecture: 'Lecture 06–08 — Memory, I/O, Control',
	duration: '110 minutes',
	source: 'worksheets/week-3/document.md',
	intro:
		'Input is where most first-year C programs break: a stray newline, the wrong conversion, or an uninitialised variable turns a correct-looking program into nonsense. This lab builds the input habits first, then uses loops to make conversions repeatable.',

	figures: [
		{
			kind: 'bases',
			caption:
				'Figure 1 — the same conversion the worksheets ask you to code, shown with its division chain.'
		}
	],

	sections: [
		{
			id: 'io',
			title: 'Standard input and output',
			note: 'scanf leaves the newline in the input buffer; a later %c will read it unless the format starts with a space.',
			exercises: [
				{
					id: 'ws3-ex01',
					label: 'EX 1',
					title: 'Reading one character',
					mode: 'code',
					concept: 'getchar / putchar',
					prompt:
						'Run the program and type “this is a test”. It prints only t. Explain which function consumed the rest of the line, and why gets() is not a safe replacement.',
					hints: [
						'getchar reads exactly one character from the stream.',
						'gets has no length argument and cannot know the buffer size.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint c;\n\tprintf("Enter a value: ");\n\tc = getchar();\n\tprintf("\\nYou entered: ");\n\tputchar(c);\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint c;\n\tprintf("Enter a value: ");\n\tc = getchar();\n\tprintf("\\nYou entered: ");\n\tputchar(c);\n\treturn 0;\n}\n',
					stdin: 'this is a test\n',
					expectedStdout: 'Enter a value: \nYou entered: t'
				},
				{
					id: 'ws3-ex02',
					label: 'EX 2',
					title: 'Name and integer',
					mode: 'code',
					concept: 'printf / scanf',
					prompt:
						'Print your name on its own line, then ask for an integer and print it back. Notice that the prompt and the echoed value end up on the same line unless you add a newline.',
					hints: [
						'%d reads into the address of an int: &n.',
						'Put the newline where you want the break, not after every printf by habit.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\t/* name line, then prompt and read an integer */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tprintf("Name: Ada Lovelace\\n");\n\tint n;\n\tprintf("Enter an integer: ");\n\tscanf("%d", &n);\n\tprintf("You entered: %d\\n", n);\n\treturn 0;\n}\n',
					stdin: '25',
					expectedStdout: 'Name: Ada Lovelace\nEnter an integer: You entered: 25'
				},
				{
					id: 'ws3-ex03',
					label: 'EX 3',
					title: 'Add two integers',
					mode: 'code',
					concept: 'formatted I/O',
					prompt: 'Read two integers and print their sum in the form 12 + 11 = 23.',
					hints: [
						'Use two %d conversions in one scanf separated by a space.',
						'Print the operands and the sum with three %d conversions.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint a, b;\n\tprintf("Enter two integers: ");\n\t/* read and print */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint a, b;\n\tprintf("Enter two integers: ");\n\tscanf("%d %d", &a, &b);\n\tprintf("%d + %d = %d\\n", a, b, a + b);\n\treturn 0;\n}\n',
					stdin: '12 11',
					expectedStdout: 'Enter two integers: 12 + 11 = 23'
				},
				{
					id: 'ws3-ex04',
					label: 'EX 4',
					title: 'Multiply two decimals',
					mode: 'code',
					concept: 'float conversions',
					prompt:
						'Read two decimal numbers and print their product to two places. Why does the worksheet show 2.69 rather than the full product 2.688?',
					hints: [
						'Use double inside the program and %lf inside scanf.',
						'%.2f rounds for display; it does not change the stored value.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tdouble a, b;\n\tprintf("Enter two numbers: ");\n\t/* read and print Product = ... */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tdouble a, b;\n\tprintf("Enter two numbers: ");\n\tscanf("%lf %lf", &a, &b);\n\tprintf("Product = %.2f\\n", a * b);\n\treturn 0;\n}\n',
					stdin: '2.4 1.12',
					expectedStdout: 'Enter two numbers: Product = 2.69'
				},
				{
					id: 'ws3-ex05',
					label: 'EX 5',
					title: 'ASCII value of a character',
					mode: 'code',
					concept: 'char arithmetic',
					prompt:
						'Read one character and print its ASCII code. Then explain why ’G’ can be printed with %c and %d from the same variable.',
					hints: [
						'char is an integer type; %c and %d are two readings of the same byte.',
						'Put a space before %c in scanf to skip the pending newline.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tchar c;\n\tprintf("Enter a character: ");\n\t/* read and print ASCII value */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tchar c;\n\tprintf("Enter a character: ");\n\tscanf(" %c", &c);\n\tprintf("ASCII value of %c = %d\\n", c, c);\n\treturn 0;\n}\n',
					stdin: 'G',
					expectedStdout: 'Enter a character: ASCII value of G = 71'
				},
				{
					id: 'ws3-ex06',
					label: 'EX 6',
					title: 'Quotient and remainder',
					mode: 'code',
					concept: 'integer division',
					prompt:
						'Read a dividend and a divisor and print both the integer quotient and the remainder. The input box is pre-filled with 25 and 4, which is what Check output grades. Before you run it, predict the quotient and remainder for 25 and −4, then change the input to 25 -4 (a plain hyphen) and Run to test your prediction.',
					hints: [
						'/ between ints truncates toward zero; % keeps the sign of the dividend.',
						'Do not divide by zero: the behaviour is undefined.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint dividend, divisor;\n\tprintf("Enter dividend: ");\n\t/* read both, print quotient and remainder */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint dividend, divisor;\n\tprintf("Enter dividend: ");\n\tscanf("%d", &dividend);\n\tprintf("Enter divisor: ");\n\tscanf("%d", &divisor);\n\tprintf("Quotient = %d\\n", dividend / divisor);\n\tprintf("Remainder = %d\\n", dividend % divisor);\n\treturn 0;\n}\n',
					stdin: '25 4',
					expectedStdout: 'Enter dividend: Enter divisor: Quotient = 6\nRemainder = 1'
				},
				{
					id: 'ws3-ex07',
					label: 'EX 7',
					title: 'Sizes of the four basic types',
					mode: 'code',
					concept: 'sizeof',
					prompt:
						'Print the sizes of int, float, double and char. Which of the four is fixed by the C standard, and which depends on the platform ABI?',
					hints: [
						'sizeof yields size_t; print with %zu.',
						'Only char has a guaranteed size of one byte.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\t/* four size lines */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tprintf("Size of int: %zu bytes\\n", sizeof(int));\n\tprintf("Size of float: %zu bytes\\n", sizeof(float));\n\tprintf("Size of double: %zu bytes\\n", sizeof(double));\n\tprintf("Size of char: %zu byte\\n", sizeof(char));\n\treturn 0;\n}\n',
					expectedStdout:
						'Size of int: 4 bytes\nSize of float: 4 bytes\nSize of double: 8 bytes\nSize of char: 1 byte'
				},
				{
					id: 'ws3-ex08',
					label: 'EX 8',
					title: 'Swap two decimals',
					mode: 'code',
					concept: 'temporary variable',
					prompt:
						'Read two decimal numbers and swap them using a third variable. Then try swapping without one and explain why a temporary is the safer habit.',
					hints: [
						'The temporary holds one value while the other two assignments overwrite.',
						'Without a temporary, the first assignment destroys a value you still need.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tdouble first, second;\n\tprintf("Enter first number: ");\n\t/* swap and print */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tdouble first, second, temp;\n\tprintf("Enter first number: ");\n\tscanf("%lf", &first);\n\tprintf("Enter second number: ");\n\tscanf("%lf", &second);\n\ttemp = first;\n\tfirst = second;\n\tsecond = temp;\n\tprintf("After swapping, firstNumber = %.2f\\n", first);\n\tprintf("After swapping, secondNumber = %.2f\\n", second);\n\treturn 0;\n}\n',
					stdin: '1.20 2.45',
					expectedStdout:
						'Enter first number: Enter second number: After swapping, firstNumber = 2.45\nAfter swapping, secondNumber = 1.20'
				}
			]
		},
		{
			id: 'loops',
			title: 'Loops and conversions',
			exercises: [
				{
					id: 'ws3-ex09',
					label: 'EX 9',
					title: 'The three parts of a for loop',
					mode: 'note',
					concept: 'for loops',
					prompt:
						'The loop for (i = 1; i < 11; ++i) prints 1 through 10. Name the three clauses and say exactly when each runs, then state the output if the test were i <= 10.',
					hints: [
						'Initialise once, test before every iteration, update after every iteration.',
						'Changing < to <= moves the final value by one.'
					],
					solution:
						'for (i = 1; i < 11; ++i) has three clauses: the initialiser i = 1 runs once before the loop; the test i < 11 runs before each iteration and stops the loop when false; the update ++i runs after each iteration.\n\nThe output is 1 2 3 4 5 6 7 8 9 10. With i <= 10 the output is identical, because the loop would already have stopped after printing 10; the difference is the number of times i is tested, not the values printed.'
				},
				{
					id: 'ws3-ex10',
					label: 'EX 10',
					title: 'Sum of the first n naturals',
					mode: 'code',
					concept: 'accumulators',
					prompt:
						'Read a positive integer n and print the sum 1 + 2 + … + n. Trace the accumulator for n = 4, then show that the loop performs exactly n additions.',
					hints: [
						'sum must start at 0, not at the first value.',
						'For n = 4 the accumulator goes 1, 3, 6, 10.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint n, sum = 0;\n\tprintf("Enter a positive integer: ");\n\tscanf("%d", &n);\n\t/* loop and print Sum = ... */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint n, sum = 0;\n\tprintf("Enter a positive integer: ");\n\tscanf("%d", &n);\n\tfor (int count = 1; count <= n; count++)\n\t\tsum += count;\n\tprintf("Sum = %d\\n", sum);\n\treturn 0;\n}\n',
					stdin: '100',
					expectedStdout: 'Enter a positive integer: Sum = 5050'
				},
				{
					id: 'ws3-ex11',
					label: 'EX 11',
					title: 'Audit the decimal-to-binary program',
					mode: 'note',
					concept: 'portability',
					prompt:
						'The worksheet’s dec_bin program includes conio.h, declares void main, and prints “nBinary” rather than a newline. Identify three defects, say which are compile errors and which are portability problems, and state the exact output for 42.',
					hints: [
						'conio.h is a DOS/Windows header; C11 does not have it.',
						'The string literally begins with the letter n because the backslash is missing.'
					],
					solution:
						'Defects: (1) conio.h is not a standard header and does not exist on Linux/macOS — a portability/compile error; (2) void main is not a standard signature — main must return int; (3) “nBinary number : ” starts with a letter n instead of a newline, so the output is visually glued to the prompt. A fourth, quieter issue is the fixed 50-element remainder array with no bound check.\n\nFor 42 the standard output is: nBinary number : 101010 (with the literal n). Replacing the header with stdio.h, changing main to int, and using \\n fixes it.'
				},
				{
					id: 'ws3-ex12',
					label: 'EX 12',
					title: 'Binary to decimal',
					mode: 'code',
					concept: 'positional notation',
					prompt:
						'Read a binary number (as digits) and convert it to decimal. Do not use a library conversion; accumulate place value as you read each digit.',
					hints: [
						'value = value * 2 + digit, for each digit left to right.',
						'Use %ld for a long and test with 101101.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tlong binary, value = 0;\n\tprintf("Enter a binary number: ");\n\t/* accumulate and print Decimal = ... */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tlong binary;\n\tprintf("Enter a binary number: ");\n\tscanf("%ld", &binary);\n\tlong value = 0, place = 1;\n\twhile (binary > 0) {\n\t\tint digit = binary % 10;\n\t\tvalue += digit * place;\n\t\tplace *= 2;\n\t\tbinary /= 10;\n\t}\n\tprintf("Decimal = %ld\\n", value);\n\treturn 0;\n}\n',
					stdin: '101101',
					expectedStdout: 'Enter a binary number: Decimal = 45'
				},
				{
					id: 'ws3-ex13',
					label: 'EX 13',
					title: 'Decimal to octal',
					mode: 'code',
					concept: 'repeated division',
					prompt:
						'Convert a decimal number to octal using repeated division by 8. State why the remainders must be printed in reverse order.',
					hints: [
						'The first remainder is the least significant octal digit.',
						'Store remainders in an array and print backwards, or build the number by place value.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tlong n;\n\tprintf("Enter a decimal number: ");\n\t/* repeated division, print Octal = ... */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tlong n;\n\tprintf("Enter a decimal number: ");\n\tscanf("%ld", &n);\n\tlong place = 1, octal = 0;\n\twhile (n > 0) {\n\t\toctal += (n % 8) * place;\n\t\tn /= 8;\n\t\tplace *= 10;\n\t}\n\tprintf("Octal = %ld\\n", octal);\n\treturn 0;\n}\n',
					stdin: '42',
					expectedStdout: 'Enter a decimal number: Octal = 52'
				},
				{
					id: 'ws3-ex14',
					label: 'EX 14',
					title: 'Logical operators, line by line',
					mode: 'note',
					concept: 'short-circuit evaluation',
					prompt:
						'For a = 5, b = 5 and c = 10, work out each of the six results without running the program. Then explain why the fifth and sixth lines print labels that do not match their expressions.',
					hints: [
						'&& is true only if both sides are non-zero; || is true if either is.',
						'The labels are string literals: the compiler prints what the programmer wrote, not what was evaluated.'
					],
					solution:
						'Results in order: (a == b) && (c > b) = 1; (a == b) && (c < b) = 0; (a == b) || (c < b) = 1; (a != b) || (c < b) = 0; !(a != b) = 1, printed with the label “!(a == b)”; !(a == b) = 0.\n\nThe fifth line is mislabelled: it evaluates !(a != b), which is 1, but prints “!(a == b)”, which would be 0. The label is just text — a common source of false conclusions when reading output.'
				}
			]
		}
	]
};