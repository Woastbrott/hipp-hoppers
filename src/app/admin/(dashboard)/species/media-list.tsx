import Image from 'next/image';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { MediaItem } from '@/lib/media/queries';

import {
  deleteSpeciesMediaAction,
  moveSpeciesMediaAction,
  updateSpeciesMediaAltAction,
} from './actions';
import { MediaControls } from './media-controls';

/**
 * Galerie einer Art. Server Component — die Bilder kommen aus der Datenbank, nur die
 * Bedienelemente sind eine Client-Insel.
 *
 * Die Actions werden hier gebunden, nicht im Client: Next verschluesselt gebundene
 * Argumente, die Media-Id ist damit nicht aus dem Browser heraus austauschbar.
 */
export function MediaList({ items }: { items: MediaItem[] }) {
  if (items.length === 0) {
    return (
      <Card className="flex flex-col gap-2">
        <h3 className="font-display text-subhead text-canopy">Noch keine Bilder</h3>
        <p className="max-w-[52ch] text-body text-ink/80">
          Lad das erste Bild hoch. Das oberste wird später als Titelbild verwendet — die Reihenfolge
          änderst du mit den Pfeilen.
        </p>
      </Card>
    );
  }

  return (
    <ul className="grid gap-6 sm:grid-cols-2">
      {items.map((item, index) => (
        <li key={item.id}>
          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-label text-fern uppercase">Position {index + 1}</span>
              {index === 0 ? <Badge tone="published">Titelbild</Badge> : null}
            </div>

            <div className="relative aspect-[4/3] overflow-hidden rounded-field border border-line/50 bg-paper">
              <Image
                src={item.url}
                alt={item.alt}
                fill
                sizes="(min-width: 640px) 33vw, 90vw"
                className="object-contain"
              />
            </div>

            <p className="font-mono text-label text-fern">
              {item.width} × {item.height} px
            </p>

            <MediaControls
              mediaId={item.id}
              alt={item.alt}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              updateAltAction={updateSpeciesMediaAltAction.bind(null, item.id)}
              deleteAction={deleteSpeciesMediaAction.bind(null, item.id)}
              moveUpAction={moveSpeciesMediaAction.bind(null, item.id, 'up')}
              moveDownAction={moveSpeciesMediaAction.bind(null, item.id, 'down')}
            />
          </Card>
        </li>
      ))}
    </ul>
  );
}
