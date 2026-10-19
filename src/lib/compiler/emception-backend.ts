/**
 * Emception backend: real Clang/LLVM compiled to WebAssembly, running in a
 * worker, with the lesson's C piped through clang -cc1 → wasm-ld → wasi-run.
 *
 * Two things here are non-obvious and deliberate:
 *
 * 1. The toolchain lives in a worker and is reused between runs. Booting it
 *    takes ~0.3 s warm (manifest + VFS + first module); spawning a worker per
 *    compile costs about two seconds of latency on every Run.
 *
 * 2. Programs are killed by terminating the worker. A WASM instance that is
 *    spinning in `while (1);` cannot be interrupted from the main thread, so
 *    the only reliable stop is `worker.terminate()`. The next run boots a fresh
 *    worker; that is slower but correct, and infinite loops are the rare case.
 *
 * `compileAndRun` from the browser adapter drives the three phases; we only
 * add the watchdog, the timeout semantics, and the diagnostic parsing.
 */

import { compileAndRun, TOOLCHAIN_PRESETS } from '@gameguild/emception-browser';
import { WorkerClient } from '@gameguild/emception-browser/worker-client';
import { ToolchainPreset, type IOProvider } from 'emception';

import { logger } from '$lib/utils/logger';

import { parseDiagnostics } from './diagnostics';
import { withStripFlag } from './link-flags';
import { withPrelude } from './prelude';
import type { BackendOptions, CBackend, CompileResult, PhaseListener, RunPhase } from './types';

/**
 * Safari's JavaScriptCore rejects DWARF custom sections in the linked program
 * (see `link-flags.ts`), so the adapter's C link line gets `--strip-all`.
 */
function installStrippedLinkStep(): void {
	const preset = TOOLCHAIN_PRESETS[ToolchainPreset.C];
	if (!('linkArgv' in preset) || STRIPPED.has(preset)) return;
	const original = preset.linkArgv.bind(preset);
	preset.linkArgv = (paths) => withStripFlag(original(paths));
	STRIPPED.add(preset);
}

const STRIPPED = new WeakSet<object>();

/** Errors that mean the worker holds a truncated or unparsable module. */
const MODULE_PARSE_ERROR = /WebAssembly\.(Module|compile|instantiate)|doesn't parse|unexpected section|custom section/i;

/** Manifest of the vendored, pruned toolchain (40 MB, see AGENTS.md §3.1). */
export const DEFAULT_MANIFEST_URL = '/emception/cdn/manifest.json';

const SOURCE_PATH = '/home/user/main.c';
const OBJECT_PATH = '/home/user/main.o';
const WASM_PATH = '/home/user/main.wasm';
const WORKDIR = '/home/user';

/**
 * Wall-clock limit for the *program*, not for the build. Clang and wasm-ld are
 * allowed to take their time; a student's `while (1);` is not.
 */
export const RUN_TIMEOUT_MS = 5_000;

/** Booting fetches the manifest and three IDBFS layers; cold IDB can be slow. */
const BOOT_TIMEOUT_MS = 60_000;

/**
 * What `prewarm()` builds. It is never shown and never cached for the student:
 * its only job is to make Clang instantiate, extract its header tree, and link
 * once, so the first Run the student asks for reuses a worker that has already
 * paid that cost. `stdio.h` is deliberate — it is the header almost every
 * lesson's first program includes.
 */
const PREWARM_SOURCE = `#include <stdio.h>

int main(void) {
    puts("warm");
    return 0;
}
`;

/**
 * The worker talks to a terminal-shaped interface. This app has no terminal:
 * compilation output is returned from `run()` per phase, so the provider is
 * mostly a sink. `readByte` returns EOF — interactive `scanf` is fed through
 * the per-run stdin channel instead (see `compileAndRun`'s `stdin` option).
 */
class HeadlessIo implements IOProvider {
	supportsSynchronousExclusiveStdin = false;

	readByte(): number | null {
		return null;
	}

	writeLine(text: string): void {
		logger.debug('[emception:info]', text);
	}

	write(text: string): void {
		logger.debug('[emception:info]', text);
	}

	writeError(text: string): void {
		logger.debug('[emception:err]', text);
	}

	clear(): void {
		/* no terminal to clear */
	}
}

