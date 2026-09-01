import Link from 'next/link';

import { Container } from '@/components/ui/container';

/**
 * Banner ueber der Draft-Vorschau.
 *
 * Absichtlich laut: `bloom` auf voller Flaeche, ganz oben, vor dem Inhalt. Wer eine
 * Art korrekturliest, soll nie im Zweifel sein, ob das gerade schon oeffentlich ist.
 * Ein dezenter Hinweis am Rand wuerde genau diesen Irrtum produzieren.
 *
 * `role="status"`: die Einordnung der ganzen Seite, keine Fehlermeldung — deshalb
 * nicht `alert`.
 */
export function DraftNotice({ speciesId }: { speciesId: string }) {
  return (
    <div role="status" className="bg-bloom text-paper">
      <Container className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
        <p className="font-mono text-label uppercase">Entwurf · öffentlich nicht sichtbar</p>

        {/* Der globale Fokusring ist `canopy` und kaeme auf `bloom` nur auf 2.1:1.
            Auf dieser Flaeche uebernimmt `paper` — in beiden Farbschemata. */}
        <Link
          href={`/admin/species/${speciesId}`}
          className="font-mono text-label uppercase underline underline-offset-4 hover:no-underline focus-visible:outline-paper"
        >
          Im Admin bearbeiten
        </Link>
      </Container>
    </div>
  );
}
