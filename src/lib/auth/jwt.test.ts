import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { signSessionToken, verifySessionToken } from './jwt';

const claims = { sub: '11111111-2222-4333-8444-555555555555', tv: 3 } as const;

function secretKey(value = process.env.JWT_SECRET ?? ''): Uint8Array {
  return new TextEncoder().encode(value);
}

describe('verifySessionToken', () => {
  it('akzeptiert ein frisch signiertes Token und gibt die Claims zurueck', async () => {
    const token = await signSessionToken(claims);
    const result = await verifySessionToken(token);

    expect(result).toEqual({ ok: true, claims: { sub: claims.sub, tv: claims.tv } });
  });

  it('lehnt ein abgelaufenes Token ab', async () => {
    const token = await signSessionToken(claims, { expiresInSeconds: -60 });
    const result = await verifySessionToken(token);

    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('lehnt ein Token mit manipulierter Signatur ab', async () => {
    const token = await signSessionToken(claims);
    const parts = token.split('.');
    const signature = parts[2] ?? '';

    // Ein einzelnes Zeichen der Signatur kippen.
    const tampered = `${parts[0]}.${parts[1]}.${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;

    const result = await verifySessionToken(tampered);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('lehnt ein Token mit manipulierter Payload ab', async () => {
    const token = await signSessionToken(claims);
    const parts = token.split('.');

    const forgedPayload = Buffer.from(JSON.stringify({ ...claims, tv: 99 }))
      .toString('base64url')
      .replace(/=+$/, '');

    const result = await verifySessionToken(`${parts[0]}.${forgedPayload}.${parts[2]}`);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('lehnt ein Token ab, das mit einem anderen Secret signiert wurde', async () => {
    const foreign = await new SignJWT({ tv: claims.tv })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer('hipp-hoppers')
      .setAudience('hipp-hoppers/admin')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secretKey('ein-voellig-anderes-secret-mit-32-zeichen'));

    const result = await verifySessionToken(foreign);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('lehnt ein Token mit fremdem Issuer ab', async () => {
    const foreign = await new SignJWT({ tv: claims.tv })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer('irgendwer-anders')
      .setAudience('hipp-hoppers/admin')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secretKey());

    const result = await verifySessionToken(foreign);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('lehnt ein Token ohne gueltige Claim-Struktur ab', async () => {
    const malformed = await new SignJWT({ tv: 'drei' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('kein-uuid')
      .setIssuer('hipp-hoppers')
      .setAudience('hipp-hoppers/admin')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secretKey());

    const result = await verifySessionToken(malformed);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('behandelt ein fehlendes Cookie als fehlendes Token, nicht als Fehler', async () => {
    await expect(verifySessionToken(undefined)).resolves.toEqual({
      ok: false,
      reason: 'missing',
    });
    await expect(verifySessionToken('')).resolves.toEqual({ ok: false, reason: 'missing' });
  });

  it('lehnt Muell im Cookie ab', async () => {
    const result = await verifySessionToken('nicht.mal.ein-jwt');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });
});
