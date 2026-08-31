import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/cn';

import { controlClasses, Field, fieldDescribedBy } from './field';

export type TextareaProps = Omit<ComponentPropsWithoutRef<'textarea'>, 'id'> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
};

export function Textarea({ id, label, hint, error, className, rows = 6, ...props }: TextareaProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        rows={rows}
        className={controlClasses(Boolean(error), cn('resize-y py-2.5 leading-relaxed', className))}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescribedBy({ id, label, hint, error })}
        {...props}
      />
    </Field>
  );
}
