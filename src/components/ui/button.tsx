import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base = [
  'inline-flex items-center justify-center gap-2',
  'rounded-field font-sans font-medium',
  'select-none whitespace-nowrap',
  // Feedback auf pointer-down, nicht erst auf click: :active feuert beim Druecken.
  // ~100ms, damit es sofort da ist. Unter reduced motion bleibt die Farbaenderung,
  // die Skalierung faellt weg.
  'transition-[transform,background-color,color] duration-100 ease-out',
  'active:scale-[0.98] motion-reduce:active:scale-100',
  'disabled:pointer-events-none disabled:opacity-55',
].join(' ');

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-bloom text-paper hover:bg-bloom/90',
  secondary: 'bg-canopy text-paper hover:bg-canopy/90',
  outline: 'border border-line bg-transparent text-ink hover:bg-sand',
  ghost: 'bg-transparent text-canopy hover:bg-sand',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-caption',
  md: 'h-11 px-5 text-body',
  lg: 'h-13 px-7 text-lead',
};

export type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/**
 * Server Component — der Press-State kommt aus CSS `:active` und braucht kein JS.
 * Fuer alles Gesten-Getriebene (Drag, Swipe) gilt weiterhin: Springs statt Transitions.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}

/** Fuer Links, die wie ein Button aussehen sollen (`<Link className={buttonClasses()}>`). */
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  return cn(base, variants[variant], sizes[size]);
}
