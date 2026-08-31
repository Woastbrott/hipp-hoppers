import type { ComponentPropsWithoutRef, ElementType } from 'react';

import { cn } from '@/lib/cn';

export type ContainerWidth = 'prose' | 'default' | 'wide';

const widths: Record<ContainerWidth, string> = {
  /** Fliesstextbreite — knapp unter 70 Zeichen pro Zeile. */
  prose: 'max-w-[38rem]',
  default: 'max-w-[72rem]',
  wide: 'max-w-[88rem]',
};

export type ContainerProps = ComponentPropsWithoutRef<'div'> & {
  as?: ElementType;
  width?: ContainerWidth;
};

/** Breiten in `rem`, damit eine groessere User-Textgroesse das Layout mitwachsen laesst. */
export function Container({
  as: Component = 'div',
  width = 'default',
  className,
  ...props
}: ContainerProps) {
  return (
    <Component className={cn('mx-auto w-full px-5 sm:px-8', widths[width], className)} {...props} />
  );
}
