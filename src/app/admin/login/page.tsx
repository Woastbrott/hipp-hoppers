import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { Card } from '@/components/ui/card';
import { Container } from '@/components/ui/container';
import { getCurrentAdmin } from '@/lib/auth/current-admin';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Anmelden',
  robots: { index: false, follow: false },
};

/** `searchParams` ist eine externe Grenze — also validiert, nicht geglaubt. */
const searchParamsSchema = z.object({
  next: z.string().max(512).optional(),
});

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /*
   * Autoritativer Check: wer schon eine gueltige Session hat, braucht kein Login-Formular.
   * Der Proxy leitet hier bewusst NICHT um — er kennt die `token_version` nicht und
   * wuerde bei einem abgelaufenen Logout-Token eine Schleife zwischen /admin und
   * /admin/login bauen.
   */
  const admin = await getCurrentAdmin();
  if (admin) {
    redirect('/admin');
  }

  const parsed = searchParamsSchema.safeParse(await searchParams);
  const nextPath = parsed.success ? parsed.data.next : undefined;

  return (
    <Container width="prose" className="flex min-h-dvh items-center justify-center py-16">
      <div className="w-full max-w-[26rem]">
        <p className="font-mono text-label text-fern uppercase">Hipp Hoppers · Admin</p>

        <h1 className="mt-3 font-display text-title text-canopy">Anmelden</h1>

        <Card className="mt-8">
          <LoginForm nextPath={nextPath} />
        </Card>
      </div>
    </Container>
  );
}
