import type { WorksheetWeek } from './types';

/**
 * Week 2 — logic gates, bitwise operators, decisions, and the first pointers.
 *
 * The worksheet's circuit figures are photographs of Logic.ly sketches. EX 2 and
 * EX 3 therefore describe each circuit in prose so they can be redrawn without
 * the image; the expression work is unchanged.
 */
export const week2: WorksheetWeek = {
	week: 2,
	title: 'Logic, Decisions & Pointers',
	lecture: 'Lecture 03–05 — Architecture, Logic, Sequential Logic',
	duration: '100 minutes',
	source: 'worksheets/week-2/document.md',
	intro:
		'Week 2 connects Boolean algebra to C: gates first, then the bitwise operators that apply a gate to every bit at once, then the decision statements that apply a condition to a whole program. The last two exercises introduce pointers, which are memory addresses you can hold in a variable.',

	figures: [
		{
			kind: 'bitwise',
			caption: 'Figure 1 — two 8-bit rows, three gates, three results.'
		},
		{
			kind: 'waveform',
			caption: 'Figure 2 — inputs changing over time, output settling after each change.'
		},
		{
			kind: 'gates',
			caption: 'Figure 3 — the gate shapes, and the circuit for Y = (AB)(A + B).'
		},
		{
			kind: 'gates3d',
			caption: 'Figure 4 — a physical breadboard: toggle A and B, switch gates, watch the lamp.'
		}
	],

	sections: [
		{
			id: 'logic',
			title: 'Gates and bitwise operators',
			note: 'In C, & applies AND bit by bit, while && tests whether both whole values are non-zero. Keep the two apart.',
			exercises: [
				{
					id: 'ws2-ex01',
					label: 'EX 1',
					title: 'Bitwise AND, OR, XOR',
					mode: 'code',
					concept: 'bitwise operators',
					prompt:
						'Run the three programs for a = 12 and b = 25. Write each operand in 8-bit binary, line the bits up, and explain each decimal result one column at a time.',
					hints: [
						'12 = 0000 1100 and 25 = 0001 1001.',
						'AND keeps a 1 only where both columns are 1; XOR keeps a 1 where they differ.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint a = 12, b = 25;\n\tprintf("Output = %d\\n", a & b);\n\t/* add the OR and XOR lines */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint a = 12, b = 25;\n\tprintf("Output = %d\\n", a & b);\n\tprintf("Output = %d\\n", a | b);\n\tprintf("Output = %d\\n", a ^ b);\n\treturn 0;\n}\n',
					expectedStdout: 'Output = 8\nOutput = 29\nOutput = 21'
				},
				{
					id: 'ws2-ex02',
					label: 'EX 2',
					title: 'Draw the circuits',
					mode: 'note',
					concept: 'sum of products',
					prompt:
						'Draw a two-level AND–OR circuit for each expression; use inverters only where a literal is complemented. Then simplify the second expression algebraically and say how many gates the simplified form needs.\n\n1) ABC + ABD + BCD\n2) (AB + CD)AD\n3) (AC + B + CD)E',
					hints: [
						'Each product term is one AND gate; the terms feed one OR gate.',
						'For (2), distribute the outer AD over the bracket and use A·A = A, D·D = D.'
					],
					solution:
						'1) Three 3-input AND gates (ABC, ABD, BCD) feeding one 3-input OR gate. No inverters.\n\n2) (AB + CD)AD = ABD + ACD. The simplified circuit is two 3-input AND gates feeding one OR gate — four gates fewer than the literal form, which needs two ANDs, one OR, one AND and one buffer.\n\n3) (AC + B + CD)E = ACE + BE + CDE. Three 3-input AND gates feed one OR gate. The bracket is a sum of three terms, all multiplied by E.\n\nA gate count is a cost, not a correctness measure: both forms compute the same truth table.'
				},
				{
					id: 'ws2-ex03',
					label: 'EX 3',
					title: 'Read the circuit, write the expression',
					mode: 'note',
					concept: 'Boolean expressions',
					prompt:
						'Derive the Boolean expression for two described circuits.\n\nCircuit A: A and B enter an AND gate; its output and C enter an OR gate.\nCircuit B: A passes through a NOT gate; the result and B enter an AND gate; that output and C enter an OR gate.\n\nThen state, without a truth table, what output each circuit gives when C = 1.',
					hints: [
						'Name the output of every gate as you go; the final expression is the last OR.',
						'Anything OR 1 is 1, whatever the other input.'
					],
					solution:
						'Circuit A: Y = AB + C. Circuit B: Y = A′B + C.\n\nWhen C = 1 both outputs are 1 regardless of A and B, because 1 is the absorbing element of OR. That is worth noticing: a single input can override a whole sub-circuit.'
				},
				{
					id: 'ws2-ex04',
					label: 'EX 4',
					title: 'Four gates in one program',
					mode: 'code',
					concept: 'logical versus bitwise',
					prompt:
						'Read two digits (0 or 1) and print the results of AND, OR, XOR and NOT. For this input, give the truth-table row that each printed value corresponds to.',
					hints: [
						'With 0/1 digits, & and && give the same values; use && for conditions, & for bits.',
						'NOT is unary: it uses only the first digit.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint a, b;\n\tprintf("Enter two digits: ");\n\tscanf("%d %d", &a, &b);\n\t/* print AND, OR, XOR, NOT A */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint a, b;\n\tprintf("Enter two digits: ");\n\tscanf("%d %d", &a, &b);\n\tprintf("A AND B = %d\\n", a & b);\n\tprintf("A OR B = %d\\n", a | b);\n\tprintf("A XOR B = %d\\n", a ^ b);\n\tprintf("NOT A = %d\\n", !a);\n\treturn 0;\n}\n',
					stdin: '1 0',
					expectedStdout:
						'Enter two digits: A AND B = 0\nA OR B = 1\nA XOR B = 1\nNOT A = 0'
				}
			]
		},
		{
			id: 'decisions',
			title: 'Decision making',
			exercises: [
				{
					id: 'ws2-ex05',
					label: 'EX 5',
					title: 'Voting eligibility',
					mode: 'code',
					concept: 'if / else',
					prompt:
						'Ask for an age. If it is at least 18 print “You are eligible for voting”, otherwise print “You are not eligible for voting”. Try 14 and 21; also decide what the program should do with 18 exactly.',
					hints: [
						'use >= so 18 qualifies.',
						'One scanf and one if/else are enough; no loop.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint age;\n\tprintf("Enter your age: ");\n\tscanf("%d", &age);\n\t/* if/else on age */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint age;\n\tprintf("Enter your age: ");\n\tscanf("%d", &age);\n\tif (age >= 18)\n\t\tprintf("You are eligible for voting\\n");\n\telse\n\t\tprintf("You are not eligible for voting\\n");\n\treturn 0;\n}\n',
					stdin: '21'
				},
				{
					id: 'ws2-ex06',
					label: 'EX 6',
					title: 'Compare two integers',
					mode: 'code',
					concept: 'relational operators',
					prompt:
						'Accept two integers and print their relationship using the symbols =, > and <. Test 9 and 9 as well as 12 and 23 — the equal case is the one most often forgotten.',
					hints: [
						'Start with == and handle it first; the remaining cases are < and >.',
						'Use %d in the format and a space in the literal around the symbol.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint a, b;\n\tprintf("Enter two integers: ");\n\tscanf("%d %d", &a, &b);\n\t/* Result: a <symbol> b */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint a, b;\n\tprintf("Enter two integers: ");\n\tscanf("%d %d", &a, &b);\n\tif (a == b)\n\t\tprintf("Result: %d = %d\\n", a, b);\n\telse if (a < b)\n\t\tprintf("Result: %d < %d\\n", a, b);\n\telse\n\t\tprintf("Result: %d > %d\\n", a, b);\n\treturn 0;\n}\n',
					stdin: '12 23',
					expectedStdout: 'Enter two integers: Result: 12 < 23'
				}
			]
		},
		{
			id: 'pointers',
			title: 'Pointers',
			exercises: [
				{
					id: 'ws2-ex07',
					label: 'EX 7',
					title: 'A pointer follows its variable',
					mode: 'code',
					concept: 'address and dereference',
					prompt:
						'Run the program, then reassign c = 36 and print again without touching pc. Explain why *pc changes while the address in pc does not. (Addresses differ per run, so compare by eye.)',
					hints: [
						'pc stores &c, so *pc means “the int at &c”.',
						'Assignment rewrites the int, not the address.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint c = 12;\n\tint *pc = &c;\n\tprintf("c = %d, *pc = %d\\n", c, *pc);\n\t/* set c = 36 and print again */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint c = 12;\n\tint *pc = &c;\n\tprintf("c = %d, *pc = %d\\n", c, *pc);\n\tc = 36;\n\tprintf("c = %d, *pc = %d\\n", c, *pc);\n\treturn 0;\n}\n'
				},
				{
					id: 'ws2-ex08',
					label: 'EX 8',
					title: 'A handle: int **ppc',
					mode: 'code',
					concept: 'double pointers',
					prompt:
						'Add int **ppc = &pc to the previous program. Print pc, *pc, ppc, *ppc and **ppc after setting c = 36. In one sentence, say what **ppc reads and how many dereferences it takes to reach the int.',
					hints: [
						'ppc points at pc; pc points at c; the int is two hops away.',
						'*ppc is the pointer pc; **ppc is the int c.'
					],
					starter:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint c = 12;\n\tint *pc = &c;\n\tint **ppc = &pc;\n\t/* print the five values, then set c = 36 and print again */\n\treturn 0;\n}\n',
					solution:
						'#include <stdio.h>\n\nint main(void)\n{\n\tint c = 12;\n\tint *pc = &c;\n\tint **ppc = &pc;\n\tc = 36;\n\tprintf("pc = %p, *pc = %d\\n", (void *)pc, *pc);\n\tprintf("ppc = %p, *ppc = %p\\n", (void *)ppc, (void *)*ppc);\n\tprintf("**ppc = %d\\n", **ppc);\n\treturn 0;\n}\n\n/* ppc -> pc -> c: two dereferences reach the int. c = 36 is seen\n   through **ppc because both handles point at the same storage;\n   the pointers themselves never move. */\n'
				}
			]
		}
	]
};