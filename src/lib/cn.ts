export type ClassValue = string | number | false | null | undefined;

/**
 * Minimaler Klassen-Joiner. Bewusst ohne clsx/tailwind-merge: der Primitives-Satz ist
 * klein genug, dass Varianten nicht kollidieren — und zwei Dependencies fuer ein
 * `filter().join()` waeren keine.
 */
export function cn(...values: ClassValue[]): string {
  return values
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
}
