import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/cn';

import { controlClasses, Field, fieldDescribedBy } from './field';

export type InputProps = Omit<ComponentPropsWithoutRef<'input'>, 'id'> & {
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
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        className={controlClasses(Boolean(error), cn('h-11', className))}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescribedBy({ id, label, hint, error })}
        {...props}
      />
    </Field>
  );
}
