import type { Transition } from 'motion/react';

/**
 * Motion-Defaults.
 *
 * Springs statt fester Durations: eine Spring ist unterbrechbar und uebernimmt beim
 * Re-Target die aktuelle Geschwindigkeit — eine Keyframe-Choreografie kann das nicht.
 * `duration` ist bei Motion die Response-Zeit der Feder, nicht ihre Laufzeit.
 *
 * `bounce: 0` = kritisch gedaempft, kein Overshoot. Overshoot gibt es nur, wenn der
 * Bewegung echtes Momentum vorausging (Flick, Drag-Release) — sonst wirkt es wie Deko.
 */

/** Standard fuer Zustandswechsel: ruhig, kein Nachschwingen. */
export const springDefault: Transition = {
  type: 'spring',
  bounce: 0,
  duration: 0.35,
};

/** Nur nach einer Geste mit Momentum. */
export const springMomentum: Transition = {
  type: 'spring',
  bounce: 0.2,
  duration: 0.4,
};

/** Press-Feedback: muss auf pointer-down sofort sichtbar sein. */
export const springPress: Transition = {
  type: 'spring',
  bounce: 0,
  duration: 0.12,
};

/**
 * Ersatz bei `prefers-reduced-motion: reduce`: Cross-Fade statt Bewegung,
 * kein Overshoot, keine Verschiebung.
 */
export const reducedMotionTransition: Transition = {
  type: 'tween',
  duration: 0.18,
  ease: 'easeOut',
};

export function transitionFor(prefersReducedMotion: boolean | null): Transition {
  return prefersReducedMotion ? reducedMotionTransition : springDefault;
}
