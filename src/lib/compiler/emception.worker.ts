/**
 * Web Worker entry for the Emception toolchain.
 *
 * The worker owns every WASM instance (clang, wasm-ld, wasi-run) and the
 * toolchain VFS. Clang is a ~115 MB module, so it must never touch the main
 * thread — compilation and execution both happen here.
 *
 * The package's worker entry registers its own message handler; importing it
 * for side effects is all this file needs to do. Vite bundles it as a separate
 * worker chunk (see `emception-backend.ts`).
 */

import '@gameguild/emception-browser/worker';