/**
 * Remove the previous run's object and module before a new build. The VFS
 * write path grows files in place, so a leftover `main.wasm` from a larger
 * program can leave stale bytes under a shorter one, and an interrupted pre-warm
 * can leave a half-written one. Either way the parser sees a module whose
 * sections no longer add up. Missing files are expected and ignored.
 */
async function clearBuildOutputs(client: WorkerClient): Promise<void> {
	for (const path of [OBJECT_PATH, WASM_PATH]) {
		try {
			await client.deleteFile(path);
		} catch {
			/* first build: nothing to delete */
		}
	}
}

type PhaseCallback = PhaseListener | undefined;

/** What the adapter's compile → link → run pipeline returns. */
type BuildOutcome = Awaited<ReturnType<typeof compileAndRun>>;

interface ToolOutput {
	exitCode: number;
	stdout: string;
	stderr: string;
}

function timeoutResult(partial: Partial<CompileResult> = {}): CompileResult {
	return {
		status: 'timeout',
		stdout: partial.stdout ?? '',
		stderr: partial.stderr ?? '',
		diagnostics: partial.diagnostics ?? [],
		exitCode: 124,
		durationMs: partial.durationMs ?? 0
	};
}

function phaseOutputs(outcome: BuildOutcome): ToolOutput {
	if (outcome.finalPhase === 'compile' && outcome.compile) return outcome.compile;
	if (outcome.finalPhase === 'link' && outcome.link) return outcome.link;
	return outcome.run ?? emptyOutput();
}

function emptyOutput(): ToolOutput {
	return { exitCode: 1, stdout: '', stderr: '' };
}

installStrippedLinkStep();

export class EmceptionBackend implements CBackend {
	readonly name = 'emception';

	private readonly manifestUrl: string;
	private readonly onPhase: PhaseCallback;

	private worker: Worker | null = null;
	private client: WorkerClient | null = null;
	private booting: Promise<void> | null = null;

	/** Set once a throwaway build has warmed the worker. */
	private prewarmed = false;

	/** While true, phase events are dropped (pre-warm is invisible to the UI). */
	private quiet = false;

	/** Serialises runs so a double click cannot interleave two compilations. */
	private queue: Promise<unknown> = Promise.resolve();

	private disposed = false;

	constructor(options: BackendOptions = {}) {
		this.manifestUrl = options.manifestUrl ?? DEFAULT_MANIFEST_URL;
		this.onPhase = options.onPhase;
	}

	/** True once the toolchain has booted and can accept a program. */
	get isReady(): boolean {
		return this.client !== null && this.booting === null;
	}

	async init(): Promise<void> {
		await this.boot();
	}

	/**
	 * Warm the worker without reporting anything to the UI: boot it, then build
	 * `PREWARM_SOURCE` through the normal queue so it cannot race a student Run.
	 * Idempotent; a failure here leaves the backend cold and the next Run boots
	 * from scratch, which is exactly the old behaviour.
	 */
	prewarm(): Promise<void> {
		const warm = () => this.prewarmOnce();
		const next = this.queue.then(warm, warm);
		this.queue = next.then(
			() => undefined,
			() => undefined
		);
		return next;
	}

	compileAndRun(source: string, stdin: string): Promise<CompileResult> {
		const run = () => this.execute(source, stdin);
		// Keep the chain alive even if a run rejects, so the next Run still works.
		const next = this.queue.then(run, run);
		this.queue = next.then(
			() => undefined,
			() => undefined
		);
		return next;
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		this.killWorker();
		this.booting = null;
	}

	// ---------------------------------------------------------------------
	// internals
	// ---------------------------------------------------------------------

