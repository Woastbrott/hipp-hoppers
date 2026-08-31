import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';

import { fontVariables } from '@/lib/fonts';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Hipp Hoppers',
    template: '%s — Hipp Hoppers',
  },
  description: 'Gottesanbeterinnen-Zucht und Entomologie.',
  applicationName: 'Hipp Hoppers',
  // Phase 0 ist ein Geruest ohne Inhalt. Vor dem Launch umstellen.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  // Einzige Stelle mit Hex-Werten: ein <meta>-Tag kann keine CSS-Variable lesen.
  // Werte gespiegelt aus den paper-Tokens in styles/globals.css.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf8f1' },
    { media: '(prefers-color-scheme: dark)', color: '#10130e' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  /*
   * Erzwingt dynamisches Rendering fuer den gesamten Baum — die Konsequenz der
   * Nonce-CSP: Next haengt den Nonce nur beim Rendern pro Request an seine
   * Script-Tags. Eine statisch vorgerenderte Seite truege keinen und wuerde von der
   * eigenen CSP blockiert.
   *
   * Offener Punkt fuer spaeter: sollen Storefront-Routen statisch werden, braucht es
   * eine hash-basierte CSP statt eines Nonce.
   */
  await connection();

  return (
    <html lang="de" className={fontVariables}>
      <body className="min-h-dvh bg-paper text-ink">{children}</body>
    </html>
  );
}
