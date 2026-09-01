import { Fragment } from 'react';

import type { CareFact } from '@/lib/species/care';

/**
 * Die harten Zahlen als eigenes Gestaltungselement: durchgehend Mono, oben eine
 * kraeftige Linie, Label und Wert in zwei Spalten.
 *
 * `<dl>` statt einer Tabelle — das ist eine Begriffsliste, keine Matrix. Der
 * Zusammenhang zwischen Label und Wert steht damit auch fuer Screenreader im Markup
 * und nicht nur im Raster.
 *
 * Die Liste kommt fertig aus `buildCareFacts`; leere Werte gibt es hier nicht mehr.
 */
export function CareBlock({ facts }: { facts: CareFact[] }) {
  return (
    <section aria-labelledby="haltung" className="border-t border-line pt-5">
      <h2 id="haltung" className="font-mono text-label text-canopy uppercase">
        Haltung
      </h2>

      {/* `items-baseline`: Label und Wert haben verschiedene Groessen, sollen aber auf
          derselben Schriftlinie sitzen. */}
      <dl className="mt-5 grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-3">
        {facts.map((fact) => (
          <Fragment key={fact.label}>
            <dt className="font-mono text-label text-fern uppercase">{fact.label}</dt>
            <dd className="font-mono text-caption text-ink">{fact.value}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}
