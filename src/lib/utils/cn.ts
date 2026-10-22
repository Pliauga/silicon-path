import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Standard shadcn-style class combiner: conditional classes, de-duplicated. */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
