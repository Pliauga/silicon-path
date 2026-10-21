import type { WorksheetWeek } from './types';

/**
 * Week 5 — Bash: scripts, permissions, arguments, tests, loops.
 *
 * Every card is a note task: the reference answer is the script the lab sheet
 * asks for. Students type the commands into the terminal embedded below the
 * figures, then compare behaviour with the answer.
 */
export const week5: WorksheetWeek = {
	week: 5,
	title: 'Unix Shell Scripting with Bash',
	lecture: 'Lecture 10–11 — OS, Processes, Shell',
	duration: '120 minutes',
	source: 'worksheets/week-5/document.md',
	intro:
		'A shell script is a program made of other programs. This lab starts with the two characters every script begins with, then builds up arguments, tests, and loops. Use the terminal on this page to try each command before writing it into a script; the sandbox cannot touch your real machine.',

	figures: [
		{
			kind: 'bash',
			caption:
				'Figure 1 — a sandboxed shell. Try ls, cd, echo, chmod, and running a script before you rely on these commands for real.'
		}
	],

	sections: [
		{
			id: 'scripts',
			title: 'Writing and running scripts',
			note: 'The first line of a script is a promise about which interpreter will read the rest.',
			exercises: [
				{
					id: 'ws5-ex01',
					label: 'EX 1',
					title: 'Write script1',
					mode: 'note',
					concept: 'script anatomy',
					prompt:
						'Write script1: clear the screen, greet the current user, list processes, set COLOUR and VALUE, and echo both. Then give the commands that make it executable and run it.',
					hints: [
						'$USER is set by the shell; quotes are needed around text with spaces.',
						'chmod u+x script1 adds execute permission for the owner.'
					],
					solution:
						'#!/bin/bash\nclear\necho "The script starts now."\necho\necho "Hi, $USER!"\necho\necho "Here is a list of your processes:"\nps l\necho\nCOLOUR="Black"\nVALUE="9"\necho "This is a string: $COLOUR"\necho "This is a number: $VALUE"\necho\necho "Returning you to the command prompt now."\n\nchmod u+x script1\n./script1\n\nclear is a terminal command, not part of Bash; ps l lists the current user’s processes; the two assignments are plain shell variables, not exported.'
				},
				{
					id: 'ws5-ex02',
					label: 'EX 2',
					title: 'Permissions, ./ and PATH',
					mode: 'note',
					concept: 'execute permission',
					prompt:
						'After ls -l, script1 shows rw-r--r--. Explain each of the ten characters, why running ./script1 fails before chmod, and the two ways to make the shell find a script that is executable but in the current directory.',
					hints: [
						'The first character is the file type; the next nine are three triplets.',
						'The current directory is not on PATH by default, deliberately.'
					],
					solution:
						'The first character is the type: - for a regular file, d for a directory. The next nine split into owner, group, others; each triplet is r (read), w (write), x (execute). rw-r--r-- means the owner may read and write but not execute; group and others may read only.\n\nWithout x the kernel refuses to exec the file, so ./script1 gives “Permission denied”. chmod u+x adds execute for the owner. Once executable, ./script1 names the file explicitly; alternatively export PATH="$PATH:$PWD" adds the current directory to the search path, which is convenient but risky because any file named like a command can then shadow it.'
				},
				{
					id: 'ws5-ex03',
					label: 'EX 3',
					title: 'Save the script somewhere else',
					mode: 'note',
					concept: 'filesystems and mounts',
					prompt:
						'The sheet asks you to copy your scripts to a USB stick. Give the commands to find the device, mount it, copy the script, flush writes, and unmount it safely. Why is umount required before unplugging?',
					hints: [
						'lsblk lists block devices; mount attaches a filesystem to a directory.',
						'Buffered writes may still be in memory when the copy command returns.'
					],
					solution:
						'lsblk\nsudo mkdir -p /mnt/usb\nsudo mount /dev/sdb1 /mnt/usb\ncp script1 script2 /mnt/usb/\nsync\nsudo umount /mnt/usb\n\numount flushes pending writes and detaches the filesystem. Pulling the stick with dirty buffers can leave a half-written file or a corrupt directory entry, even though cp appeared to succeed.'
				},
				{
					id: 'ws5-ex04',
					label: 'EX 4',
					title: 'Comments and the shebang',
					mode: 'note',
					concept: 'shebang',
					prompt:
						'Copy script1 to script2, add comments explaining each block, and run it. What does the line #!/bin/bash actually do, and why does the script still work when run as bash script2 without it?',
					hints: [
						'#! is read by the kernel when the file is executed directly.',
						'When you name the interpreter, the kernel never reads the shebang.'
					],
					solution:
						'The shebang is a two-byte magic number followed by the interpreter path. When the file is executed directly (./script2), the kernel reads it and starts /bin/bash with the script as its argument.\n\nIf you run bash script2, you have already chosen the interpreter, so the kernel never consults the first line. Comments after # (outside quotes) are ignored by the shell. Running script2 after adding only comments produces the same output as script1, which is the point of the exercise.'
				},
				{
					id: 'ws5-ex05',
					label: 'EX 5',
					title: 'Debug with bash -x',
					mode: 'note',
					concept: 'tracing',
					prompt:
						'Run bash -x script2. What do the lines beginning with + show, and at what point in execution are they printed? Give one bug that -x makes obvious but a normal run hides.',
					hints: [
						'The trace shows the command after expansion, before execution.',
						'Unset or empty variables become visible as empty arguments.'
					],
					solution:
						'Each + line is a trace of one command after parameter expansion, command substitution and word splitting, printed before that command runs. (PS4 controls the prefix.)\n\nA normal run just prints the final output; the trace shows the intermediate values. A missing argument, an unquoted variable that splits into two words, or a variable that is empty when you expected a value is immediately visible as a malformed + line.'
				},
				{
					id: 'ws5-ex06',
					label: 'EX 6',
					title: 'script3: arguments and guard clauses',
					mode: 'note',
					concept: 'positional parameters',
					prompt:
						'Explain $#, $1 and $2 in script3, then give the exact output of script3 95 193. What happens with one argument, and where does that behaviour come from?',
					hints: [
						'Ideal weight is height − 110.',
						'[ ! $# -eq 2 ] is true whenever the count is not exactly two.'
					],
					solution:
						'$# is the number of positional parameters, $1 the first, $2 the second. The guard if [ ! $# -eq 2 ] prints a usage line and exits 1 unless exactly two arguments are supplied.\n\nFor 95 193: idealweight = 193 − 110 = 83; 95 > 83, so the else branch prints “You should eat a bit more fruit.” With one argument the guard fires, prints Usage: script3 weight_in_kilos height_in_centimeters, and exits with status 1 before any arithmetic.'
				},
				{
					id: 'ws5-ex07',
					label: 'EX 7',
					title: 'script4: $0, $@ and indirect expansion',
					mode: 'note',
					concept: 'special parameters',
					prompt:
						'Run script4 with no arguments, then with six. Explain $0, $# and $@, and what the ${!currentparam} line does that a plain $currentparam would not.',
					hints: [
						'$0 is the name used to invoke the script.',
						'Indirect expansion treats the value of a variable as the name of another.'
					],
					solution:
						'$0 is the script’s invocation name (./script4 or script4a); $# is the argument count; $@ expands to the list of arguments, one word each.\n\nWith no arguments the count is 0 and the script prints “No parameters were supplied.” With six arguments it loops six times, printing $1 through $6. ${!currentparam} does indirect expansion: currentparam holds 1, 2, …, so the expansion reads $1, $2, …. A plain $currentparam would just print the number.'
				},
				{
					id: 'ws5-ex08',
					label: 'EX 8',
					title: 'script5: validate the input',
					mode: 'note',
					concept: 'read and validation',
					prompt:
						'script5 reads a number and echoes a message that many times. Describe what happens for 0, 100, an empty line, and the word five. Then add validation so only 1–10 is accepted.',
					hints: [
						'The while test is numeric; a non-number makes it fail with a diagnostic.',
						'[[ $number =~ ^[0-9]+$ ]] tests that the input is all digits.'
					],
					solution:
						'For 0 the while test is false and nothing is printed. For 100 the loop prints 100 lines — the script does not enforce its own “between 1 and 10” claim. An empty line leaves number empty; [ "" -gt 0 ] prints “integer expression expected” and the loop is skipped. The word five fails the numeric test the same way.\n\nread -r number\nif ! [[ $number =~ ^[0-9]+$ ]] || [ "$number" -lt 1 ] || [ "$number" -gt 10 ]; then\n  echo "Enter a whole number from 1 to 10." >&2\n  exit 1\nfi\n\nQuoting "$number" matters: an empty unquoted value makes [ see too few arguments.'
				},
				{
					id: 'ws5-ex09',
					label: 'EX 9',
					title: 'Read the mysystem.sh pipeline',
					mode: 'note',
					concept: 'pipes',
					prompt:
						'Explain line 12 of mysystem.sh: w | cut -d " " -f 1 - | grep -v USER | sort -u. What does each stage add, and what does the final list contain?',
					hints: [
						'w lists logged-in users and their sessions.',
						'cut selects a field; grep -v removes matching lines; sort -u deduplicates.'
					],
					solution:
						'w prints a header plus one line per session. cut -d " " -f 1 takes the first space-separated field of each line, which is the username (the header yields “USER” and stray blanks). grep -v USER drops the header line. sort -u sorts and removes duplicates, so a user with two sessions appears once.\n\nThe result is a plain sorted list of distinct logged-in usernames. Each stage does one thing; reading the pipeline left to right is the whole skill.'
				},
				{
					id: 'ws5-ex10',
					label: 'EX 10',
					title: 'echo versus printf',
					mode: 'note',
					concept: 'formatted output',
					prompt:
						'Rewrite mysystem.sh with printf. What differences appear in the output, and why does printf give the script a meaningful exit status while echo does not?',
					hints: [
						'printf does not append a newline; you must put \\n in the format.',
						'A format mismatch makes printf fail and return non-zero.'
					],
					solution:
						'With printf every line needs an explicit \\n, so the script becomes longer but the output is identical if the format strings are correct. printf also interprets %s, %d and escapes predictably across shells, whereas echo’s handling of -n and backslashes varies.\n\nprintf returns non-zero if it cannot satisfy the format (for example a missing argument for %s) or if the write fails, so a wrapper or set -e can react. echo almost always exits 0, even when its arguments are wrong for the intended purpose.'
				}
			]
		},
		{
			id: 'variables',
			title: 'Variables, quoting and tests',
			exercises: [
				{
					id: 'ws5-ex11',
					label: 'EX 11',
					title: 'Create, use and export variables',
					mode: 'note',
					concept: 'environment variables',
					prompt:
						'Explain why MYVAR-2="2" and MYVAR1 ="2" fail, then demonstrate the difference between a shell variable and an exported variable using a child bash. What does unset do?',
					hints: [
						'Variable names cannot contain -; spaces around = split the assignment into a command and an argument.',
						'Children inherit exported variables only.'
					],
					solution:
						'MYVAR-2="2" fails because - is not legal in a name: Bash parses MYVAR-2 as a command. MYVAR1 ="2" fails because the space ends the assignment, so Bash tries to run the command MYVAR1 with argument =2.\n\nfull_name="Franky M. Singh"\nbash\n# echo $full_name prints nothing: the child has its own environment\nexit\nexport full_name\nbash\n# now the child prints Franky M. Singh\n\nunset removes the variable from the current shell (and from what later children inherit). Exporting after assignment is allowed; changes made in a child never propagate back to the parent.'
				},
				{
					id: 'ws5-ex12',
					label: 'EX 12',
					title: 'Escaping and quoting',
					mode: 'note',
					concept: 'quoting',
					prompt:
						'With date=20021226, give the output of echo $date, echo \\$date, echo \'$date\' and echo "$date". Then state the rule for single quotes, double quotes, and backslash.',
					hints: [
						'Single quotes preserve every character literally.',
						'Double quotes allow $, backticks and backslash to keep their meaning.'
					],
					solution:
						'echo $date → 20021226. echo \\$date → $date (the backslash removes the dollar’s special meaning). echo \'$date\' → $date (single quotes are literal). echo "$date" → 20021226 (double quotes still expand variables).\n\nRules: single quotes preserve everything, including backslashes and $; double quotes preserve everything except $, backticks, and backslash before those characters or a newline; an unquoted backslash escapes the next character. Default to double quotes around variable expansions, and single quotes around literal patterns.'
				},
				{
					id: 'ws5-ex13',
					label: 'EX 13',
					title: 'if, file tests and leap years',
					mode: 'note',
					concept: 'test primaries',
					prompt:
						'In Example 1, explain each test and command inside the if body. In Example 2, trace the leap-year logic for 2024 and 1900. Then name two things in the printed script that would fail in a modern shell.',
					hints: [
						'-f tests a regular file; ls -lh, file, ls -i and df answer different questions.',
						'1900 is divisible by 100 but not 400.'
					],
					solution:
						'[ -f "$FILENAME" ] is true only for a regular file. ls -lh prints a human-readable size, file identifies the type, ls -i prints the inode, and df -h names the filesystem and mount point.\n\n2024: 2024 % 400 ≠ 0; 2024 % 4 = 0 and 2024 % 100 ≠ 0, so it is a leap year. 1900: % 400 ≠ 0, % 4 = 0, but % 100 = 0, so it is not. The printed script ends with “Fi” instead of “fi”, which is a syntax error, and uses the obsolete $[...] arithmetic form; use (( )) or $(( )).'
				},
				{
					id: 'ws5-ex14',
					label: 'EX 14',
					title: 'Boolean operators in (( ))',
					mode: 'note',
					concept: 'arithmetic context',
					prompt:
						'Why does (( ... )) allow && and || where [ ... ] does not? Rewrite the leap-year test with a single (( )) expression and say what the script prints in 2024.',
					hints: [
						'(( )) is arithmetic context: C-like operators, no $ needed on names.',
						'[ ] is the test command; its arguments are strings, and && is a shell operator.'
					],
					solution:
						'(( )) evaluates a C-like arithmetic expression and returns 0 (true) if the result is non-zero. Inside it, && || ! % work as in C, and variables are named without $. [ ] is a separate command whose arguments are strings; combining tests there requires -a/-o or separate commands joined by shell && / ||.\n\nif (( (year % 400 == 0) || (year % 4 == 0 && year % 100 != 0) )); then\n  echo "Leap year"\nelse\n  echo "Not a leap year"\nfi\n\nIn 2024 this prints “Leap year”.'
				},
				{
					id: 'ws5-ex15',
					label: 'EX 15',
					title: 'Three small scripts',
					mode: 'note',
					concept: 'command substitution and loops',
					prompt:
						'Write three scripts: (1) print the date, username and current directory; (2) reverse the digits of a number; (3) sum the digits. In the sheet’s loop, why does [$n –gt 0] fail even after fixing the dash?',
					hints: [
						'$(command) substitutes output; $PWD gives the directory.',
						'[ needs spaces around every token: [ "$n" -gt 0 ].'
					],
					solution:
						'#!/bin/bash\necho "Current Date:"\ndate\necho "Username:"\nwhoami\necho "Current directory:"\npwd\n\nReverse:\nread -r n\nrev=""\nwhile [ "$n" -gt 0 ]; do\n  rev="$rev$((n % 10))"\n  n=$((n / 10))\ndone\necho "Reversed: $rev"\n\nSum: same loop with sum=$((sum + n % 10)).\n\n[$n –gt 0] fails twice: the brackets are glued to the operands, so the shell sees a command named [$n, and – is an en dash, not the ASCII minus. [ is a command and requires whitespace around every argument.'
				},
				{
					id: 'ws5-ex16',
					label: 'EX 16',
					title: 'Styled output and the largest of three',
					mode: 'note',
					concept: 'ANSI escapes and arguments',
					prompt:
						'Write a script that prints Hello World in bold and blink, and another that takes three numbers as arguments and prints the largest, with a usage error when fewer than three are supplied.',
					hints: [
						'printf "\\033[1m...\\033[0m" controls bold; blink is \\033[5m.',
						'Validate $# before comparing; compare with (( )) or -gt.'
					],
					solution:
						'printf "\\033[1;5;31mHello World\\033[0m\\n"\n\n# ANSI SGR codes: 1 bold, 5 blink, 31 red, 0 reset.\n\nif [ "$#" -lt 3 ]; then\n  echo "Usage: $0 a b c" >&2\n  exit 1\nfi\nlargest=$1\nfor n in "$@"; do\n  if [ "$n" -gt "$largest" ]; then largest=$n; fi\ndone\necho "Largest: $largest"\n\nQuoting "$@" preserves each argument as one word, including arguments with spaces.'
				},
				{
					id: 'ws5-ex17',
					label: 'EX 17',
					title: 'Add arguments, count down',
					mode: 'note',
					concept: 'argument arithmetic',
					prompt:
						'Write a script that adds two numbers supplied as arguments and errors when either is missing. Then write a while loop that prints 5 4 3 2 1.',
					hints: [
						'Validate $# = 2 before arithmetic; arithmetic on an empty string is 0, which hides the error.',
						'Decrement with n=$((n - 1)) inside the loop body.'
					],
					solution:
						'if [ "$#" -ne 2 ]; then\n  echo "Usage: $0 num1 num2" >&2\n  exit 1\nfi\necho "$(( $1 + $2 ))"\n\nn=5\nwhile [ "$n" -gt 0 ]; do\n  echo -n "$n "\n  n=$((n - 1))\ndone\necho\n\nInside $(( )) the $ on positional parameters is optional, but quoting the guard test is required so a missing argument becomes an empty string rather than a syntax error.'
				}
			]
		}
	]
};