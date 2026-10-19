/**
 * Source prelude for the in-browser C toolchain.
 *
 * Two behaviours of the linked WASI program are wrong for a student, and both
 * are fixed here by prepending a few lines to the program before it is
 * compiled:
 *
 * 1. Output without a trailing newline vanished. The link uses `--entry=main`,
 *    so returning from `main` never runs libc's exit path and the stdout buffer
 *    is never flushed: `printf("Enter a number: ");` printed nothing. A
 *    constructor makes stdout unbuffered, so every write reaches the console.
 *
 * 2. `exit(n)` trapped. The bundled libc has no `exit`, so the link leaves an
 *    undefined `env.exit` import and calling it hits `unreachable`, which the
 *    runner reports as a runtime error with exit code 1 even for `exit(0)`.
 *    The prelude defines `exit` on top of WASI `proc_exit`, which the runner
 *    already turns into a clean exit code.
 *
 * Everything sits ahead of a `#line 1` marker, so the student's
 * first line is still line 1 and compiler diagnostics point at the right place.
 * Kept free of toolchain imports so it can be unit-tested without the adapter.
 */

/** The marker that resets Clang's line counter to the student's first line. */
export const LINE_RESET = '#line 1';

/**
 * The prelude lines. The block is followed by `#line 1`, so it occupies no
 * line numbers as far as the student's diagnostics are concerned.
 */
const PRELUDE_LINES: readonly string[] = [
	// No #include and no libc names: a student who forgets <stdio.h> must still
	// get real C's "implicit declaration" error, and a later #include must not
	// clash with what we declare. So every libc symbol is bound through an
	// __asm__ label under a private C identifier (__sp_*), which the student's
	// own declarations of setvbuf/fflush/exit/stdout never collide with.
	'extern void *const __sp_stdout __asm__("stdout");',
	'extern int __sp_setvbuf(void *, char *, int, __SIZE_TYPE__) __asm__("setvbuf");',
	'extern int __sp_fflush(void *) __asm__("fflush");',
	'__attribute__((import_module("wasi_snapshot_preview1"), import_name("proc_exit"), noreturn)) extern void __sp_proc_exit(int);',
	'__attribute__((constructor)) static void __sp_unbuffer(void) { __sp_setvbuf(__sp_stdout, 0, 2, 0); }',
	'__attribute__((noreturn)) void __sp_exit(int) __asm__("exit");',
	'void __sp_exit(int code) { __sp_fflush(0); __sp_proc_exit(code); }',
	LINE_RESET
];

export const PRELUDE = `${PRELUDE_LINES.join('\n')}\n`;

/** Prepend the prelude. The student's first line stays line 1 (`#line 1`). */
export function withPrelude(source: string): string {
	return `${PRELUDE}${source}`;
}
