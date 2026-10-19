/**
 * Link-step policy for the in-browser C toolchain.
 *
 * Safari (JavaScriptCore) rejects the linked program with
 * `WebAssembly.Module doesn't parse at byte N: can't get 11th custom section's ...`.
 * The bundled `libc.a` / `libcompiler_rt.a` objects carry DWARF, so every
 * `main.wasm` ships ten custom sections (`.debug_*`, `name`, `producers`,
 * `target_features`); V8 tolerates them, JSC does not. The app never debugs the
 * output, so the link step strips them all. Measured on the pre-warm program:
 * 49,383 B with 10 custom sections -> 2,229 B with none. `clang.wasm` and
 * `lld.wasm` themselves have no custom sections, so only `main.wasm` needs this.
 *
 * Kept free of toolchain imports so it can be unit-tested without the adapter.
 */

export const STRIP_FLAG = '--strip-all';

/** Append the strip flag to a wasm-ld argv exactly once. */
export function withStripFlag(argv: readonly string[]): string[] {
	return argv.includes(STRIP_FLAG) ? [...argv] : [...argv, STRIP_FLAG];
}
