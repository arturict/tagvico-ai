import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * A state updater that keeps the current value when a refetch returns the same
 * data, so polling and the refresh after a page load do not re-render the shell.
 */
export function keepIfUnchanged<T>(next: T) {
  return (current: T) => JSON.stringify(current) === JSON.stringify(next) ? current : next
}
