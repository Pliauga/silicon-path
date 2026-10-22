/* eslint-disable no-console -- this module is the single sanctioned console shim */
/**
 * Tiny logger so the rest of the app never calls `console` directly
 * (AGENTS.md §8). Diagnostics from the compiler are noisy by nature — this
 * keeps them in dev builds and out of the shipped bundle's hot path.
 *
 * Only warnings and errors are printed in production; debug/info are dropped.
 */

const isDev = import.meta.env.DEV;

type LogArgs = unknown[];

export const logger = {
	debug(...args: LogArgs): void {
		if (isDev) console.debug(...args);
	},
	info(...args: LogArgs): void {
		if (isDev) console.info(...args);
	},
	warn(...args: LogArgs): void {
		console.warn(...args);
	},
	error(...args: LogArgs): void {
		console.error(...args);
	}
} as const;