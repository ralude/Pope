import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import { type LockBackgroundSnapshot } from '@pope/shared';
import { eq } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { DATABASE, type Database } from '../db/database.js';
import { lockScreenBackground } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { webpDimensions } from './webp-dimensions.js';

type StaffActor = NonNullable<typeof lockScreenBackground.$inferSelect.changedBy>;

/**
 * Fondo global de la pantalla de bloqueo (REQ-003-70, REQ-003-71): la imagen vive en disco,
 * con su huella como nombre; la base de datos guarda solo sus metadatos y la revisión.
 */
@Injectable()
export class LockBackgroundService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  private get dir(): string {
    return join(this.config.dataDir, 'lock-background');
  }

  /** Guarda la imagen y sube la revisión, con su evento, en una sola transacción. */
  async set(body: Buffer, actor: StaffActor): Promise<LockBackgroundSnapshot> {
    const dimensions = webpDimensions(body);
    if (!dimensions) {
      throw new Error('WebP ilegible');
    }
    const sha256 = createHash('sha256').update(body).digest('hex');
    await mkdir(this.dir, { recursive: true });
    // Se escribe aparte y se renombra: nunca se sirve una imagen a medio escribir.
    const temporary = join(this.dir, `${sha256}.webp.tmp`);
    await writeFile(temporary, body);
    await rename(temporary, join(this.dir, `${sha256}.webp`));

    const background = { sha256, size: body.length, mimeType: 'image/webp' as const, ...dimensions };
    return this.events.inTransaction(async (tx, emit) => {
      const [row] = await tx
        .select({ revision: lockScreenBackground.revision })
        .from(lockScreenBackground)
        .where(eq(lockScreenBackground.id, 1))
        .for('update');
      const revision = (row?.revision ?? 0) + 1;
      const changedAt = this.clock.now();
      await tx
        .update(lockScreenBackground)
        .set({ revision, ...background, changedAt, changedBy: actor })
        .where(eq(lockScreenBackground.id, 1));
      emit({
        type: 'lock_screen.background_changed',
        version: 1,
        actor,
        payload: { revision, background },
      });
      return { revision, background, changedAt: changedAt.toISOString(), changedBy: actor };
    });
  }
}
