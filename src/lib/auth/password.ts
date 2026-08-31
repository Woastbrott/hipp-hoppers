import 'server-only';

import { hash, verify, type Algorithm } from '@node-rs/argon2';

/**
 * argon2id statt bcrypt.
 *
 * bcrypt ist nur rechenintensiv; argon2id ist zusaetzlich speicherintensiv und damit
 * deutlich unattraktiver fuer GPU-/ASIC-Cracking. Ausserdem schneidet bcrypt Passwoerter
 * nach 72 Bytes stillschweigend ab — eine Falle, die man nicht braucht.
 *
 * Parameter nach OWASP-Minimum fuer argon2id: 19 MiB Speicher, 2 Durchlaeufe,
 * Parallelitaet 1. Bleibt auf einer serverless Function im zweistelligen ms-Bereich.
 *
 * Paket: `@node-rs/argon2` (napi-rs) statt `argon2`, weil es vorgebaute Binaries fuer
 * linux-x64-gnu (Vercel, CI) und win32-x64-msvc (lokal) mitbringt — kein node-gyp.
 */
/**
 * Entspricht `Algorithm.Argon2id`. Als Literal, weil @node-rs/argon2 das Enum als
 * ambient `const enum` deklariert — das laesst sich unter `verbatimModuleSyntax`
 * nicht als Wert importieren.
 */
const ARGON2ID = 2 satisfies Algorithm;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

/**
 * Hash eines zufaelligen, weggeworfenen Passworts mit exakt denselben Parametern.
 *
 * Wird verifiziert, wenn zu einer E-Mail kein Konto existiert. Damit kostet ein
 * unbekannter Account genauso viel Zeit wie ein falsches Passwort — sonst verraet
 * die Antwortzeit, welche Adressen registriert sind.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$k4PosbE/dIW/jeEgTOpYpg$GV/NnIoAyikIZ2U8GEBsr4izj2xgSUs8KLPK/NV0pm8';

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * `verify` aus argon2 vergleicht die Tags in konstanter Zeit; ein eigener
 * String-Vergleich waere hier der Fehler.
 */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, ARGON2_OPTIONS);
  } catch {
    // Kaputter/fremdformatiger Hash in der DB ist kein gueltiges Passwort — und
    // auch kein Grund, dem Client etwas ueber den Zustand der DB zu erzaehlen.
    return false;
  }
}

/** Brennt dieselbe Rechenzeit ab, wenn es gar kein Konto zu pruefen gibt. */
export async function burnPasswordVerification(password: string): Promise<void> {
  await verifyPassword(DUMMY_HASH, password);
}
