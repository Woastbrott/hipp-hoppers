import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/cn';

export type BadgeTone = 'published' | 'draft' | 'neutral';

const tones: Record<BadgeTone, string> = {
  published: 'bg-canopy text-paper',
  draft: 'border border-line text-fern',
  neutral: 'bg-sand text-ink',
};

export type BadgeProps = ComponentPropsWithoutRef<'span'> & {
  tone?: BadgeTone;
};

/**
 * Status als Text mit Flaeche, nicht als farbiger Punkt: Farbe allein darf keine
 * Information tragen (WCAG 1.4.1).
 */
export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1',
        'font-mono text-label uppercase',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
