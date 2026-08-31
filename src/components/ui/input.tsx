import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/cn';

export type InputProps = ComponentPropsWithoutRef<'input'> & {
  id: string;
  label: string;
  /** Erklaerender Hinweis unter dem Feld. */
  hint?: string;
  /** Gesetzt = Feld ist fehlerhaft; ersetzt den Hinweis und setzt aria-invalid. */
  error?: string;
};

/**
 * Semantisches HTML zuerst: echtes `<label for>`, echte `<input>`, Beschreibung ueber
 * `aria-describedby`. ARIA nur, wo das Markup allein es nicht hergibt (`aria-invalid`).
 */
export function Input({ id, label, hint, error, className, ...props }: InputProps) {
  const describedById = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-mono text-label text-fern uppercase">
        {label}
      </label>

      <input
        id={id}
        className={cn(
          'h-11 w-full rounded-field px-3.5',
          'border border-line bg-paper text-ink',
          'font-sans text-body',
          'placeholder:text-fern/70',
          'transition-colors duration-100 ease-out',
          'hover:border-ink/60',
          'disabled:cursor-not-allowed disabled:opacity-55',
          error ? 'border-bloom' : '',
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        {...props}
      />

      {error ? (
        <p id={`${id}-error`} className="text-caption text-bloom">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-caption text-fern">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
