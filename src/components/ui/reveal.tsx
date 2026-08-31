'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

import { reducedMotionTransition, springDefault } from '@/lib/motion';

export type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Sekunden. Sparsam einsetzen — gestaffelte Auftritte werden schnell zur Deko. */
  delay?: number;
};

/**
 * Client-Insel, so klein wie moeglich: nur dieser Wrapper braucht JS, der Inhalt
 * darin bleibt Server Component.
 *
 * Bei `prefers-reduced-motion: reduce` wird aus dem Versatz ein reiner Cross-Fade —
 * kein Slide, kein Overshoot.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{
        ...(prefersReducedMotion ? reducedMotionTransition : springDefault),
        delay,
      }}
    >
      {children}
    </motion.div>
  );
}
