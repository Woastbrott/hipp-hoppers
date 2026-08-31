import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Gemeinsames Geruest fuer Formularfelder: Label, Kontrolle, Hinweis oder Fehler.
 * Input, Select und Textarea benutzen es, damit Beschriftung, Fehlerdarstellung und
 * die aria-Verdrahtung an genau einer Stelle stehen.
 */

export type FieldChrome = {
  id: string;
  label: string;
  /** Erklaerender Hinweis unter dem Feld. Wird vom Fehler verdraengt. */
  hint?: string;
  error?: string;
};

/** Verknuepft Kontrolle und Beschreibung — Fehler hat Vorrang vor Hinweis. */
export function fieldDescribedBy(chrome: FieldChrome): string | undefined {
  if (chrome.error) return `${chrome.id}-error`;
  if (chrome.hint) return `${chrome.id}-hint`;
  return undefined;
}

/** Basis-Optik aller Eingabefelder. Volle Linienstaerke: die Grenze muss erkennbar sein. */
export function controlClasses(hasError: boolean, className?: string): string {
  return cn(
    'w-full rounded-field px-3.5',
    'border border-line bg-paper text-ink',
    'font-sans text-body',
    'placeholder:text-fern/70',
    'transition-colors duration-100 ease-out',
    'hover:border-ink/60',
    'disabled:cursor-not-allowed disabled:opacity-55',
    hasError ? 'border-bloom' : '',
    className,
  );
}

export function FieldMessage({ id, hint, error }: Omit<FieldChrome, 'label'>) {
  if (error) {
    return (
      <p id={`${id}-error`} className="text-caption text-bloom">
        {error}
      </p>
    );
  }

  if (hint) {
    return (
      <p id={`${id}-hint`} className="text-caption text-fern">
        {hint}
      </p>
    );
  }

  return null;
}

export type FieldProps = FieldChrome & {
  children: ReactNode;
  className?: string;
};

export function Field({ id, label, hint, error, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="font-mono text-label text-fern uppercase">
        {label}
      </label>

      {children}

      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
}
