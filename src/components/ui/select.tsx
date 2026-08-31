import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/cn';

import { controlClasses, Field, fieldDescribedBy } from './field';

export type SelectOption = {
  value: string;
  label: string;
};

export type SelectProps = Omit<ComponentPropsWithoutRef<'select'>, 'id' | 'children'> & {
  id: string;
  label: string;
  options: readonly SelectOption[];
  /** Erster Eintrag fuer "nichts gewaehlt". Weglassen macht das Feld faktisch zur Pflicht. */
  placeholder?: string;
  hint?: string;
  error?: string;
};

/**
 * Natives `<select>`, kein nachgebautes Dropdown: Tastaturbedienung, Screenreader und
 * die Auswahl auf dem Telefon funktionieren damit ohne eine Zeile JavaScript.
 */
export function Select({
  id,
  label,
  options,
  placeholder,
  hint,
  error,
  className,
  ...props
}: SelectProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        className={controlClasses(Boolean(error), cn('h-11 appearance-none pr-9', className))}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescribedBy({ id, label, hint, error })}
        {...props}
      >
        {placeholder === undefined ? null : <option value="">{placeholder}</option>}

        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
