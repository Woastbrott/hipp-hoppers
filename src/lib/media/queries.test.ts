import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { species } from '@/db/schema';
import type { Db } from '@/db/types';
import { deleteSpecies } from '@/lib/species/queries';
import type { MediaPersistInput } from '@/lib/validation/media';
import { createTestDatabase } from '../../../test/db';

import {
  collectSpeciesBlobUrls,
  deleteMedia,
  findMediaById,
  insertSpeciesMedia,
  listAllMediaUrls,
  listSpeciesMedia,
  moveMedia,
  updateMediaAlt,
} from './queries';

const STORE = 'https://abc123xyz.public.blob.vercel-storage.com';

let db: Db;
let close: () => Promise<void>;
let speciesId = '';

function input(name: string, overrides: Partial<MediaPersistInput> = {}): MediaPersistInput {
  return {
    speciesId,
    url: `${STORE}/species/${speciesId}/${name}`,
    alt: `Alt für ${name}`,
    width: 1600,
    height: 1200,
    contentType: 'image/jpeg',
    ...overrides,
  };
}

async function addMedia(name: string): Promise<string> {
  const result = await insertSpeciesMedia(db, input(name));
  if (!result.ok) throw new Error(`Fixture fehlgeschlagen: ${result.reason}`);
  return result.id;
}

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());

  const rows = await db
    .insert(species)
    .values({ slug: 'idolomantis-diabolica', scientificName: 'Idolomantis diabolica' })
    .returning({ id: species.id });

  const row = rows[0];
  if (!row) throw new Error('Species-Fixture fehlgeschlagen.');
  speciesId = row.id;
});

afterEach(async () => {
  await close();
});

describe('insertSpeciesMedia', () => {
  it('haengt Bilder in der Reihenfolge des Einfuegens ans Ende', async () => {
    await addMedia('eins.jpg');
    await addMedia('zwei.jpg');
    await addMedia('drei.jpg');

    const items = await listSpeciesMedia(db, speciesId);

    expect(items.map((item) => item.position)).toEqual([0, 1, 2]);
    expect(items.map((item) => item.url.split('/').pop())).toEqual([
      'eins.jpg',
      'zwei.jpg',
      'drei.jpg',
    ]);
  });

  it('meldet einen wiederholten Persist-Aufruf als Duplikat statt ihn doppelt zu schreiben', async () => {
    await addMedia('eins.jpg');

    const again = await insertSpeciesMedia(db, input('eins.jpg'));

    expect(again).toEqual({ ok: false, reason: 'duplicate_url' });
    expect(await listSpeciesMedia(db, speciesId)).toHaveLength(1);
  });

  it('lehnt eine unbekannte Art ab', async () => {
    const result = await insertSpeciesMedia(
      db,
      input('eins.jpg', { speciesId: '99999999-2222-4333-8444-555555555555' }),
    );

    expect(result).toEqual({ ok: false, reason: 'species_not_found' });
  });
});

