import type { WorksheetWeek } from './types';

/**
 * Week 4 — Windows batch files, Windows Script Host, and command-line admin.
 *
 * None of this can run in the browser: the sheet targets cmd.exe and WSH. The
 * cards are reading-and-reasoning tasks; the reference answers give the exact
 * commands a student would type on a Windows lab machine.
 */
export const week4: WorksheetWeek = {
	week: 4,
	title: 'Batch Files & Windows Scripting',
	lecture: 'Lecture 09–10 — Operating Systems & Scripting',
	duration: '90 minutes',
	source: 'worksheets/week-4/document.md',
	intro:
		'Before Bash there was batch: a line-oriented language where every command is a program and every variable is text. This lab reads batch and VBScript the way you read code you did not write — line by line, asking what state each command leaves behind.',

	figures: [],

	sections: [
		{
			id: 'batch',
			title: 'Batch files',
			note: 'Run these on a Windows machine. The cards here ask for the reading; the lab sheet asks for the typing.',
			exercises: [
				{
					id: 'ws4-ex01',
					label: 'EX 1',
					title: 'makedir.bat',
					mode: 'note',
					concept: 'batch parameters',
					prompt:
						'In makedir.bat, explain the purpose of rem and %1. What are the Unix equivalents of each, and what happens when the script is run with no argument?',
					hints: [
						'%1 is the first token after the script name on the command line.',
						'The if "%1"=="" test runs before any mkdir.'
					],
					solution:
						'rem introduces a comment; the Unix equivalent is # (a line starting with #). %1 expands to the first command-line argument; the Unix equivalent is $1.\n\nWith no argument the if "%1"=="" goto skip branch runs, so the script prints “No directory specified” and exits before creating anything. Without that guard, mkdir would try to create directories named \\dir1 in the current drive’s root, which usually fails or creates the wrong tree.'
				},
				{
					id: 'ws4-ex02',
					label: 'EX 2',
					title: 'Parent and child processes',
					mode: 'note',
					concept: 'process creation',
					prompt:
						'parent.bat does for %%j in (1,2,3,4,5) do call child.bat, and child.bat prompts with set /p. Describe the process relationship, what call changes compared with running child.bat directly, and which variables cross the boundary.',
					hints: [
						'call returns to the parent; direct invocation would replace it.',
						'Batch variables are inherited by children, but a child’s changes do not flow back.'
					],
					solution:
						'cmd.exe running parent.bat is the parent process. Each call child.bat starts a new cmd.exe child that runs to completion and returns control to the parent, five times in sequence.\n\nWithout call, control would transfer to child.bat and never return to the loop, so the parent would not continue. Environment variables set before the call are visible to the child; variables the child sets with set disappear when it exits, because each cmd.exe has its own environment block. Arguments (here %1) are how the parent passes values in.'
				},
				{
					id: 'ws4-ex03',
					label: 'EX 3',
					title: 'loop.bat',
					mode: 'note',
					concept: 'batch loops',
					prompt:
						'Explain %%i, %%n and %%c in loop.bat, and the roles of shift and pause. Then give the exact output of the /l loop and say how many times the labelled section runs when the script is called with three arguments.',
					hints: [
						'In a batch file, for variables use %%; at the prompt they use a single %.',
						'/l start,step,end counts arithmetically; shift discards %1 and renumbers.'
					],
					solution:
						'%%i is the loop variable in a for-in list (rock, paper, scissors); %%n is the counter in the numeric /l loop; %%c is the variable for each argument’s words. The doubled percent is required inside a batch file.\n\nThe /l loop prints 0, 10, 20, …, 100, one per line. The labelled :loop section runs once per remaining argument: three arguments means three passes, and shift after each pass moves the next argument into %1, so the loop stops when %1 is empty.'
				},
				{
					id: 'ws4-ex04',
					label: 'EX 4',
					title: 'Hello world in VBScript',
					mode: 'note',
					concept: 'WSH',
					prompt:
						'What does helloworld.vbs do, and what is the difference between running it with wscript.exe and with cscript.exe? Why does the first line start with an apostrophe?',
					hints: [
						'One host is graphical; the other is console.',
						'an apostrophe starts a VBScript comment.'
					],
					solution:
						'helloworld.vbs prints “Hello World” through WScript.Echo. The first line is a comment: everything after an apostrophe is ignored.\n\nwscript.exe runs the script in the GUI host, so Echo opens a message box. cscript.exe runs it in the console host, so Echo writes a line to stdout. The same .vbs file therefore produces different output depending on which host launched it.'
				},
				{
					id: 'ws4-ex05',
					label: 'EX 5',
					title: 'GUI versus console',
					mode: 'note',
					concept: 'hosts',
					prompt:
						'Compare double-clicking helloworld.vbs with running cscript helloworld.vbs. Give two advantages of the command-line host for lab work and one advantage of the GUI host.',
					hints: [
						'Think about output you can redirect, script, or log.',
						'Think about a user who does not have a terminal open.'
					],
					solution:
						'Double-clicking uses wscript.exe: the output appears in a dialog and the script blocks until someone clicks OK. cscript.exe writes to the console and exits immediately when the script ends.\n\nCommand-line advantages: output can be redirected or piped, and scripts can be run from a batch file or scheduled task without human interaction. GUI advantage: a non-technical user can start a script with one double-click and read the result without a terminal.'
				},
				{
					id: 'ws4-ex06',
					label: 'EX 6',
					title: 'Processor.vbs',
					mode: 'note',
					concept: 'WMI queries',
					prompt:
						'Processor.vbs queries Win32_ComputerSystem and Win32_Processor through WMI. Explain what GetObject("winmgmts:...") returns, what ExecQuery does, and which line would you change to include only physical (not logical) processors?',
					hints: [
						'Winmgmts: is the WMI moniker; root\\CIMV2 is the namespace.',
						'WQL looks like SQL but only supports a subset.'
					],
					solution:
						'GetObject("winmgmts:...") binds to the WMI service in the root\\CIMV2 namespace and returns a service object. ExecQuery sends a WQL statement and returns a collection of instances; For Each walks the collection.\n\nWin32_Processor returns one instance per logical processor, so the script prints one block per core/thread. Filtering to physical packages means querying Win32_Processor with a condition on the package or using the ProcessorId/NumberOfCores properties; Win32_ComputerSystem.NumberOfProcessors is the package count. The script prints both, which is why the two counts differ.'
				},
				{
					id: 'ws4-ex07',
					label: 'EX 7',
					title: 'Keyboard.vbs and the case for the CLI',
					mode: 'note',
					concept: 'scripting trade-offs',
					prompt:
						'Keyboard.vbs prints properties of every keyboard device through WMI. After seeing its output, would you revise your answer about GUI versus command-line scripting? Give reasons, including one case where the GUI host is the better choice.',
					hints: [
						'The output is long, repetitive, and machine-readable.',
						'A dialog per property would be unusable.'
					],
					solution:
						'The output is many lines of key/value pairs. That is exactly what a console host and redirection are good at: pipe it to a file, grep a device ID, diff two machines. A GUI message box per property would require dozens of clicks, so the earlier preference for cscript holds for this class of script.\n\nThe GUI host still wins when the audience is a user who needs one clear confirmation and has no terminal open — for example a “backup finished” notification.'
				},
				{
					id: 'ws4-ex08',
					label: 'EX 8',
					title: 'Build a folder tree',
					mode: 'note',
					concept: 'cmd built-ins',
					prompt:
						'Using only cmd.exe, create a folder CST1500 on the desktop containing a, b and c, then store the machine’s hostname in a\\hostname.txt. Give the exact commands.',
					hints: [
						'cd %USERPROFILE%\\Desktop puts you on the desktop.',
						'hostname prints the name; > writes stdout to a file.'
					],
					solution:
						'cd %USERPROFILE%\\Desktop\nmkdir CST1500\ncd CST1500\nmkdir a b c\nhostname > a\\hostname.txt\n\nmkdir accepts several names in one call, and > truncates the target before writing. If CST1500 already exists, mkdir fails; adding 2>nul or checking with if exist makes the script idempotent.'
				},
				{
					id: 'ws4-ex09',
					label: 'EX 9',
					title: 'Capture a directory tree',
					mode: 'note',
					concept: 'redirection',
					prompt:
						'Write the command that stores the structure of C:\\ in b\\c_files_structure.txt. Why is dir /s /b usually more useful for this than plain dir?',
					hints: [
						'/b removes headers and summary lines; /s recurses.',
						'Plain dir output is formatted for humans, not for diffing.'
					],
					solution:
						'dir C:\\ /s /b > b\\c_files_structure.txt\n\n/b prints bare paths, one per line, and /s walks every subdirectory. That produces a stable, machine-readable listing that can be compared or searched; plain dir adds headers, dates, sizes and summary lines that change on every run.'
				},
				{
					id: 'ws4-ex10',
					label: 'EX 10',
					title: 'Move folders with their contents',
					mode: 'note',
					concept: 'move versus copy',
					prompt:
						'Move a and b, with everything inside them, into c. Give the command and say what changes for the files’ paths.',
					hints: [
						'move works on directories, not just files.',
						'The folder names stay the same; only their parent changes.'
					],
					solution:
						'move a c\\a\nmove b c\\b\n\nEach subtree is relocated: c\\a\\hostname.txt and c\\b\\c_files_structure.txt. The file names are unchanged. On the same volume move is a rename, so it is fast; across volumes it copies then deletes.'
				},
				{
					id: 'ws4-ex11',
					label: 'EX 11',
					title: 'Check a path',
					mode: 'note',
					concept: 'existence tests',
					prompt:
						'What is PATH for? Write a batch fragment that takes a path as its first argument and prints whether it exists, without crashing when the argument is missing.',
					hints: [
						'if exist "%~1" is the safe test; quotes protect spaces.',
						'%~1 strips surrounding quotes; %1 keeps them.'
					],
					solution:
						'PATH is the list of directories the command interpreter searches, in order, when you type a program name. Without it you would type full paths for every command.\n\nif "%~1"=="" (\n  echo Usage: %~nx0 path\n  exit /b 1\n)\nif exist "%~1" (\n  echo Exists: %~1\n) else (\n  echo Not found: %~1\n)\n\nThe first guard prevents the empty-string case from being tested as a path; the quotes keep spaces in a single token.'
				}
			]
		}
	]
};