'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { slugify } from '@/lib/slug';
import { SPECIES_DIFFICULTIES, SPECIES_DIFFICULTY_LABELS } from '@/lib/species/difficulty';
import { SPECIES_FIELD_NAMES, type SpeciesFieldName } from '@/lib/validation/species';

import { initialSpeciesFormState, type SpeciesFormFields, type SpeciesFormState } from './state';

/**
 * Eine Quelle fuer die Feldbeschriftungen: das Feld selbst und der Link in der
 * Fehlerzusammenfassung sollen dieselbe Bezeichnung tragen.
 */
const FIELD_LABELS: Record<SpeciesFieldName, string> = {
  slug: 'Slug',
  scientificName: 'Wissenschaftlicher Name',
  commonName: 'Deutscher Name',
  description: 'Beschreibung',
  temperatureMinCelsius: 'Temperatur min (°C)',
  temperatureMaxCelsius: 'Temperatur max (°C)',
  humidityMinPercent: 'Luftfeuchte min (%)',
  humidityMaxPercent: 'Luftfeuchte max (%)',
  adultSizeMinMm: 'Größe adult min (mm)',
  adultSizeMaxMm: 'Größe adult max (mm)',
  difficulty: 'Schwierigkeitsgrad',
  published: 'Veröffentlicht',
};

const difficultyOptions = SPECIES_DIFFICULTIES.map((value) => ({
  value,
  label: SPECIES_DIFFICULTY_LABELS[value],
}));

export type SpeciesFormProps = {
  /** Fertig gebundene Server Action — das Binden passiert serverseitig, nicht hier. */
  action: (previous: SpeciesFormState, formData: FormData) => Promise<SpeciesFormState>;
  defaults: SpeciesFormFields;
  submitLabel: string;
  mode: 'create' | 'edit';
};

