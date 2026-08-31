import { describe, expect, it } from 'vitest';

import { verifyRequestOrigin } from './csrf';

function headersOf(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe('verifyRequestOrigin', () => {
  it('akzeptiert eine Anfrage von derselben Origin', () => {
    const headers = headersOf({
      origin: 'https://hipp-hoppers.de',
      host: 'hipp-hoppers.de',
      'x-forwarded-proto': 'https',
    });

    expect(verifyRequestOrigin(headers)).toEqual({ ok: true });
  });

  it('bevorzugt x-forwarded-host, wie ihn Vercel setzt', () => {
    const headers = headersOf({
      origin: 'https://hipp-hoppers.de',
      host: 'interne-instanz.vercel.app',
      'x-forwarded-host': 'hipp-hoppers.de',
      'x-forwarded-proto': 'https',
    });

    expect(verifyRequestOrigin(headers)).toEqual({ ok: true });
  });

  it('lehnt eine fremde Origin ab', () => {
    const headers = headersOf({
      origin: 'https://boeser-nachbar.example',
      host: 'hipp-hoppers.de',
      'x-forwarded-proto': 'https',
    });

    expect(verifyRequestOrigin(headers)).toEqual({ ok: false, reason: 'foreign_origin' });
  });

  it('lehnt eine Anfrage ohne Origin-Header ab', () => {
    const headers = headersOf({ host: 'hipp-hoppers.de' });

    expect(verifyRequestOrigin(headers)).toEqual({ ok: false, reason: 'missing_origin' });
  });

  it('lehnt ab, wenn nur das Schema abweicht', () => {
    const headers = headersOf({
      origin: 'http://hipp-hoppers.de',
      host: 'hipp-hoppers.de',
      'x-forwarded-proto': 'https',
    });

    expect(verifyRequestOrigin(headers)).toEqual({ ok: false, reason: 'foreign_origin' });
  });

  it('nimmt APP_ORIGIN als alleinigen Massstab, wenn gesetzt', () => {
    const headers = headersOf({
      origin: 'https://gefaelschter-host.example',
      // Host-Header laesst sich faelschen — mit APP_ORIGIN zaehlt er nicht mehr.
      host: 'gefaelschter-host.example',
      'x-forwarded-proto': 'https',
    });

    expect(verifyRequestOrigin(headers, 'https://hipp-hoppers.de')).toEqual({
      ok: false,
      reason: 'foreign_origin',
    });

    const legit = headersOf({
      origin: 'https://hipp-hoppers.de',
      host: 'gefaelschter-host.example',
    });

    expect(verifyRequestOrigin(legit, 'https://hipp-hoppers.de')).toEqual({ ok: true });
  });

  it('nimmt in der lokalen Entwicklung http an, wenn kein Proxy-Header da ist', () => {
    const headers = headersOf({
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    });

    expect(verifyRequestOrigin(headers)).toEqual({ ok: true });
  });

  it('bleibt fuer echte Hosts ohne Proxy-Header bei https', () => {
    const headers = headersOf({
      origin: 'http://hipp-hoppers.de',
      host: 'hipp-hoppers.de',
    });

    expect(verifyRequestOrigin(headers)).toEqual({ ok: false, reason: 'foreign_origin' });
  });

  it('nimmt bei einer Proto-Liste den aeusseren Proxy', () => {
    const headers = headersOf({
      origin: 'https://hipp-hoppers.de',
      host: 'hipp-hoppers.de',
      'x-forwarded-proto': 'https,http',
    });

    expect(verifyRequestOrigin(headers)).toEqual({ ok: true });
  });

  it('lehnt einen unparsbaren Origin-Header ab', () => {
    const headers = headersOf({ origin: 'null', host: 'hipp-hoppers.de' });

    expect(verifyRequestOrigin(headers)).toEqual({ ok: false, reason: 'foreign_origin' });
  });
});
