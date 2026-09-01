import { cn } from '@/lib/cn';

/**
 * Platzhalter fuer Arten ohne Bild.
 *
 * Ein leeres Rechteck liest sich wie ein Ladefehler. Stattdessen eine gezeichnete
 * Flaeche aus dem Token-System: `sand` als Grund, das Wedel-Motiv in `line`. Rein
 * dekorativ — den Namen der Art traegt der Link daneben, hier gibt es nichts
 * vorzulesen.
 */
export function CoverPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex h-full w-full items-center justify-center bg-sand text-line', className)}
    >
      <svg
        viewBox="0 0 64 64"
        role="presentation"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-16 w-16 opacity-70"
      >
        <path d="M32 58V10" />
        <path d="M32 45c-9 0-14-4-15-11 8-1 13 3 15 11Z" />
        <path d="M32 45c9 0 14-4 15-11-8-1-13 3-15 11Z" />
        <path d="M32 32c-8 0-12-4-13-10 7-1 11 3 13 10Z" />
        <path d="M32 32c8 0 12-4 13-10-7-1-11 3-13 10Z" />
        <path d="M32 20c-6 0-9-3-10-8 6-1 9 2 10 8Z" />
        <path d="M32 20c6 0 9-3 10-8-6-1-9 2-10 8Z" />
      </svg>
    </div>
  );
}