export function SpeciesForm({ action, defaults, submitLabel, mode }: SpeciesFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialSpeciesFormState);

  // Nach einem Fehlversuch gelten die zurueckgegebenen Rohwerte, sonst die vom Server.
  const source = state.values ?? defaults;

  const [scientificName, setScientificName] = useState(source.scientificName);
  const [slug, setSlug] = useState(source.slug);
  const [slugEdited, setSlugEdited] = useState(mode === 'edit');
  const [syncedAttempt, setSyncedAttempt] = useState(state.attempt);

  const summaryRef = useRef<HTMLDivElement>(null);

  // Zustand waehrend des Renderns nachziehen, statt ihn per Effect zu spiegeln:
  // nach jedem Serverdurchlauf gelten die frischen Werte.
  if (syncedAttempt !== state.attempt) {
    setSyncedAttempt(state.attempt);
    setScientificName(source.scientificName);
    setSlug(source.slug);
  }

  const errors = state.fieldErrors;
  const listedErrors = SPECIES_FIELD_NAMES.filter((name) => errors[name] !== undefined).map(
    (name) => ({ name, message: errors[name] ?? '' }),
  );
  const hasSummary = state.status === 'error';

  /*
   * Fokus nach einem Fehlversuch in die Zusammenfassung setzen.
   *
   * Ohne das passiert fuer Tastatur- und Screenreader-Nutzer nach dem Absenden nichts
   * Hoerbares: der Fokus liegt weiter auf dem Absende-Button, waehrend der eigentliche
   * Hinweis weit oben steht. Der Effect laeuft nach dem Commit — also auch nach dem
   * Remount der Felder, der Fokus geht damit nicht ins Leere.
   */
  useEffect(() => {
    if (hasSummary) {
      summaryRef.current?.focus();
    }
  }, [state.attempt, hasSummary]);

  function handleScientificNameChange(value: string) {
    setScientificName(value);

    // Vorschlag nur beim Anlegen und nur, solange der Slug nicht von Hand angefasst wurde.
    if (mode === 'create' && !slugEdited) {
      setSlug(slugify(value));
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {hasSummary ? (
        <div
          ref={summaryRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="flex flex-col gap-2 rounded-field border border-bloom px-4 py-3"
        >
          <p className="text-caption font-medium text-bloom">
            {state.formError ??
              (listedErrors.length === 1
                ? 'Ein Feld stimmt noch nicht.'
                : `${String(listedErrors.length)} Felder stimmen noch nicht.`)}
          </p>

          {listedErrors.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {listedErrors.map((entry) => (
                <li key={entry.name}>
                  <a
                    href={`#${entry.name}`}
                    className="text-caption text-bloom underline"
                    onClick={(event) => {
                      /*
                       * Ein reiner Fragment-Link scrollt das Feld zwar heran, setzt den
                       * Fokus aber nicht hinein — in Chrome bleibt er am Link. Fuer eine
                       * Fehlerliste ist genau das der Zweck, also von Hand.
                       */
                      event.preventDefault();
                      document.getElementById(entry.name)?.focus();
                    }}
                  >
                    {FIELD_LABELS[entry.name]}: {entry.message}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {state.status === 'saved' ? (
        <div role="status" aria-live="polite">
          <p className="rounded-field border border-line px-4 py-3 text-caption text-fern">
            Gespeichert.
          </p>
        </div>
      ) : null}

      {/* Der Key baut die unkontrollierten Felder nach jedem Serverdurchlauf neu auf,
          damit geaenderte Standardwerte auch wirklich ankommen. */}
      <div key={state.attempt} className="flex flex-col gap-6">
        <Card className="flex flex-col gap-5">
          <h2 className="font-display text-subhead text-canopy">Bestimmung</h2>

          <Input
            id="scientificName"
            name="scientificName"
            label={FIELD_LABELS.scientificName}
            value={scientificName}
            onChange={(event) => {
              handleScientificNameChange(event.target.value);
            }}
            error={errors.scientificName}
            autoComplete="off"
            maxLength={160}
            required
          />

          <Input
            id="commonName"
            name="commonName"
            label={FIELD_LABELS.commonName}
            defaultValue={source.commonName}
            error={errors.commonName}
            hint="Optional."
            autoComplete="off"
            maxLength={160}
          />

          <Input
            id="slug"
            name="slug"
            label={FIELD_LABELS.slug}
            value={slug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value);
            }}
            error={errors.slug}
            hint={
              mode === 'edit'
                ? 'Ändern bricht später öffentliche URLs — Weiterleitungen gibt es noch nicht.'
                : 'Vorschlag aus dem wissenschaftlichen Namen. Überschreibbar.'
            }
            autoComplete="off"
            maxLength={96}
            required
          />

          <Textarea
            id="description"
            name="description"
            label={FIELD_LABELS.description}
            defaultValue={source.description}
            error={errors.description}
            hint="Optional. Bis 4000 Zeichen."
            maxLength={4000}
          />
        </Card>

        <Card className="flex flex-col gap-5">
          <h2 className="font-display text-subhead text-canopy">Haltung</h2>

          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              id="temperatureMinCelsius"
              name="temperatureMinCelsius"
              label={FIELD_LABELS.temperatureMinCelsius}
              defaultValue={source.temperatureMinCelsius}
              error={errors.temperatureMinCelsius}
              inputMode="numeric"
              autoComplete="off"
            />
            <Input
              id="temperatureMaxCelsius"
              name="temperatureMaxCelsius"
              label={FIELD_LABELS.temperatureMaxCelsius}
              defaultValue={source.temperatureMaxCelsius}
              error={errors.temperatureMaxCelsius}
              inputMode="numeric"
              autoComplete="off"
            />
            <Input
              id="humidityMinPercent"
              name="humidityMinPercent"
              label={FIELD_LABELS.humidityMinPercent}
              defaultValue={source.humidityMinPercent}
              error={errors.humidityMinPercent}
              inputMode="numeric"
              autoComplete="off"
            />
            <Input
              id="humidityMaxPercent"
              name="humidityMaxPercent"
              label={FIELD_LABELS.humidityMaxPercent}
              defaultValue={source.humidityMaxPercent}
              error={errors.humidityMaxPercent}
              inputMode="numeric"
              autoComplete="off"
            />
            <Input
              id="adultSizeMinMm"
              name="adultSizeMinMm"
              label={FIELD_LABELS.adultSizeMinMm}
              defaultValue={source.adultSizeMinMm}
              error={errors.adultSizeMinMm}
              inputMode="numeric"
              autoComplete="off"
            />
            <Input
              id="adultSizeMaxMm"
              name="adultSizeMaxMm"
              label={FIELD_LABELS.adultSizeMaxMm}
              defaultValue={source.adultSizeMaxMm}
              error={errors.adultSizeMaxMm}
              inputMode="numeric"
              autoComplete="off"
            />
          </div>

          <Select
            id="difficulty"
            name="difficulty"
            label={FIELD_LABELS.difficulty}
            options={difficultyOptions}
            placeholder="Nicht eingeordnet"
            defaultValue={source.difficulty}
            error={errors.difficulty}
          />
        </Card>

        <Card className="flex flex-col gap-5">
          <h2 className="font-display text-subhead text-canopy">Sichtbarkeit</h2>

          <Checkbox
            id="published"
            name="published"
            label={FIELD_LABELS.published}
            defaultChecked={source.published === 'on'}
            error={errors.published}
            hint="Entwürfe erscheinen später nicht im Shop."
          />
        </Card>
      </div>

      <div className="flex items-center gap-4">
        {/* Pending kommt aus useActionState; `disabled` verhindert den Doppel-Submit. */}
        <Button type="submit" size="lg" disabled={isPending} aria-busy={isPending}>
          {isPending ? 'Speichert …' : submitLabel}
        </Button>

        <Link href="/admin/species" className="text-caption text-fern hover:text-canopy">
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
