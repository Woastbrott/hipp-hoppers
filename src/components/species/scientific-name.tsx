import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Gattung und Art kursiv — taxonomische Konvention, kein Gestaltungseinfall.
 *
 * `<i>` und nicht `<em>`: die Kursive markiert hier keine Betonung, sondern einen
 * Namen in einer anderen Konvention. Genau dafuer ist `<i>` im HTML-Standard da,
 * und ein Screenreader betont es entsprechend nicht.
 *
 * Die `italic`-Klasse steht trotzdem dabei: Preflight laesst `<i>` zwar in Ruhe,
 * aber die Absicht soll im Markup stehen und nicht im Browser-Default.
 */
export function ScientificName({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <i className={cn('italic', className)}>{children}</i>;
}
