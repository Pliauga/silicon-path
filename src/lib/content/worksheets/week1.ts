import type { WorksheetWeek } from './types';

/**
 * Week 1 — under the lid, number systems, and the first C programs.
 *
 * EX 1–4 are identification tasks in the paper lab. The photo-dependent wording
 * is kept, but the block diagram on this page replaces the physical PC so the
 * exercises stay answerable at home.
 */
export const week1: WorksheetWeek = {
	week: 1,
	title: 'Introduction to IoT & Basic Numbers',
	lecture: 'Lecture 01–02 — Data Representation',
	duration: '90 minutes',
	source: 'worksheets/week-1/document.md',
	intro:
		'This first lab moves from the physical machine to the number systems it uses, then to the first C programs that expose those numbers. Do the identification tasks against the block diagram, work the conversions by hand before opening a calculator, and type every C program yourself.',

	figures: [
		{
			kind: 'pc',
			caption:
				'Figure 1 — a von Neumann machine in block form. The worksheet photo is replaced by the same architecture drawn as a diagram.'
		},
		{
			kind: 'bases',
			caption: 'Figure 2 — one decimal, three bases, with the division shown step by step.'
		},
		{
			kind: 'binary',
			caption: 'Figure 3 — carries and borrows, column by column.'
		},
		{
			kind: 'float',
			caption: 'Figure 4 — a decimal value as a 32-bit IEEE-754 pattern.'
		}
	],

	sections: [
		{
			id: 'pc',
			title: 'Under the lid',
			note: 'The worksheet asks you to sketch or photograph a real PC. The diagram above is the fallback for working away from the lab; use it for every part question.',
			exercises: [
				{
					id: 'ws1-ex01',
					label: 'EX 1',
					title: 'Identification of PC parts',
					mode: 'note',
					concept: 'computer organisation',
					prompt:
						'Using the block diagram, identify six components and classify each as processor, primary memory, secondary storage, input/output, or support. Then explain in one sentence why the CPU and memory are drawn on opposite sides of the bus.',
					hints: [
						'Every part belongs to exactly one of the five categories; the bus is not a part.',
						'The three buses between CPU and memory carry different things: where, what, and when.'
					],
					solution:
						'Example classification: CPU — processor; RAM — primary memory; SSD/HDD — secondary storage; NIC — input/output; PSU and fan — support. The motherboard is the support element that connects the rest.\n\nCPU and memory sit on opposite ends of the bus because every instruction and operand has to cross it. That shared crossing is the von Neumann bottleneck: one path for both instructions and data limits throughput even when the CPU could work faster.'
				},
				{
					id: 'ws1-ex02',
					label: 'EX 2',
					title: 'Identification of processor details',
					mode: 'note',
					concept: 'CPU packaging',
					prompt:
						'A lab PC carries a processor marked “Intel Core i7-12700”. What does each part of that name tell you, and why does the package need a heat sink and fan?',
					hints: [
						'The number splits into a family, a generation, and a performance tier.',
						'Every switching transistor dissipates a little heat; billions of them do not.'
					],
					solution:
						'“Intel Core i7” is the family and tier; “12” is the 12th generation; “700” is the model within that generation. The suffix letters used on some parts (K, U, H) encode overclocking or power class.\n\nThe package needs cooling because CMOS transistors dissipate power mainly while switching, and a modern die contains billions of them. Without a heat sink and fan the junction temperature climbs until the CPU throttles, then shuts down.'
				},
				{
					id: 'ws1-ex03',
					label: 'EX 3',
					title: 'Identification of memory details',
					mode: 'note',
					concept: 'memory slots',
					prompt:
						'A motherboard has four DIMM slots. Two are filled with 8 GB modules, one in each channel, and two are empty. How much RAM does the machine have, how much can it hold without replacing anything, and what is the benefit of filling both channels?',
					hints: [
						'Capacity adds; channels affect bandwidth, not capacity.',
						'Dual-channel operation needs a matched pair, one per channel.'
					],
					solution:
						'The machine has 16 GB installed and can hold 32 GB by filling the two empty slots with matching 8 GB modules.\n\nWith both channels populated the memory controller can service two requests in parallel, roughly doubling peak bandwidth for streaming workloads. Mixing sizes is allowed but can drop the machine back to single-channel mode or a lower common speed.'
				},
				{
					id: 'ws1-ex04',
					label: 'EX 4',
					title: 'Identification of NIC details',
					mode: 'note',
					concept: 'network interface',
					prompt:
						'What does a network interface card do, which two layers of the OSI model does it most directly implement, and what address does it own that the CPU does not?',
					hints: [
						'One layer frames bits; the next addresses hosts on the local link.',
						'The address is burned into the adapter and is 48 bits long.'
					],
					solution:
						'A NIC moves frames between the machine’s memory and the network medium: it serialises bits, detects the carrier, and checks frame integrity. It implements the physical layer and the data-link layer.\n\nIt owns a 48-bit MAC address, assigned to the adapter rather than to the CPU. Higher layers use IP addresses, which belong to the host and can change when it moves networks.'
				}
			]
		},
		{
			id: 'numbers',
			title: 'Number systems',
			note: 'Work the divisions on paper first; use Figure 2 to check the remainder order.',
			exercises: [
				{
					id: 'ws1-ex05',
					label: 'EX 5',
					title: 'One decimal, three bases',
					mode: 'note',
					concept: 'base conversion',
					prompt:
						'Convert 42₁₀ to binary, octal and hexadecimal. Show the repeated division for each base, and state which digit is the most significant and why.',
					hints: [
						'Divide by the target base, keep the remainder, repeat with the quotient.',
						'The last remainder you write is the most significant digit.'
					],
					solution:
						'Binary: 42 ÷ 2 = 21 r0; 21 ÷ 2 = 10 r1; 10 ÷ 2 = 5 r0; 5 ÷ 2 = 2 r1; 2 ÷ 2 = 1 r0; 1 ÷ 2 = 0 r1. Read bottom-up: 101010₂.\n\nOctal: 42 ÷ 8 = 5 r2; 5 ÷ 8 = 0 r5 → 52₈. Hexadecimal: 42 ÷ 16 = 2 r10; 2 ÷ 16 = 0 r2 → 2A₁₆.\n\nThe final remainder comes from the division that produced quotient zero, so it is the highest place value — the most significant digit. Writing remainders top-down reverses the number.'
				},
				{
					id: 'ws1-ex06',
					label: 'EX 6',
					title: 'Binary addition and subtraction',
					mode: 'note',
					concept: 'binary arithmetic',
					prompt:
						'Show the column working for 159 + 147 and for 138 − 75 in binary. For the sum, state the 8-bit result and the carry out; for the difference, state where the borrows occur.',
					hints: [
						'Convert both operands to 8 bits first, then add column by column from the right.',
						'In subtraction, a column that would go negative borrows 2 from the next column to its left.'
					],
					solution:
						'159 = 1001 1111 and 147 = 1001 0011. Adding: the low nibbles give 1111 + 0011 = 1 0010 (result 0010, carry 1); the high nibbles give 1001 + 1001 + 1 = 1 0011 (result 0011, carry 1). Result 0011 0010 = 50₁₀ with carry out 1, so the true sum is 306 = 1 0011 0010₂.\n\n138 = 1000 1010 and 75 = 0100 1011. Subtract from the right: bit 0 borrows (0 − 1), bit 2 borrows, and the borrow ripples through bit 3. The result is 0011 1111 = 63₁₀ with no final borrow, since 138 > 75.'
				},
				{
					id: 'ws1-ex07',
					label: 'EX 7',
					title: 'Binary multiplication and division',
					mode: 'note',
					concept: 'binary arithmetic',
					prompt:
						'Convert 18 × 24 to binary and multiply using shift-and-add. Then perform 25 ÷ 13 by binary long division, giving quotient and remainder.',
					hints: [
						'Multiplying by 2 is a left shift; each 1 bit in the multiplier contributes a shifted copy of the multiplicand.',
						'Long division compares the divisor with the current remainder, not with the whole dividend.'
					],
					solution:
						'18 = 10010₂ and 24 = 11000₂. Multiplying by 11000₂ means adding 10010 shifted left 3 places (10010000) and left 4 places (100100000): 1 1011 0000₂ = 432₁₀.\n\n25 = 11001₂, 13 = 1101₂. 1101 does not fit the leading 1, so bring down bits until 11001 ≥ 1101: quotient 1, remainder 11001 − 1101 = 1100. No further bits remain, so quotient = 1₂, remainder = 1100₂ = 12₁₀.'
				}
			]
		},
		{
			id: 'c-basics',
			title: 'First C programs',
			note: 'Type the programs rather than copying them. Compile after each change; read the first diagnostic before the rest.',
			exercises: [
				{
					id: 'ws1-ex08',
					label: 'EX 8',
					title: 'Beginning with C I — Hello, world',
					mode: 'code',
					concept: 'program structure',
					prompt:
						'Write the smallest complete C program that prints Hello world! (no newline). Explain the job of #include, main, the braces, the semicolon, and return 0.',
					hints: [
						'printf lives in stdio.h; the preprocessor copies its declarations in.',
						'return 0 reports successful termination to the operating system.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\t/* your code here */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tprintf("Hello world!");\n\treturn 0;\n}\n',
					expectedStdout: 'Hello world!'
				},
				{
					id: 'ws1-ex09',
					label: 'EX 9',
					title: 'Beginning with C II — read the first error',
					mode: 'note',
					concept: 'compiler diagnostics',
					prompt:
						'Program three in the worksheet omits the semicolon after x = 10 and loses the opening quote in printf. Which error does the compiler report first, and why is fixing the last error usually the wrong strategy?',
					hints: [
						'The compiler reports the first place its grammar no longer makes sense.',
						'After one syntax error the compiler’s state is unreliable, so later diagnostics can be noise.'
					],
					solution:
						'The first error is the missing semicolon: the parser is still waiting to finish the statement at x = 10 when it meets y, which cannot continue an expression. The lost quote then produces a cascade — “The” looks like an identifier, the rest of the string is mis-tokenised, and the closing brace is reported as unexpected.\n\nFix the first reported error and recompile. Each earlier fix can remove dozens of downstream messages; chasing the last one usually means editing code that was never wrong.'
				},
				{
					id: 'ws1-ex10',
					label: 'EX 10',
					title: 'The size of int',
					mode: 'code',
					concept: 'sizeof',
					prompt:
						'Print the storage size of int using sizeof. Then change the type to float, double and char; note which sizes are fixed by the language and which are implementation-defined.',
					hints: [
						'sizeof yields size_t, so print it with %zu rather than %d.',
						'char is always 1 byte; int is “natural” and varies by ABI.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\t/* print the size of int */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tprintf("Storage size for int : %zu\\n", sizeof(int));\n\treturn 0;\n}\n',
					expectedStdout: 'Storage size for int : 4'
				},
				{
					id: 'ws1-ex11',
					label: 'EX 11',
					title: 'Why 0.1 never reaches 1.0',
					mode: 'code',
					concept: 'floating-point representation',
					prompt:
						'Run the loop that increments a float by 0.1 until it equals 1.0. It does not terminate. Explain why, then repair it. Second question: with x = 123456789.0f, why does printf("%f", x + 1) print the same value as x?',
					hints: [
						'0.1 is not a finite binary fraction; the stored value is slightly above or below.',
						'float has 24 significant bits; above 2^24 adding 1 changes nothing.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tfloat x;\n\tfor (x = 0; x != 1.0f; x += 0.1f)\n\t\tprintf("%f\\n", x);\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\t/* Count iterations instead of testing equality: 0.1 has no exact\n\t   binary representation, so an accumulator never lands on 1.0.\n\t   Above 2^24 the increment is smaller than one float step, so the\n\t   value stops changing. 123456789.0f rounds to 123456792.0f, whose\n\t   neighbours are 8 apart; adding 1 changes nothing. */\n\tfor (int i = 1; i <= 10; i++)\n\t\tprintf("%.1f\\n", i * 0.1f);\n\treturn 0;\n}\n'
				},
				{
					id: 'ws1-ex12',
					label: 'EX 12',
					title: 'Declaration versus definition',
					mode: 'note',
					concept: 'linkage',
					prompt:
						'The worksheet declares extern int a, b, c; and extern float f; above main, then redefines int a, b, c; float f; inside main. What does extern promise, why does the inner definition win, and what output does the program produce?',
					hints: [
						'extern says “this exists somewhere”, not “allocate it here”.',
						'Block scope shadows the file-scope declarations inside main.'
					],
					solution:
						'extern is a declaration: it promises the linker that an object with external linkage exists, without allocating storage. The definitions inside main create new automatic variables that shadow the extern names for that block, so those are the objects the assignments use.\n\nThe output is:\nvalue of c : 30\nvalue of f : 23.333334\n\nThe extern declarations are unused in this program, which is why it links without definitions for them.'
				},
				{
					id: 'ws1-ex13',
					label: 'EX 13',
					title: 'Add and subtract integers',
					mode: 'code',
					concept: 'arithmetic operators',
					prompt:
						'Write a C program that prints the sum and the difference of two integers. Start with 25 and 17, then change the constants and predict each result before running again.',
					hints: [
						'%d is the conversion for int arguments.',
						'One printf can carry several arguments, one per conversion.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint a = 25, b = 17;\n\t/* print a + b and a - b */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint a = 25, b = 17;\n\tprintf("%d + %d = %d\\n", a, b, a + b);\n\tprintf("%d - %d = %d\\n", a, b, a - b);\n\treturn 0;\n}\n',
					expectedStdout: '25 + 17 = 42\n25 - 17 = 8'
				}
			]
		}
	]
};