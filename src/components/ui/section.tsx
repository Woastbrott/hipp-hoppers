import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/cn';

export type SectionSpacing = 'sm' | 'md' | 'lg';

const spacings: Record<SectionSpacing, string> = {
  sm: 'py-10 sm:py-14',
  md: 'py-16 sm:py-24',
  lg: 'py-24 sm:py-36',
};

export type SectionProps = ComponentPropsWithoutRef<'section'> & {
  spacing?: SectionSpacing;
  /** Trennlinie oben — dekorativ, deshalb reduzierte Linienstaerke. */
  divided?: boolean;
};

export function Section({ spacing = 'md', divided = false, className, ...props }: SectionProps) {
  return (
    <section
      className={cn(spacings[spacing], divided ? 'border-t border-line/50' : '', className)}
      {...props}
    />
  );
}