describe('updateMediaAlt', () => {
  it('schreibt den neuen Text und meldet die Art zurueck', async () => {
    const id = await addMedia('eins.jpg');

    const result = await updateMediaAlt(db, id, 'Adultes Weibchen');

    expect(result).toEqual({ ok: true, speciesId });
    expect((await findMediaById(db, id))?.alt).toBe('Adultes Weibchen');
  });

  it('gibt not_found zurueck, wenn es das Bild nicht gibt', async () => {
    const result = await updateMediaAlt(db, '99999999-2222-4333-8444-555555555555', 'x');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('moveMedia — Reihenfolge', () => {
  async function order(): Promise<string[]> {
    const items = await listSpeciesMedia(db, speciesId);
    return items.map((item) => item.url.split('/').pop() ?? '');
  }

  it('schiebt ein Bild nach vorne', async () => {
    await addMedia('eins.jpg');
    const zweite = await addMedia('zwei.jpg');
    await addMedia('drei.jpg');

    const result = await moveMedia(db, zweite, 'up');

    expect(result).toEqual({ ok: true, speciesId, moved: true });
    expect(await order()).toEqual(['zwei.jpg', 'eins.jpg', 'drei.jpg']);
  });

  it('schiebt ein Bild nach hinten', async () => {
    const erste = await addMedia('eins.jpg');
    await addMedia('zwei.jpg');
    await addMedia('drei.jpg');

    await moveMedia(db, erste, 'down');

    expect(await order()).toEqual(['zwei.jpg', 'eins.jpg', 'drei.jpg']);
  });

  it('tut am oberen Rand nichts — und meldet das auch so', async () => {
    const erste = await addMedia('eins.jpg');
    await addMedia('zwei.jpg');

    const result = await moveMedia(db, erste, 'up');

    expect(result).toEqual({ ok: true, speciesId, moved: false });
    expect(await order()).toEqual(['eins.jpg', 'zwei.jpg']);
  });

  it('tut am unteren Rand nichts', async () => {
    await addMedia('eins.jpg');
    const letzte = await addMedia('zwei.jpg');

    const result = await moveMedia(db, letzte, 'down');

    expect(result).toEqual({ ok: true, speciesId, moved: false });
    expect(await order()).toEqual(['eins.jpg', 'zwei.jpg']);
  });

  it('tut bei einem einzelnen Bild in keiner Richtung etwas', async () => {
    const nur = await addMedia('eins.jpg');

    expect(await moveMedia(db, nur, 'up')).toEqual({ ok: true, speciesId, moved: false });
    expect(await moveMedia(db, nur, 'down')).toEqual({ ok: true, speciesId, moved: false });
  });

  it('bleibt nach einem Loeschen mittendrin sortierbar', async () => {
    await addMedia('eins.jpg');
    const zweite = await addMedia('zwei.jpg');
    const dritte = await addMedia('drei.jpg');

    // Positionen 0, 1, 2 -> nach dem Loeschen bleiben 0 und 2, also mit Luecke.
    await deleteMedia(db, zweite);
    await moveMedia(db, dritte, 'up');

    expect(await order()).toEqual(['drei.jpg', 'eins.jpg']);
  });

  it('gibt not_found zurueck, wenn es das Bild nicht gibt', async () => {
    const result = await moveMedia(db, '99999999-2222-4333-8444-555555555555', 'up');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('deleteMedia', () => {
  it('loescht die Zeile und meldet die URL fuer das Aufraeumen zurueck', async () => {
    const id = await addMedia('eins.jpg');

    const result = await deleteMedia(db, id);

    expect(result).toEqual({
      ok: true,
      speciesId,
      url: `${STORE}/species/${speciesId}/eins.jpg`,
    });
    expect(await listSpeciesMedia(db, speciesId)).toEqual([]);
  });

  it('gibt not_found zurueck, wenn es das Bild nicht gibt', async () => {
    const result = await deleteMedia(db, '99999999-2222-4333-8444-555555555555');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('Aufraeumen beim Loeschen einer Art', () => {
  it('sammelt die URLs ein, bevor die Zeilen kaskadierend verschwinden', async () => {
    await addMedia('eins.jpg');
    await addMedia('zwei.jpg');

    const result = await deleteSpecies(db, speciesId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.blobUrls).toEqual([
      `${STORE}/species/${speciesId}/eins.jpg`,
      `${STORE}/species/${speciesId}/zwei.jpg`,
    ]);

    // Kaskade hat gegriffen: keine Zeile zeigt mehr auf die geloeschte Art.
    expect(await listAllMediaUrls(db)).toEqual([]);
  });

  it('meldet eine leere Liste, wenn die Art keine Bilder hatte', async () => {
    const result = await deleteSpecies(db, speciesId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blobUrls).toEqual([]);
  });
});

describe('collectSpeciesBlobUrls', () => {
  it('liefert nur die Bilder der gefragten Art', async () => {
    await addMedia('eins.jpg');

    const otherRows = await db
      .insert(species)
      .values({ slug: 'andere-art', scientificName: 'Andere Art' })
      .returning({ id: species.id });
    const otherId = otherRows[0]?.id ?? '';

    await insertSpeciesMedia(
      db,
      input('fremd.jpg', {
        speciesId: otherId,
        url: `${STORE}/species/${otherId}/fremd.jpg`,
      }),
    );

    expect(await collectSpeciesBlobUrls(db, speciesId)).toEqual([
      `${STORE}/species/${speciesId}/eins.jpg`,
    ]);
    expect(await listAllMediaUrls(db)).toHaveLength(2);
  });
});
