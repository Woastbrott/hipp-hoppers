'use client';

import { useFormStatus } from 'react-dom';

import { Button, type ButtonProps } from './button';

export type SubmitButtonProps = Omit<ButtonProps, 'type'> & {
  /** Text waehrend der Absendung. Ohne Angabe bleibt die Beschriftung stehen. */
  pendingLabel?: string;
};

/**
 * Absende-Button, der seinen Pending-Zustand vom umgebenden Formular liest.
 *
 * Fuer Formulare ohne eigenen State — ein `<form action={…}>` mit einem einzelnen
 * Button. `useFormStatus` liest den Status des naechsten Eltern-Formulars, deshalb
 * muss der Button darin gerendert werden und nicht daneben.
 *
 * `disabled` waehrend der Absendung verhindert den Doppelklick.
 */
export function SubmitButton({ children, pendingLabel, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || disabled === true} aria-busy={pending} {...props}>
      {pending && pendingLabel !== undefined ? pendingLabel : children}
    </Button>
  );
}
