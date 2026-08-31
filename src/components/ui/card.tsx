import type { ComponentPropsWithoutRef, ElementType } from 'react';

import { cn } from '@/lib/cn';

export type CardProps = ComponentPropsWithoutRef<'div'> & {
  as?: ElementType;
};

/**
 * Gedaempfte Flaeche auf `sand`. Der Rahmen laeuft bewusst auf `line/50`: hier trennt
 * schon der Flaechenunterschied, die Linie ist Dekoration. Volle `line`-Staerke
 * (>= 3:1) bleibt Bedienelementen vorbehalten, deren Grenze man erkennen muss.
 */
export function Card({ as: Component = 'div', className, ...props }: CardProps) {
  return (
    <Component
      className={cn('rounded-card border border-line/50 bg-sand p-6 sm:p-8', className)}
      {...props}
    />
  );
}
