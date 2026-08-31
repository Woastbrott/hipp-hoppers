# Hipp Hoppers

Web-Shop rund um Gottesanbeterinnen-Zucht und Entomologie.

Stand: das Fundament (Design-System, Datenbank-Schema, Auth-Flow, CI) und das
**Arten-CRUD im Admin** unter `/admin/species` — Liste, Anlegen, Bearbeiten, Löschen
mit Bestätigung, Publish/Draft-Umschalter. Produkt-CRUD, Bild-Uploads, öffentliche
Artenseiten und Warenkorb kommen später.

## Setup in fünf Schritten

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

Dann `.env.local` ausfüllen (siehe [Environment](#environment)) — mindestens
`DATABASE_URL` und `JWT_SECRET`.

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

Storefront: <http://localhost:3000> · Admin: <http://localhost:3000/admin>

## Environment

Alle Variablen sind **server-only**. Kein `NEXT_PUBLIC_`-Prefix, nirgends.
Validiert wird per Zod in [`src/lib/env.schema.ts`](src/lib/env.schema.ts) — einmal
beim Build (`next.config.ts`) und einmal zur Laufzeit (`src/lib/env.ts`). Fehlt oder
kippt etwas, bricht der **Build**, nicht erst die erste Anfrage.

| Variable                | Pflicht | Zweck                                                                |
| ----------------------- | ------- | -------------------------------------------------------------------- |
| `DATABASE_URL`          | ja      | Neon-Connection-String (`postgresql://…`)                            |
| `JWT_SECRET`            | ja      | HS256-Schlüssel für das Session-JWT, **≥ 32 Zeichen**                |
| `APP_ORIGIN`            | nein    | Erlaubte Origin für den CSRF-Check. Leer ⇒ gegen Request-Host        |
| `SEED_ADMIN_EMAIL`      | Seed    | Konto, das `pnpm db:seed` anlegt                                     |
| `SEED_ADMIN_PASSWORD`   | Seed    | Passwort dazu, ≥ 12 Zeichen. Wird beim Lauf gehasht, nie gespeichert |
| `BLOB_READ_WRITE_TOKEN` | nein    | Vercel Blob, Platzhalter für Phase 1                                 |

Secret erzeugen:

```bash
openssl rand -base64 48
```

## Scripts

| Script             | Was es tut                                   |
| ------------------ | -------------------------------------------- |
| `pnpm dev`         | Dev-Server                                   |
| `pnpm build`       | Produktions-Build (inkl. Env-Validierung)    |
| `pnpm start`       | Produktions-Server                           |
| `pnpm typecheck`   | `tsc --noEmit`                               |
| `pnpm lint`        | ESLint (typ-informiert)                      |
| `pnpm format`      | Prettier über alles                          |
| `pnpm test`        | Vitest (Auth-Pfade gegen PGlite)             |
| `pnpm db:generate` | Migration aus `src/db/schema.ts` erzeugen    |
| `pnpm db:migrate`  | Migrationen anwenden                         |
| `pnpm db:seed`     | Admin-User aus der Env anlegen/aktualisieren |

## Architekturentscheidungen

**Server Components als Default.** `'use client'` gibt es genau zweimal: die
Fehlergrenze (`app/error.tsx`) und das Login-Formular (`useActionState`). Motion
sitzt in einer eigenen kleinen Insel (`components/ui/reveal.tsx`), nicht am Seitenbaum.

**argon2id statt bcrypt.** bcrypt ist nur rechenintensiv, argon2id zusätzlich
speicherintensiv — deutlich unattraktiver für GPU-Cracking. bcrypt schneidet
Passwörter außerdem still nach 72 Bytes ab. Parameter nach OWASP-Minimum
(19 MiB, 2 Durchläufe, Parallelität 1). Paket: `@node-rs/argon2` wegen vorgebauter
Binaries für linux-x64-gnu (Vercel/CI) und win32-x64-msvc — kein node-gyp.

**Zwei Stufen Auth.** `src/proxy.ts` prüft Signatur und Ablauf ohne DB-Roundtrip und
hält offensichtlichen Müll fern. Autoritativ ist das Gate in
`app/admin/(dashboard)/layout.tsx`: es gleicht zusätzlich `token_version` gegen die
Datenbank ab. Ein Logout zählt diese Version hoch — deshalb ist es ein echtes Logout
und nicht nur ein gelöschtes Cookie.

**Route-Gruppe statt Gate in `admin/layout.tsx`.** Layouts komponieren sich; ein Gate
direkt in `admin/layout.tsx` würde auch `/admin/login` sperren und eine Redirect-Schleife
bauen. Die Gruppe `(dashboard)` hält die Login-Seite außerhalb des geschützten Baums,
ohne die URL zu verändern.

**Rate-Limiter-State in Postgres.** Auf Vercel hat jede Invocation ihren eigenen Heap.
Eine In-Memory-Map besteht lokal jeden Test und zählt in Produktion faktisch nichts.
Zwei Buckets: `ip:…` (Schwelle 20) gegen Spraying, `account:…` (Schwelle 5) gegen
gezieltes Raten. Backoff 30 s → 60 s → 120 s …, gedeckelt bei 15 Minuten. Ein
erfolgreicher Login setzt nur den Konto-Bucket zurück — sonst könnte ein Angreifer den
IP-Zähler mit einem einzigen ihm bekannten Login löschen.

**CSP aus dem Proxy, statische Header aus der Config.** Der Nonce wird pro Request
erzeugt; ein statischer Header kann ihn nicht tragen. Alles Übrige
(`Strict-Transport-Security`, `X-Frame-Options`, `Permissions-Policy` …) steht in
`next.config.ts`.

**Neon over HTTP.** Kein Connection-Pool, der eine serverless Invocation ohnehin nicht
überlebt. Konsequenz: keine interaktiven Transaktionen — deshalb ist das Hochzählen im
Rate-Limiter ein einzelnes `INSERT … ON CONFLICT DO UPDATE` statt Read-Modify-Write.

**Polymorphe Medien als exclusive arc.** `media` hat zwei typisierte, nullable
Fremdschlüssel (`species_id`, `product_id`) plus CHECK, dass genau einer gesetzt ist.
Referentielle Integrität bleibt damit in der DB — ein untypisiertes
`owner_id`/`owner_type`-Paar könnte Postgres nicht prüfen.

**Tests gegen echtes Postgres.** Rate-Limiter und `token_version`-Check leben in SQL;
ein gemockter Query-Builder würde nur sich selbst testen. Die Suite fährt PGlite
(Postgres als WASM) und spielt dabei die committete Migration wirklich ein.

## Design-System

Sieben semantische Farb-Tokens in [`src/styles/globals.css`](src/styles/globals.css),
Hex-Werte ausschließlich dort. Dark-Variante über `prefers-color-scheme`, kein
Theme-Switcher.

| Token    | Light     | Dark      | Rolle                             |
| -------- | --------- | --------- | --------------------------------- |
| `paper`  | `#fbf8f1` | `#10130e` | Haupt-Hintergrund                 |
| `ink`    | `#1b1f1a` | `#ede9de` | Primäre Textfarbe                 |
| `canopy` | `#123d2a` | `#86c9a0` | Tiefes Blattgrün, Headline-Akzent |
| `fern`   | `#36704d` | `#b2dfc2` | Sekundär, Hover/States            |
| `bloom`  | `#b8442a` | `#f2a579` | Warmer Akzent, CTAs               |
| `sand`   | `#f0e9da` | `#1a1e17` | Cards, gedämpfte Flächen          |
| `line`   | `#8a8271` | `#666e5e` | Linien, Rahmen, Trenner           |

Gemessene Kontraste (WCAG 2.1) — beide Modi bestehen alle geprüften Paare:

| Paar             | Light     | Dark      | Anforderung |
| ---------------- | --------- | --------- | ----------- |
| `ink`/`paper`    | 15.74 : 1 | 15.44 : 1 | ≥ 4.5       |
| `ink`/`sand`     | 13.82 : 1 | 13.94 : 1 | ≥ 4.5       |
| `canopy`/`paper` | 11.47 : 1 | 9.70 : 1  | ≥ 4.5       |
| `canopy`/`sand`  | 10.06 : 1 | 8.76 : 1  | ≥ 4.5       |
| `fern`/`paper`   | 5.53 : 1  | 12.69 : 1 | ≥ 4.5       |
| `fern`/`sand`    | 4.85 : 1  | 11.45 : 1 | ≥ 4.5       |
| `paper`/`bloom`  | 5.08 : 1  | 9.30 : 1  | ≥ 4.5       |
| `paper`/`canopy` | 11.47 : 1 | 9.70 : 1  | ≥ 4.5       |
| `line`/`paper`   | 3.59 : 1  | 3.53 : 1  | ≥ 3 (UI)    |
| `line`/`sand`    | 3.15 : 1  | 3.19 : 1  | ≥ 3 (UI)    |

Bei `prefers-contrast: more` wird `line` auf `#4d473c` (light, 8.68 : 1) bzw. `#9aa392`
(dark, 7.16 : 1) verstärkt.

**Typografie.** Fraunces (Headlines, variabel inkl. `opsz`), Inter (Fließtext/UI),
IBM Plex Mono (Preise, SKUs, technische Meta). Alle über `next/font` mit
`display: swap`, auf `latin` subgesetzt und selbst ausgeliefert. Die Skala ist als Set
definiert — Größe, Leading, Tracking und Gewicht gehören pro Stufe zusammen; Tracking
ist größenabhängig (Display `-0.03em`, Body `0`, Labels `+0.08em`), Leading skaliert
invers (Display `1.02`, Body `1.6`). Alle Größen fluid über `clamp()`, Basis `rem`.

**Motion.** Springs statt fester Durations (`src/lib/motion.ts`): kritisch gedämpft
(`bounce: 0`) als Default, Overshoot nur nach Gesten mit Momentum. Press-Feedback läuft
über CSS `:active` — feuert auf pointer-down und braucht kein JS.

**Barrierefreiheit.** `prefers-reduced-motion` ⇒ Cross-Fade statt Bewegung,
`prefers-reduced-transparency` ⇒ kein Backdrop-Blur, `prefers-contrast: more` ⇒
verstärkte Rahmen. Sichtbarer Fokus-Ring global, Skip-Link im Storefront-Layout,
semantisches HTML vor ARIA.

## Struktur

```
src/
  app/
    (shop)/            öffentliche Storefront-Routen
    admin/
      layout.tsx       gemeinsame Hülle (kein Gate)
      login/           öffentlich erreichbar
      (dashboard)/     Auth-Gate + Admin-Shell
        species/       Arten-CRUD: Liste, new/, [id]/, actions.ts
    layout.tsx, error.tsx, not-found.tsx
  components/ui/       Button, SubmitButton, Field, Input, Select, Textarea,
                       Checkbox, Card, Badge, Container, Section, Reveal
  db/
    schema.ts          Tabellen + Relations, Typen per Infer*Model
    index.ts           Drizzle-Client (Neon, server-only)
    migrations/        drizzle-kit-Output
    seed.ts            idempotenter Admin-Seed
  lib/
    auth/              JWT, Session, Passwort, Rate-Limit, CSRF, requireAdmin
    species/           Queries, Schwierigkeitsgrad, Formular-Mapping
    validation/        Zod-Schemata der Formulargrenzen
    slug.ts            Slug-Vorschlag
    db-errors.ts       Postgres-Fehlercodes (23505/23503) lesbar machen
    env.ts             Zod-validierte Env (server-only)
  styles/globals.css   @theme-Tokens
  proxy.ts             Nonce-CSP + JWT-Vorprüfung (Next 16, ex-middleware.ts)
```

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) läuft bei Push und PR:
Install (frozen lockfile) → typecheck → lint → test → build. Node ist auf `24.13.0`
gepinnt, pnpm-Store und Next-Build-Cache werden gecacht. Die Env-Variablen sind
syntaktisch valide Dummy-Werte, damit die Zod-Validierung im Build wirklich durchläuft.

## Entschieden: durchgehend dynamisches Rendering mit Nonce-CSP

Die App rendert jede Route pro Request. `app/layout.tsx` ruft dafür `connection()` auf.
Das ist kein Versehen, sondern die Konsequenz der strikten CSP: Next hängt den Nonce
nur beim Rendern an seine Script-Tags, eine statisch vorgerenderte Seite würde von der
eigenen Policy blockiert.

Der Trade-off: strikte, nonce-basierte CSP ohne `unsafe-inline` für Scripts, dazu ein
einziger Renderpfad, den man nicht im Kopf behalten muss — gegen statisches Rendering
und dessen Latenz- und Kostenvorteil. Für einen Admin-lastigen Shop ohne öffentlichen
Traffic ist das der richtige Tausch.

Eine hash-basierte CSP wäre die Alternative, wird aber **nicht** gebaut. Neu bewertet
wird die Frage erst, wenn die öffentliche Storefront steht und Performance oder Kosten
es tatsächlich erfordern — nicht vorher.

## Offene Punkte

- `style-src` trägt `'unsafe-inline'`. next/font und Tailwind schreiben Style-Tags zur
  Laufzeit; ein Nonce erreicht sie nicht zuverlässig.
- `robots: { index: false }` steht global im Root-Layout. Vor dem Launch umstellen.
- `media` löscht mit einer Art kaskadierend mit. Sobald Bilder in Vercel Blob liegen,
  bleiben deren Dateien dabei liegen — Aufräumschritt gehört zum Upload-Feature.
- Die Artenliste hat weder Pagination noch Sortierung oder Suche. Ab etwa fünfzig
  Arten wird das unhandlich.
