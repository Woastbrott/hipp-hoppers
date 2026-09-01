import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/jwt';
import { BLOB_HOST_SUFFIX } from '@/lib/blob/upload-contract';

/**
 * Der Store-Host als CSP-Muster. Aus derselben Konstante wie der Vertrag, damit
 * Anzeigen und Hochladen nicht mit zwei Schreibweisen desselben Hosts arbeiten.
 * `upload-contract.ts` ist bewusst frei von `server-only` und Imports und darf
 * deshalb auch hier hinein.
 */
const BLOB_STORE_HOST_PATTERN = `*${BLOB_HOST_SUFFIX}`;

/**
 * Next 16: `proxy.ts` ersetzt `middleware.ts` (gleiche Mechanik, neuer Name).
 * Laeuft auf der Node.js-Runtime, deshalb kein Runtime-Export und kein `server-only`
 * im Importgraph — dieses Modul zieht bewusst nur `jose` + Zod ueber `lib/auth/jwt`.
 *
 * Zwei Aufgaben:
 *  1. CSP mit frischem Nonce pro Request (kann kein statischer Header in next.config.ts).
 *  2. Billiger Vorfilter fuer /admin: Signatur + Ablauf, ohne DB-Roundtrip.
 *     Autoritativ ist und bleibt das Gate in `app/admin/layout.tsx`.
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildContentSecurityPolicy(nonce: string): string {
  const directives = [
    `default-src 'self'`,
    // 'strict-dynamic' laesst von einem vertrauenswuerdigen Script geladene Scripts zu
    // und ignoriert dabei Host-Allowlists. 'self' bleibt als Fallback fuer CSP2-Browser.
    // In dev braucht der Next-Dev-Server zusaetzlich 'unsafe-eval' fuer HMR.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    // Bewusster Kompromiss: next/font und Tailwind schreiben Style-Tags zur Laufzeit,
    // ein Nonce erreicht sie nicht zuverlaessig. Inline-CSS ist als Angriffsflaeche
    // deutlich harmloser als Inline-JS.
    `style-src 'self' 'unsafe-inline'`,
    // blob:/data: fuer clientseitige Vorschauen, dazu der Store zum Anzeigen.
    `img-src 'self' blob: data: https://${BLOB_STORE_HOST_PATTERN}`,
    `font-src 'self' data:`,
    /*
     * Der Client-Upload laedt die Datei nicht ueber unseren Server, sondern direkt
     * an Vercel — `img-src` deckt nur das Anzeigen ab, nicht das Schreiben. Ohne
     * diese beiden Hosts blockt die CSP den PUT, das Blob-SDK wiederholt still und
     * der Uploader haengt sichtbar bei 0 %.
     *
     * `vercel.com` ist die Control-Plane (`/api/blob`), der Store-Host nimmt die
     * Multipart-Teile groesserer Dateien entgegen.
     */
    `connect-src 'self' https://vercel.com https://${BLOB_STORE_HOST_PATTERN}${isDevelopment ? ' ws: http://localhost:*' : ''}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `manifest-src 'self'`,
    `worker-src 'self' blob:`,
    ...(isDevelopment ? [] : ['upgrade-insecure-requests']),
  ];

  return directives.join('; ');
}

function isProtectedAdminPath(pathname: string): boolean {
  if (!pathname.startsWith('/admin')) return false;
  // Die Login-Seite muss ohne Session erreichbar bleiben.
  return pathname !== '/admin/login' && !pathname.startsWith('/admin/login/');
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy(nonce);

  // Next liest den Nonce aus dem Request-Header und haengt ihn an seine eigenen
  // Inline-Scripts. `x-nonce` ist zusaetzlich fuer eigenen Code via `headers()` da.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  if (isProtectedAdminPath(request.nextUrl.pathname)) {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const verified = await verifySessionToken(token);

    if (!verified.ok) {
      const loginUrl = new URL('/admin/login', request.url);
      // Nur der Pfad, nie eine absolute URL — sonst ist das ein Open Redirect.
      loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);

      const redirect = NextResponse.redirect(loginUrl);
      redirect.headers.set('content-security-policy', csp);
      return redirect;
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);

  return response;
}

export const config = {
  matcher: [
    /*
     * Alles ausser Next-internen Assets und statischen Dateien. Die CSP gehoert an
     * jedes Dokument, deshalb bewusst kein Ausschluss von Prefetch-Requests.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
