import { describe, expect, it } from 'vitest';

import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  blobPathnameFromUrl,
  buildSpeciesBlobPathname,
  isAllowedImageContentType,
  isSpeciesBlobUrl,
  isTrustedBlobUrl,
  MAX_UPLOAD_BYTES,
  sanitizeUploadFilename,
  speciesBlobPrefix,
} from './upload-contract';

const SPECIES_ID = '11111111-2222-4333-8444-555555555555';
const STORE = 'https://abc123xyz.public.blob.vercel-storage.com';

describe('erlaubte Formate', () => {
  it('laesst die vier Rasterformate durch', () => {
    for (const type of ALLOWED_IMAGE_CONTENT_TYPES) {
      expect(isAllowedImageContentType(type)).toBe(true);
    }
  });

  it('lehnt SVG ab', () => {
    // SVG ist ein Dokumentformat mit Scripting — direkt aufgerufen liefe der Code
    // auf unserer Blob-Domain.
    expect(isAllowedImageContentType('image/svg+xml')).toBe(false);
  });

  it('lehnt alles Nicht-Bildliche ab', () => {
    for (const type of ['application/pdf', 'text/html', 'image/gif', '']) {
      expect(isAllowedImageContentType(type)).toBe(false);
    }
  });

  it('setzt die Groessengrenze auf 10 MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('sanitizeUploadFilename', () => {
  it('macht aus einem Dateinamen etwas Pfadsicheres', () => {
    expect(sanitizeUploadFilename('Mein Bild.JPG')).toBe('mein-bild.jpg');
    expect(sanitizeUploadFilename('Idolomantis diabolica (L3).png')).toBe(
      'idolomantis-diabolica-l3-.png',
    );
  });

  it('transliteriert Umlaute und entfernt Diakritika', () => {
    expect(sanitizeUploadFilename('Größe.jpeg')).toBe('gro-e.jpeg');
    expect(sanitizeUploadFilename('café.webp')).toBe('cafe.webp');
  });

  it('wirft Verzeichnisanteile weg', () => {
    expect(sanitizeUploadFilename('../../etc/passwd.png')).toBe('passwd.png');
    expect(sanitizeUploadFilename('C:\\Users\\x\\bild.png')).toBe('bild.png');
    expect(sanitizeUploadFilename('a/b/c.avif')).toBe('c.avif');
  });

  it('faellt auf einen Namen zurueck, wenn nichts uebrig bleibt', () => {
    expect(sanitizeUploadFilename('')).toBe('bild');
    expect(sanitizeUploadFilename('///')).toBe('bild');
    expect(sanitizeUploadFilename('...')).toBe('bild');
  });

  it('kuerzt sehr lange Namen', () => {
    expect(sanitizeUploadFilename(`${'a'.repeat(300)}.jpg`).length).toBeLessThanOrEqual(80);
  });
});

describe('Pfad-Aufbau', () => {
  it('legt alles unter species/<id>/ ab', () => {
    expect(speciesBlobPrefix(SPECIES_ID)).toBe(`species/${SPECIES_ID}/`);
    expect(buildSpeciesBlobPathname(SPECIES_ID, 'Mein Bild.jpg')).toBe(
      `species/${SPECIES_ID}/mein-bild.jpg`,
    );
  });

  it('laesst sich nicht aus dem Prefix herausschreiben', () => {
    const pathname = buildSpeciesBlobPathname(SPECIES_ID, '../../../root.png');
    expect(pathname).toBe(`species/${SPECIES_ID}/root.png`);
  });
});

describe('isTrustedBlobUrl', () => {
  it('akzeptiert https auf einem Vercel-Blob-Host', () => {
    expect(isTrustedBlobUrl(`${STORE}/species/x/bild.jpg`)).toBe(true);
  });

  it('lehnt fremde Hosts ab', () => {
    expect(isTrustedBlobUrl('https://boeser-nachbar.example/bild.jpg')).toBe(false);
    // Der Suffix muss am Ende stehen, nicht irgendwo.
    expect(
      isTrustedBlobUrl('https://public.blob.vercel-storage.com.boeser-nachbar.example/x.jpg'),
    ).toBe(false);
  });

  it('lehnt andere Protokolle ab', () => {
    expect(isTrustedBlobUrl(`http://abc.public.blob.vercel-storage.com/x.jpg`)).toBe(false);
    expect(isTrustedBlobUrl('javascript:alert(1)')).toBe(false);
    expect(isTrustedBlobUrl('data:image/png;base64,AAAA')).toBe(false);
  });

  it('lehnt Muell ab', () => {
    expect(isTrustedBlobUrl('kein-url')).toBe(false);
    expect(isTrustedBlobUrl('')).toBe(false);
  });
});

describe('blobPathnameFromUrl', () => {
  it('gibt den Pfad ohne fuehrenden Schraegstrich zurueck', () => {
    expect(blobPathnameFromUrl(`${STORE}/species/abc/bild.jpg`)).toBe('species/abc/bild.jpg');
  });

  it('dekodiert Prozent-Kodierung', () => {
    expect(blobPathnameFromUrl(`${STORE}/species/abc/mein%20bild.jpg`)).toBe(
      'species/abc/mein bild.jpg',
    );
  });

  it('gibt null fuer nicht vertrauenswuerdige URLs', () => {
    expect(blobPathnameFromUrl('https://boeser-nachbar.example/x.jpg')).toBeNull();
  });
});

describe('isSpeciesBlobUrl', () => {
  it('akzeptiert genau eine Ebene unter dem Prefix der Art', () => {
    expect(isSpeciesBlobUrl(`${STORE}/species/${SPECIES_ID}/bild-abc123.jpg`, SPECIES_ID)).toBe(
      true,
    );
  });

  it('lehnt das Prefix einer anderen Art ab', () => {
    const other = '99999999-2222-4333-8444-555555555555';
    expect(isSpeciesBlobUrl(`${STORE}/species/${other}/bild.jpg`, SPECIES_ID)).toBe(false);
  });

  it('lehnt Unterordner ab', () => {
    expect(isSpeciesBlobUrl(`${STORE}/species/${SPECIES_ID}/tief/bild.jpg`, SPECIES_ID)).toBe(
      false,
    );
  });

  it('lehnt das nackte Prefix ohne Dateinamen ab', () => {
    expect(isSpeciesBlobUrl(`${STORE}/species/${SPECIES_ID}/`, SPECIES_ID)).toBe(false);
  });

  it('lehnt einen fremden Host ab, auch mit passendem Pfad', () => {
    expect(
      isSpeciesBlobUrl(`https://boeser-nachbar.example/species/${SPECIES_ID}/bild.jpg`, SPECIES_ID),
    ).toBe(false);
  });
});
