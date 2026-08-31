import 'server-only';

import { asc, eq, inArray, sql } from 'drizzle-orm';

import { media, species } from '@/db/schema';
import type { Db } from '@/db/types';
import { isUniqueViolation } from '@/lib/db-errors';
import type { MediaMoveDirection, MediaPersistInput } from '@/lib/validation/media';

const URL_CONSTRAINT = 'media_url_key';

export type MediaItem = {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
  position: number;
};

export type MediaInsertResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'duplicate_url' }
  | { ok: false; reason: 'species_not_found' };

export type MediaMutationResult =
  { ok: true; speciesId: string } | { ok: false; reason: 'not_found' };

export type MediaDeleteResult =
  { ok: true; speciesId: string; url: string } | { ok: false; reason: 'not_found' };

export type MediaMoveResult =
  { ok: true; speciesId: string; moved: boolean } | { ok: false; reason: 'not_found' };

/** Reihenfolge der Galerie. Das erste Bild ist per Konvention das Titelbild. */
export async function listSpeciesMedia(db: Db, speciesId: string): Promise<MediaItem[]> {
  return db
    .select({
      id: media.id,
      url: media.url,
      alt: media.alt,
      width: media.width,
      height: media.height,
      position: media.position,
    })
    .from(media)
    .where(eq(media.speciesId, speciesId))
    .orderBy(asc(media.position), asc(media.createdAt));
}

export async function findMediaById(
  db: Db,
  mediaId: string,
): Promise<(MediaItem & { speciesId: string | null }) | null> {
  const rows = await db
    .select({
      id: media.id,
      url: media.url,
      alt: media.alt,
      width: media.width,
      height: media.height,
      position: media.position,
      speciesId: media.speciesId,
    })
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Haengt das Bild ans Ende. Die naechste Position kommt aus einer Unterabfrage im
 * selben Statement: bei zwei gleichzeitigen Uploads waere ein vorheriges SELECT eine
 * Race Condition, und ein Statement loest das ohne Transaktion und ohne Sperre.
 */
export async function insertSpeciesMedia(
  db: Db,
  input: MediaPersistInput,
): Promise<MediaInsertResult> {
  const existing = await db
    .select({ id: species.id })
    .from(species)
    .where(eq(species.id, input.speciesId))
    .limit(1);

  if (existing.length === 0) {
    return { ok: false, reason: 'species_not_found' };
  }

  try {
    const rows = await db
      .insert(media)
      .values({
        url: input.url,
        alt: input.alt,
        width: input.width,
        height: input.height,
        speciesId: input.speciesId,
        position: sql`coalesce((select max(${media.position}) + 1 from ${media} where ${media.speciesId} = ${input.speciesId}), 0)`,
      })
      .returning({ id: media.id });

    const row = rows[0];
    if (!row) return { ok: false, reason: 'species_not_found' };

    return { ok: true, id: row.id };
  } catch (error: unknown) {
    // Der Browser hat den Persist-Aufruf wiederholt — der Blob ist schon eingetragen.
    if (isUniqueViolation(error, URL_CONSTRAINT)) {
      return { ok: false, reason: 'duplicate_url' };
    }
    throw error;
  }
}

export async function updateMediaAlt(
  db: Db,
  mediaId: string,
  alt: string,
): Promise<MediaMutationResult> {
  const rows = await db
    .update(media)
    .set({ alt })
    .where(eq(media.id, mediaId))
    .returning({ speciesId: media.speciesId });

  const speciesId = rows[0]?.speciesId;
  if (!speciesId) return { ok: false, reason: 'not_found' };

  return { ok: true, speciesId };
}

/**
 * Loescht nur die Zeile und meldet die URL zurueck. Den Blob raeumt die Action auf —
 * die Datenbank ist die Quelle der Wahrheit, der Store folgt ihr.
 */
export async function deleteMedia(db: Db, mediaId: string): Promise<MediaDeleteResult> {
  const rows = await db
    .delete(media)
    .where(eq(media.id, mediaId))
    .returning({ speciesId: media.speciesId, url: media.url });

  const row = rows[0];
  if (!row?.speciesId) return { ok: false, reason: 'not_found' };

  return { ok: true, speciesId: row.speciesId, url: row.url };
}

/**
 * Tauscht die Position mit dem Nachbarn.
 *
 * Ein Tausch statt einer Neunummerierung: das ist ein einziges UPDATE mit CASE und
 * damit atomar, ohne dass eine Transaktion noetig waere. Luecken in der Zahlenfolge
 * stoeren dabei nicht — sortiert wird nach Position, nicht danach, ob sie
 * lueckenlos ist.
 */
export async function moveMedia(
  db: Db,
  mediaId: string,
  direction: MediaMoveDirection,
): Promise<MediaMoveResult> {
  const current = await findMediaById(db, mediaId);

  if (!current?.speciesId) {
    return { ok: false, reason: 'not_found' };
  }

  const siblings = await listSpeciesMedia(db, current.speciesId);
  const index = siblings.findIndex((item) => item.id === mediaId);

  if (index === -1) {
    return { ok: false, reason: 'not_found' };
  }

  const neighbourIndex = direction === 'up' ? index - 1 : index + 1;
  const neighbour = siblings[neighbourIndex];

  // Am Rand: kein Fehler, nur nichts zu tun. Ein Doppelklick soll nicht scheppern.
  if (!neighbour) {
    return { ok: true, speciesId: current.speciesId, moved: false };
  }

  await db
    .update(media)
    .set({
      // Die Casts sind noetig: gebundene Parameter kommen ohne Typ an, und Postgres
      // haelt sie sonst fuer Text.
      position: sql`case ${media.id} when ${mediaId}::uuid then ${neighbour.position}::int else ${current.position}::int end`,
    })
    .where(inArray(media.id, [mediaId, neighbour.id]));

  return { ok: true, speciesId: current.speciesId, moved: true };
}

/** Alle Blob-URLs einer Art — wird vor dem Loeschen der Art eingesammelt. */
export async function collectSpeciesBlobUrls(db: Db, speciesId: string): Promise<string[]> {
  const rows = await db
    .select({ url: media.url })
    .from(media)
    .where(eq(media.speciesId, speciesId));

  return rows.map((row) => row.url);
}

/** Fuer das Prune-Script: jede URL, die in der Tabelle steht. */
export async function listAllMediaUrls(db: Db): Promise<string[]> {
  const rows = await db.select({ url: media.url }).from(media);
  return rows.map((row) => row.url);
}
