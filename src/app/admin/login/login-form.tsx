'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Reveal } from '@/components/ui/reveal';

import { loginAction } from './actions';
import { initialLoginState } from './state';

/**
 * Client-Insel nur fuer den Formular-State. Die Seite drumherum bleibt Server Component.
 */
export function LoginForm({ nextPath }: { nextPath?: string }) {
  const [state, formAction, isPending] = useActionState(loginAction, initialLoginState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

      <Input
        id="email"
        name="email"
        label="E-Mail"
        type="email"
        autoComplete="username"
        required
        maxLength={254}
        disabled={isPending}
      />

      <Input
        id="password"
        name="password"
        label="Passwort"
        type="password"
        autoComplete="current-password"
        required
        maxLength={1024}
        disabled={isPending}
      />

      {/* Live-Region: der Fehler wird auch ohne Blickkontakt angesagt. */}
      <div role="alert" aria-live="assertive">
        {state.error ? (
          <Reveal key={state.error}>
            <p className="text-caption text-bloom">{state.error}</p>
          </Reveal>
        ) : null}
      </div>

      <Button type="submit" size="lg" disabled={isPending} aria-busy={isPending}>
        {isPending ? 'Moment …' : 'Anmelden'}
      </Button>
    </form>
  );
}
