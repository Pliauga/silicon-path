/**
 * Public surface of the compiler module.
 *
 * UI code imports from here, never from the Emception adapter directly, so a
 * backend swap stays a one-file change.
 */

export { EmceptionBackend, DEFAULT_MANIFEST_URL, RUN_TIMEOUT_MS } from './emception-backend';
export { parseDiagnostics, hasBuildFailure } from './diagnostics';
export type {
	BackendOptions,
	CBackend,
	CompileResult,
	CompileStatus,
	Diagnostic,
	PhaseListener,
	RunPhase
} from './types';

import { EmceptionBackend } from './emception-backend';
import type { BackendOptions, CBackend } from './types';

/** Create the default backend (Emception/Clang). */
export function createBackend(options: BackendOptions = {}): CBackend {
	return new EmceptionBackend(options);
}