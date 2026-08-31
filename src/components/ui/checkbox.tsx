import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/cn';

import { FieldMessage, fieldDescribedBy } from './field';

export type CheckboxProps = Omit<ComponentPropsWithoutRef<'input'>, 'id' | 'type'> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
};

/**
 * Label rechts statt oben — bei einer Checkbox ist die Beschriftung die Aussage,
 * nicht die Ueberschrift eines Felds.
 */
export function Checkbox({ id, label, hint, error, className, ...props }: CheckboxProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        <input
          id={id}
          type="checkbox"
          className={cn(
            'size-[1.125rem] shrink-0 rounded-[0.25rem]',
            'border border-line bg-paper',
            'accent-canopy',
            'transition-colors duration-100 ease-out',
            'disabled:cursor-not-allowed disabled:opacity-55',
            error ? 'border-bloom' : '',
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy({ id, label, hint, error })}
          {...props}
        />

        <label htmlFor={id} className="text-body text-ink select-none">
          {label}
        </label>
      </div>

      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
}
