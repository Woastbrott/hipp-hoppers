import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

/**
 * Gemeinsame Huelle fuer alles unter /admin — inklusive Login.
 *
 * Das Auth-Gate sitzt bewusst NICHT hier, sondern eine Ebene tiefer in
 * `admin/(dashboard)/layout.tsx`: Layouts komponieren sich in Next, ein Gate an dieser
 * Stelle wuerde auch `/admin/login` sperren und damit eine Redirect-Schleife bauen.
 * Die Route-Gruppe `(dashboard)` haelt die Login-Seite ausserhalb des geschuetzten Baums,
 * ohne die URL zu veraendern.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-paper">{children}</div>;
}
