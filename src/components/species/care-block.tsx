import { cn } from '@/lib/cn';
import type { CareFact } from '@/lib/species/care';

/**
 * Die harten Zahlen als eigenes Gestaltungselement: durchgehend Mono, oben eine
 * kraeftige Linie, jede Angabe als Label ueber ihrem Wert.
 *
 * Label und Wert stehen untereinander statt nebeneinander, weil der Block in einer
 * schmalen Spalte sitzt. Zweispaltig passte "Schwierigkeit / Fortgeschritten" gerade
 * eben — der naechste etwas laengere Wert waere darueber hinausgelaufen, und eine
 * Zahlenkolonne, die je nach Inhalt umbricht, ist keine.
 *
 * `<dl>` statt einer Tabelle: das ist eine Begriffsliste, keine Matrix. Die Paare
 * stecken je in einem `<div>` — im Standard ausdruecklich vorgesehen und der einzige
 * Weg, dt und dd gemeinsam zu gruppieren.
 *
 * Die Liste kommt fertig aus `buildCareFacts`; leere Werte gibt es hier nicht mehr.
 */
export function CareBlock({ facts, className }: { facts: CareFact[]; className?: string }) {
  return (
    <section aria-labelledby="haltung" className={cn('border-t border-line pt-5', className)}>
      <h2 id="haltung" className="font-mono text-label text-canopy uppercase">
        Haltung
      </h2>

      <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="font-mono text-label text-fern uppercase">{fact.label}</dt>
            <dd className="mt-1 font-mono text-caption text-ink">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
