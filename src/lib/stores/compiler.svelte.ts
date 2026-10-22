/**
 * Compiler session state for the playground.
 *
 * Owns one backend instance, the current result, and the phase indicator. The
 * Emception adapter is imported dynamically on the first Run so the playground
 * route does not pay for the compiler until the student actually compiles
 * something (AGENTS.md §10).
 */

import { logger } from '$lib/utils/logger';
import type { CBackend, CompileResult, Diagnostic, RunPhase } from '$lib/compiler';

/**
 * Lifecycle of the background warm-up. `cold` means nobody has asked the
 * toolchain to boot; `warming` means a throwaway build is in flight; `warm`
 * means the student's first Run reuses a booted Clang; `failed` means the
 * pre-warm error was swallowed and the next Run will boot from scratch.
 */
export type WarmupState = 'cold' | 'warming' | 'warm' | 'failed';

export type RunState =
	| 'idle'
	| 'booting'
	| 'running'
	| 'success'
	| 'compile-error'
	| 'runtime-error'
	| 'timeout'
	| 'backend-error';

export const DEFAULT_SOURCE = `#include <stdio.h>

int main(void) {
    int age = 42;
    printf("Hello, Silicon Path!\\n");
    printf("An int is %zu bytes on this machine.\\n", sizeof(int));
    printf("age lives at %p and holds %d\\n", (void *)&age, age);
    return 0;
}
`;

class CompilerStore {
	state = $state<RunState>('idle');
	/** Phase reported by the backend while a run is in flight. */
	phase = $state<RunPhase | null>(null);
	result = $state<CompileResult | null>(null);
	/** Boot failures (missing manifest, no WebAssembly, disposed worker). */
	error = $state<string | null>(null);

	warmup = $state<WarmupState>('cold');

	diagnostics = $derived<Diagnostic[]>(this.result?.diagnostics ?? []);

	isBusy = $derived(this.state === 'booting' || this.state === 'running');

	private backend: CBackend | null = null;

	/**
	 * Boot the toolchain and build a throwaway program while the student is
	 * still reading the page. Silent by construction: it never touches
	 * `state`, `phase`, `result` or `error`, so the console cannot claim a
	 * build nobody asked for.
	 */
	async prewarm(): Promise<void> {
		if (this.warmup !== 'cold') return;
		this.warmup = 'warming';

		try {
			const backend = await this.ensureBackend();
			await backend.prewarm();
			this.warmup = 'warm';
		} catch (cause) {
			// A failed warm-up is not an error the student needs to see: the
			// first Run will retry the boot and report anything real there.
			logger.warn('[compiler] pre-warm failed; first run will pay full boot', cause);
			this.warmup = 'failed';
		}
	}

	async run(source: string, stdin: string): Promise<void> {
		if (this.isBusy) return;

		this.error = null;
		this.result = null;
		this.state = 'booting';
		this.phase = 'boot';

		try {
			const backend = await this.ensureBackend();
			this.state = 'running';
			const result = await backend.compileAndRun(source, stdin);
			this.result = result;
			this.state = result.status;
		} catch (cause) {
			logger.error('[compiler] run failed', cause);
			this.error = cause instanceof Error ? cause.message : String(cause);
			this.state = 'backend-error';
		} finally {
			this.phase = null;
		}
	}

	/** Release the worker (the toolchain is ~1 GB of WASM memory). */
	async dispose(): Promise<void> {
		await this.backend?.dispose();
		this.backend = null;
		this.state = 'idle';
		this.result = null;
		this.phase = null;
		this.warmup = 'cold';
	}

	private async ensureBackend(): Promise<CBackend> {
		if (this.backend) return this.backend;

		const { createBackend } = await import('$lib/compiler');
		this.backend = createBackend({
			onPhase: (phase) => {
				// Pre-warm must not look like a build the student started.
				if (this.warmup === 'warming') return;
				this.phase = phase;
				if (phase !== 'boot') this.state = 'running';
			}
		});
		await this.backend.init();
		return this.backend;
	}
}

export const compiler = new CompilerStore();