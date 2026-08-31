/**
 * Getrennt von `actions.ts`, weil ein `'use server'`-Modul ausschliesslich async
 * Funktionen exportieren darf — ein exportiertes Objekt laesst Next zur Laufzeit
 * beim Laden des Moduls scheitern, nicht erst beim Aufruf.
 */
export type LoginFormState = {
  error: string | null;
};

export const initialLoginState: LoginFormState = { error: null };