	private async boot(): Promise<void> {
		if (this.disposed) throw new Error('Emception backend has been disposed');
		if (this.client) return;
		if (this.booting) return this.booting;

		this.booting = (async () => {
			this.emitPhase('boot');
			const worker = new Worker(new URL('./emception.worker.ts', import.meta.url), {
				type: 'module',
				name: 'emception-toolchain'
			});
			const client = new WorkerClient(worker, new HeadlessIo());
			const manifestUrl = new URL(this.manifestUrl, window.location.href).href;

			const bootTimeout = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('Timed out booting the C toolchain')), BOOT_TIMEOUT_MS);
			});

			try {
				await Promise.race([client.boot(manifestUrl), bootTimeout]);
			} catch (error) {
				worker.terminate();
				throw error;
			}

			this.worker = worker;
			this.client = client;
			logger.info('[compiler] toolchain ready');
		})();

		try {
			await this.booting;
		} finally {
			this.booting = null;
		}
	}

	private async prewarmOnce(): Promise<void> {
		if (this.disposed || this.prewarmed) return;

		this.quiet = true;
		try {
			await this.boot();
			const client = this.client;
			if (!client) return;

			await clearBuildOutputs(client);
			await compileAndRun(client, {
				toolchain: ToolchainPreset.C,
				source: PREWARM_SOURCE,
				stdin: '',
				cwd: WORKDIR,
				paths: { sourcePath: SOURCE_PATH, objectPath: OBJECT_PATH, wasmPath: WASM_PATH },
				onPhase: () => {
					/* deliberately silent */
				}
			});
			this.prewarmed = true;
			logger.info('[compiler] toolchain warmed');
		} catch (error) {
			// An interrupted or unparsable warm-up leaves a half-initialised
			// worker behind. Drop it so the first Run boots from scratch.
			this.killWorker();
			throw error;
		} finally {
			this.quiet = false;
		}
	}

	private async execute(source: string, stdin: string): Promise<CompileResult> {
		try {
			return await this.executeOnce(source, stdin);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!MODULE_PARSE_ERROR.test(message)) throw error;
			// A corrupt module in a recycled worker: one cold boot fixes it.
			logger.warn('[compiler] module parse failure; rebooting toolchain once', message);
			this.killWorker();
			return this.executeOnce(source, stdin);
		}
	}

	private async executeOnce(source: string, stdin: string): Promise<CompileResult> {
		const startedAt = performance.now();
		await this.boot();
		const client = this.client;
		if (!client) throw new Error('Emception backend is not available');

		let timedOut = false;
		let runTimer: ReturnType<typeof setTimeout> | undefined;
		let armRunTimer: (() => void) | undefined;

		const watchdog = new Promise<'timeout'>((resolve) => {
			armRunTimer = () => {
				runTimer = setTimeout(() => {
					timedOut = true;
					logger.warn(`[compiler] program exceeded ${RUN_TIMEOUT_MS} ms; terminating worker`);
					resolve('timeout');
				}, RUN_TIMEOUT_MS);
			};
		});

		await clearBuildOutputs(client);

		const outcome: BuildOutcome | 'timeout' = await Promise.race([
			compileAndRun(client, {
				toolchain: ToolchainPreset.C,
				source: withPrelude(source),
				stdin,
				cwd: WORKDIR,
				paths: { sourcePath: SOURCE_PATH, objectPath: OBJECT_PATH, wasmPath: WASM_PATH },
				onPhase: (phase: string) => {
					const mapped = phase as RunPhase;
					this.emitPhase(mapped);
					if (mapped === 'run') armRunTimer?.();
				}
			}),
			watchdog
		]).finally(() => {
			if (runTimer) clearTimeout(runTimer);
		});

		if (outcome === 'timeout') {
			// The instance is still spinning; the only way out is to remove it.
			this.killWorker();
			return timeoutResult({ durationMs: Math.round(performance.now() - startedAt) });
		}

		const durationMs = Math.round(performance.now() - startedAt);
		const output = phaseOutputs(outcome);
		const diagnostics = parseDiagnostics(`${output.stderr}\n${output.stdout}`);

		if (outcome.finalPhase === 'compile' || outcome.finalPhase === 'link') {
			return {
				status: 'compile-error',
				stdout: output.stdout,
				stderr: output.stderr,
				diagnostics,
				exitCode: output.exitCode,
				durationMs
			};
		}

		if (timedOut) return timeoutResult({ durationMs });

		// Workaround for an upstream toolchain bug: once a program has consumed
		// the shared-memory stdin channel, the *next* compile in the same worker
		// can hand wasi-run a truncated module ("unexpected section <Type>").
		// Terminating the worker costs one cold boot (~4 s) and keeps the next
		// program honest. Programs that never read stdin are unaffected.
		if (stdin.trim().length > 0) this.killWorker();

		return {
			status: output.exitCode === 0 ? 'success' : 'runtime-error',
			stdout: output.stdout,
			stderr: output.stderr,
			diagnostics,
			exitCode: output.exitCode,
			durationMs
		};
	}

	private emitPhase(phase: RunPhase): void {
		if (this.quiet) return;
		this.onPhase?.(phase);
	}

	private killWorker(): void {
		this.client?.terminate();
		this.worker?.terminate();
		this.client = null;
		this.worker = null;
	}
}