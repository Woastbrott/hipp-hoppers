import type { NextConfig } from 'next';

import { formatEnvIssues, parseEnv } from './src/lib/env.schema';

// Env-Gate beim Build: kaputte Konfiguration bricht `next build`, nicht erst die Runtime.
const envResult = parseEnv(process.env);
if (!envResult.ok) {
  throw new Error(formatEnvIssues(envResult.issues));
}

/**
 * Statische Security-Header.
 *
 * Die CSP steht bewusst NICHT hier: sie braucht pro Request einen frischen Nonce,
 * und statische Header koennen keinen tragen. Sie kommt aus `src/proxy.ts`.
 */
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: [
      'accelerometer=()',
      'autoplay=()',
      'browsing-topics=()',
      'camera=()',
      'display-capture=()',
      'encrypted-media=()',
      'fullscreen=(self)',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=()',
      'usb=()',
      'xr-spatial-tracking=()',
    ].join(', '),
  },
] as const;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // `@node-rs/argon2` ist ein natives Modul (.node) und darf nicht gebundelt werden.
  serverExternalPackages: ['@node-rs/argon2'],

  typedRoutes: true,

  // Next erwartet hier eine Promise; nichts zu awaiten, also kein `async`.
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [...securityHeaders],
      },
    ]);
  },
};

export default nextConfig;
