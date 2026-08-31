import { relations, sql, type InferInsertModel, type InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { SPECIES_DIFFICULTIES } from '@/lib/species/difficulty';

/**
 * Konvention: Postgres-Bezeichner snake_case (explizit als String im pgTable-Mapping),
 * Drizzle-Properties camelCase. Kein implizites Casing — was in der DB steht, steht hier.
 */

const createdAt = timestamp('created_at', { withTimezone: true, mode: 'date' })
  .notNull()
  .defaultNow();

const updatedAt = timestamp('updated_at', { withTimezone: true, mode: 'date' })
  .notNull()
  .defaultNow();

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

// Werte kommen aus lib/species/difficulty.ts — dieselbe Liste speist das Zod-Enum
// und die Optionen im Formular.
export const speciesDifficultyEnum = pgEnum('species_difficulty', SPECIES_DIFFICULTIES);

export const productStatusEnum = pgEnum('product_status', ['draft', 'active', 'archived']);

// ---------------------------------------------------------------------------
// admin_users
// ---------------------------------------------------------------------------

export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    /**
     * Wird beim Logout inkrementiert. Das Session-JWT traegt die Version als Claim;
     * der autoritative Check im Admin-Layout vergleicht sie gegen diesen Wert.
     * Damit faellt jedes vorher ausgestellte Token sofort durch — auch ein abgegriffenes.
     */
    tokenVersion: integer('token_version').notNull().default(1),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex('admin_users_email_key').on(table.email)],
);

// ---------------------------------------------------------------------------
// species
// ---------------------------------------------------------------------------

export const species = pgTable(
  'species',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    scientificName: text('scientific_name').notNull(),
    commonName: text('common_name'),
    description: text('description'),

    // Care-Metafelder. Ganzzahlen statt Freitext, damit spaeter filterbar.
    temperatureMinCelsius: integer('temperature_min_celsius'),
    temperatureMaxCelsius: integer('temperature_max_celsius'),
    humidityMinPercent: integer('humidity_min_percent'),
    humidityMaxPercent: integer('humidity_max_percent'),
    adultSizeMinMm: integer('adult_size_min_mm'),
    adultSizeMaxMm: integer('adult_size_max_mm'),
    difficulty: speciesDifficultyEnum('difficulty'),

    published: boolean('published').notNull().default(false),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex('species_slug_key').on(table.slug),
    index('species_published_idx').on(table.published),
    check(
      'species_temperature_range_valid',
      sql`${table.temperatureMinCelsius} is null or ${table.temperatureMaxCelsius} is null or ${table.temperatureMinCelsius} <= ${table.temperatureMaxCelsius}`,
    ),
    check(
      'species_humidity_range_valid',
      sql`${table.humidityMinPercent} is null or ${table.humidityMaxPercent} is null or ${table.humidityMinPercent} <= ${table.humidityMaxPercent}`,
    ),
    check(
      'species_adult_size_range_valid',
      sql`${table.adultSizeMinMm} is null or ${table.adultSizeMaxMm} is null or ${table.adultSizeMinMm} <= ${table.adultSizeMaxMm}`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// products
// ---------------------------------------------------------------------------

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** Geld immer als Ganzzahl in der kleinsten Einheit. Kein Float, nie. */
    priceCents: integer('price_cents').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    /**
     * `restrict` statt `set null`: eine Art zu loeschen, an der Produkte haengen,
     * wuerde diese still von ihrer Art trennen. Die Datenbank lehnt das jetzt ab —
     * die Server Action prueft vorher, damit die Meldung lesbar bleibt, aber die
     * Garantie liegt hier und nicht in der Anwendung.
     */
    speciesId: uuid('species_id').references(() => species.id, { onDelete: 'restrict' }),
    status: productStatusEnum('status').notNull().default('draft'),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex('products_slug_key').on(table.slug),
    index('products_species_id_idx').on(table.speciesId),
    index('products_status_idx').on(table.status),
    check('products_price_cents_non_negative', sql`${table.priceCents} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// media
// ---------------------------------------------------------------------------

/**
 * Polymorphe Zuordnung als "exclusive arc": zwei typisierte, nullable Fremdschluessel
 * plus CHECK, dass genau einer gesetzt ist. Damit bleibt die referentielle Integritaet
 * in der DB — anders als bei einem untypisierten owner_id/owner_type-Paar, das Postgres
 * nicht pruefen kann.
 *
 * Upload-Logik (Vercel Blob) folgt in Phase 1; die Tabelle steht schon.
 */
export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    url: text('url').notNull(),
    alt: text('alt').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    position: integer('position').notNull().default(0),
    speciesId: uuid('species_id').references(() => species.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
    createdAt,
  },
  (table) => [
    index('media_species_id_idx').on(table.speciesId),
    index('media_product_id_idx').on(table.productId),
    /**
     * Ein Blob gehoert genau einmal in die Tabelle. Faellt eine Antwort des
     * Upload-Clients aus und der Browser wiederholt den Persist-Aufruf, entsteht
     * sonst ein zweiter Eintrag auf dieselbe Datei.
     */
    uniqueIndex('media_url_key').on(table.url),
    /** Deckt die Sortierung der Galerie ab: alle Bilder einer Art in Position-Reihenfolge. */
    index('media_species_position_idx').on(table.speciesId, table.position),
    check('media_owner_exactly_one', sql`num_nonnulls(${table.speciesId}, ${table.productId}) = 1`),
    check('media_dimensions_positive', sql`${table.width} > 0 and ${table.height} > 0`),
    check('media_position_non_negative', sql`${table.position} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// login_attempts (Rate-Limit-State)
// ---------------------------------------------------------------------------

/**
 * Der Limiter-State muss geteilt sein: auf Vercel hat jede Invocation ihren eigenen
 * Speicher, eine In-Memory-Map wuerde lokal jeden Test bestehen und in Produktion nichts tun.
 *
 * `identifier` ist praefixiert (ip:1.2.3.4, account:mail@example.com), damit IP- und
 * Konto-Bucket in derselben Tabelle liegen, ohne sich zu ueberschneiden.
 */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    lockedUntil: timestamp('locked_until', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('login_attempts_identifier_key').on(table.identifier),
    index('login_attempts_locked_until_idx').on(table.lockedUntil),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const speciesRelations = relations(species, ({ many }) => ({
  products: many(products),
  media: many(media),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  species: one(species, {
    fields: [products.speciesId],
    references: [species.id],
  }),
  media: many(media),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  species: one(species, {
    fields: [media.speciesId],
    references: [species.id],
  }),
  product: one(products, {
    fields: [media.productId],
    references: [products.id],
  }),
}));

// ---------------------------------------------------------------------------
// Typen — abgeleitet, nicht gedoppelt
// ---------------------------------------------------------------------------

export type AdminUser = InferSelectModel<typeof adminUsers>;
export type NewAdminUser = InferInsertModel<typeof adminUsers>;

export type Species = InferSelectModel<typeof species>;
export type NewSpecies = InferInsertModel<typeof species>;

export type Product = InferSelectModel<typeof products>;
export type NewProduct = InferInsertModel<typeof products>;

export type Media = InferSelectModel<typeof media>;
export type NewMedia = InferInsertModel<typeof media>;

export type LoginAttempt = InferSelectModel<typeof loginAttempts>;
export type NewLoginAttempt = InferInsertModel<typeof loginAttempts>;

export type ProductStatus = (typeof productStatusEnum.enumValues)[number];
