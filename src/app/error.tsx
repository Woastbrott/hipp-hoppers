'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';

/**
 * Fehlergrenze fuer den Route-Baum. Zeigt bewusst keine Fehlermeldung aus dem Error-
 * Objekt: in Produktion ist `error.message` bei Server-Fehlern ohnehin redigiert, und
 * alles darueber hinaus gehoert ins Server-Log, nicht auf den Bildschirm.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Digest ist die Klammer zum Server-Log. Kein Stacktrace, keine Payload.
    console.error('Unerwarteter Fehler', error.digest ?? '(ohne Digest)');
  }, [error]);

  return (
    <Container width="prose" className="flex min-h-dvh flex-col justify-center gap-6 py-24">
      <p className="font-mono text-label text-fern uppercase">Fehler</p>

      <h1 className="font-display text-title text-canopy">Da ist was schiefgelaufen.</h1>

      <p className="text-lead text-ink/80">
        Wir haben den Fehler protokolliert. Probier es nochmal — wenn es bleibt, meld dich.
      </p>

      {error.digest ? (
        <p className="font-mono text-caption text-fern">Referenz: {error.digest}</p>
      ) : null}

      <div>
        <Button onClick={reset}>Nochmal versuchen</Button>
      </div>
    </Container>
  );
}
