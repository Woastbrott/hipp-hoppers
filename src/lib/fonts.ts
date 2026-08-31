import { Fraunces, IBM_Plex_Mono, Inter } from 'next/font/google';

/**
 * Drei Rollen, drei Schriften:
 *  - Fraunces      — Headlines, Arten-Namen, editoriale Elemente. Variabel inkl.
 *                    opsz-Achse, damit `font-optical-sizing: auto` wirklich etwas tut.
 *  - Inter         — Fliesstext, UI, Buttons, Formulare.
 *  - IBM Plex Mono — Preise, SKUs, Labels, technische Meta (Temperatur/Luftfeuchte).
 *
 * Alle mit `display: 'swap'` und auf `latin` subgesetzt: Text ist sofort lesbar,
 * die Datei bleibt klein.
 */

export const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  axes: ['opsz'],
  variable: '--font-fraunces',
});

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
});

export const fontVariables = [fraunces.variable, inter.variable, ibmPlexMono.variable].join(' ');
