import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse, type NextRequest } from 'next/server';

import { resolveUploadTokenOptions, type UploadTokenDenial } from '@/lib/blob/upload-token';
import { env } from '@/lib/env';

/**
 * Token-Route fuer den Client-Upload.
 *
 * Ein Route Handler statt einer Server Action, weil das Blob-SDK im Browser genau
 * diesen HTTP-Endpunkt aufruft — hier ist die HTTP-API kein Selbstzweck.
 *
 * Die Entscheidung selbst faellt in `lib/blob/upload-token.ts`; hier bleibt nur die
 * Uebersetzung in HTTP.
 */

const GENERIC_ERROR = 'Upload abgelehnt.';

function statusFor(reason: UploadTokenDenial): number {
  return reason === 'unauthorized' ? 401 : 400;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let status = 400;

  try {
    const body = (await request.json()) as HandleUploadBody;

    const result = await handleUpload({
      body,
      request,
      token: env.BLOB_READ_WRITE_TOKEN,

      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const resolved = await resolveUploadTokenOptions(pathname, clientPayload);

        if (!resolved.ok) {
          status = statusFor(resolved.reason);
          // handleUpload kennt nur Exceptions; der Status steht oben.
          throw new Error(resolved.message);
        }

        return resolved.options;
      },

      /*
       * Feuert nur, wenn der Store die Anwendung erreichen kann — lokal also nie.
       * Die Persistenz haengt deshalb nicht hier, sondern an einer Server Action,
       * die der Client nach dem Upload aufruft. Dieser Haken bleibt als Log.
       */
      onUploadCompleted: (payload) => {
        console.warn('Blob-Upload abgeschlossen', payload.blob.pathname);
        return Promise.resolve();
      },
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error(
      'Upload-Token abgelehnt',
      error instanceof Error ? error.message : 'unbekannter Fehler',
    );

    // Nach aussen nur der Status — die Begruendung bleibt im Server-Log.
    return NextResponse.json({ error: GENERIC_ERROR }, { status });
  }
}
