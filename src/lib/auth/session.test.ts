import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { adminUsers } from '@/db/schema';
import type { Db } from '@/db/types';
import { createTestDatabase } from '../../../test/db';

import { signSessionToken } from './jwt';
import { findAdminByEmail, resolveSession, revokeSessions } from './session';

let db: Db;
let close: () => Promise<void>;

const email = 'admin@hipp-hoppers.test';

async function insertAdmin(tokenVersion = 1): Promise<{ id: string }> {
  const rows = await db
    .insert(adminUsers)
    .values({ email, passwordHash: 'nicht-relevant-fuer-diesen-test', tokenVersion })
    .returning({ id: adminUsers.id });

  const row = rows[0];
  if (!row) throw new Error('Testfixture konnte keinen Admin anlegen.');

  return row;
}

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});

afterEach(async () => {
  await close();
});

describe('resolveSession', () => {
  it('gibt den User zurueck, wenn Signatur, Ablauf und token_version stimmen', async () => {
    const admin = await insertAdmin(1);
    const token = await signSessionToken({ sub: admin.id, tv: 1 });

    const result = await resolveSession(db, token);

    expect(result).toEqual({ ok: true, user: { id: admin.id, email } });
  });

  it('lehnt ein Token mit veralteter token_version ab', async () => {
    const admin = await insertAdmin(1);
    const oldToken = await signSessionToken({ sub: admin.id, tv: 1 });

    // Logout: Version hochzaehlen.
    const newVersion = await revokeSessions(db, admin.id);
    expect(newVersion).toBe(2);

    const result = await resolveSession(db, oldToken);
    expect(result).toEqual({ ok: false, reason: 'stale_token_version' });
  });

  it('akzeptiert ein nach dem Logout neu ausgestelltes Token wieder', async () => {
    const admin = await insertAdmin(1);
    await revokeSessions(db, admin.id);

    const freshToken = await signSessionToken({ sub: admin.id, tv: 2 });
    const result = await resolveSession(db, freshToken);

    expect(result).toEqual({ ok: true, user: { id: admin.id, email } });
  });

  it('lehnt ein Token mit zu hoher token_version ab', async () => {
    const admin = await insertAdmin(1);
    const forged = await signSessionToken({ sub: admin.id, tv: 42 });

    const result = await resolveSession(db, forged);
    expect(result).toEqual({ ok: false, reason: 'stale_token_version' });
  });

  it('lehnt ein Token fuer einen geloeschten User ab', async () => {
    const token = await signSessionToken({
      sub: '11111111-2222-4333-8444-555555555555',
      tv: 1,
    });

    const result = await resolveSession(db, token);
    expect(result).toEqual({ ok: false, reason: 'unknown_user' });
  });

  it('reicht die Ablehnungsgruende der Signaturpruefung durch, ohne die DB anzufassen', async () => {
    const expired = await signSessionToken(
      { sub: '11111111-2222-4333-8444-555555555555', tv: 1 },
      { expiresInSeconds: -30 },
    );

    await expect(resolveSession(db, expired)).resolves.toEqual({
      ok: false,
      reason: 'expired',
    });
    await expect(resolveSession(db, undefined)).resolves.toEqual({
      ok: false,
      reason: 'missing',
    });
  });
});

describe('findAdminByEmail', () => {
  it('normalisiert die Eingabe (Trim + Kleinschreibung)', async () => {
    const admin = await insertAdmin();

    const found = await findAdminByEmail(db, '  ADMIN@Hipp-Hoppers.TEST  ');
    expect(found?.id).toBe(admin.id);
  });

  it('gibt null zurueck, wenn es das Konto nicht gibt', async () => {
    await expect(findAdminByEmail(db, 'niemand@hipp-hoppers.test')).resolves.toBeNull();
  });
});

describe('revokeSessions', () => {
  it('gibt null zurueck, wenn es den User nicht gibt', async () => {
    await expect(revokeSessions(db, '11111111-2222-4333-8444-555555555555')).resolves.toBeNull();
  });
});
