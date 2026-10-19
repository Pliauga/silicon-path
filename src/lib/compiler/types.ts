/**
 * The compiler contract.
 *
 * Everything in the app talks to C through `CBackend`. Emception (Clang
 * compiled to WebAssembly) is the only backend today; the interface exists so
 * a different toolchain (c2wasm, a future Wasm LLVM build) can be dropped in
 * without touching the editor, the console, or the stores.
 *
 * See AGENTS.md §7 — these shapes are the contract, not an implementation
 * detail. UI code may only depend on what is declared here.
 */

export interface Diagnostic {
	severity: 'error' | 'warning' | 'note';
	/** The compiler's own message, with file/line prefixes stripped. */
	message: string;
	/** 1-based line in the user's source. 0 when the tool did not report one. */
	line: number;
	/** 1-based column, 0 when unknown. */
	column: number;
	/** File the diagnostic came from, e.g. `main.c` or `wasm-ld`. */
	source: string;
}

export type CompileStatus = 'success' | 'compile-error' | 'runtime-error' | 'timeout';

export interface CompileResult {
	status: CompileStatus;
	stdout: string;
	stderr: string;
	diagnostics: Diagnostic[];
	exitCode: number;
	durationMs: number;
}

/** Coarse phases reported while a program is built and executed. */
export type RunPhase = 'boot' | 'write' | 'compile' | 'link' | 'run';

export type PhaseListener = (phase: RunPhase) => void;

export interface CBackend {
	name: string;
	/** Boot the toolchain. Safe to call repeatedly; the work happens once. */
	init(): Promise<void>;
	compileAndRun(source: string, stdin: string): Promise<CompileResult>;
	/**
	 * Pay the cold-boot cost in the background: boot the worker *and* build a
	 * throwaway program, so the student's first real Run reuses a warm Clang.
	 * Idempotent, serialised behind the same queue as runs, and silent (it must
	 * not emit phases — the console would claim a build the student did not ask
	 * for). Failures are the caller's to swallow; a pre-warm that fails simply
	 * means the first Run pays full price again.
	 */
	prewarm(): Promise<void>;
	/** Terminate the worker and release the toolchain's memory. */
	dispose(): Promise<void>;
}

export interface BackendOptions {
	/** URL of the toolchain manifest, relative to the page. */
	manifestUrl?: string;
	/** Called as the backend moves between phases (used by the console UI). */
	onPhase?: PhaseListener;
}