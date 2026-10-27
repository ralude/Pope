import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  type LockBackgroundError,
  type LockBackgroundSnapshot,
  MAX_BACKGROUND_HEIGHT,
  MAX_BACKGROUND_WIDTH,
} from '@pope/shared';
import { eq } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { DATABASE, type Database } from '../db/database.js';
import { lockScreenBackground } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { isWebp } from '../products/product-photos.service.js';
import { webpDimensions } from './webp-dimensions.js';

type StaffActor = NonNullable<typeof lockScreenBackground.$inferSelect.changedBy>;

/**
 * Fondo global de la pantalla de bloqueo (REQ-003-70, REQ-003-71): la imagen vive en disco,
 * con su huella como nombre; la base de datos guarda solo sus metadatos y la revisión.
 */
@Injectable()
export class LockBackgroundService {
  private readonly logger = new Logger('LockBackground');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  private get dir(): string {
    return join(this.config.dataDir, 'lock-background');
  }

  /** El fondo actual: el valor inicial (revisión 0) o el último cambio del administrador. */
  async get(): Promise<LockBackgroundSnapshot> {
    const [row] = await this.db
      .select()
      .from(lockScreenBackground)
      .where(eq(lockScreenBackground.id, 1));
    if (!row?.changedAt || !row.changedBy) {
      return { revision: 0, background: null, changedAt: null, changedBy: null };
    }
    return {
      revision: row.revision,
      background:
        row.sha256 === null
          ? null
          : {
              sha256: row.sha256,
              size: row.size ?? 0,
              mimeType: 'image/webp',
              width: row.width ?? 0,
              height: row.height ?? 0,
            },
      changedAt: row.changedAt.toISOString(),
      changedBy: row.changedBy,
    };
  }

  /** Los bytes del fondo actual, pedido por su huella; 404 si ya no es el actual o falta. */
  async read(sha256: string): Promise<Buffer> {
    const [row] = await this.db
      .select({ sha256: lockScreenBackground.sha256 })
      .from(lockScreenBackground)
      .where(eq(lockScreenBackground.id, 1));
    if (row?.sha256 !== sha256) {
      throw new NotFoundException('No existe ese fondo');
    }
    try {
      return await readFile(join(this.dir, `${sha256}.webp`));
    } catch {
      throw new NotFoundException('No se encuentra el archivo del fondo');
    }
  }

  /** Guarda la imagen y sube la revisión, con su evento, en una sola transacción. */
  async set(body: Buffer, actor: StaffActor): Promise<LockBackgroundSnapshot> {
    if (!isWebp(body)) {
      throw new UnsupportedMediaTypeException('El fondo debe ser una imagen WebP');
    }
    const dimensions = webpDimensions(body);
    if (!dimensions) {
      const error: LockBackgroundError = {
        code: 'invalid_image',
        message: 'La imagen está dañada o no se puede leer',
      };
      throw new UnprocessableEntityException(error);
    }
    if (dimensions.width > MAX_BACKGROUND_WIDTH || dimensions.height > MAX_BACKGROUND_HEIGHT) {
      const error: LockBackgroundError = {
        code: 'invalid_image',
        message: 'La imagen supera 1920×1080 píxeles',
      };
      throw new UnprocessableEntityException(error);
    }
    const sha256 = createHash('sha256').update(body).digest('hex');
    await mkdir(this.dir, { recursive: true });
    // Se escribe aparte y se renombra: nunca se sirve una imagen a medio escribir.
    const temporary = join(this.dir, `${sha256}.webp.tmp`);
    await writeFile(temporary, body);
    await rename(temporary, join(this.dir, `${sha256}.webp`));

    const background = {
      sha256,
      size: body.length,
      mimeType: 'image/webp' as const,
      ...dimensions,
    };
    let saved: { snapshot: LockBackgroundSnapshot; previous: string | null };
    try {
      saved = await this.events.inTransaction(async (tx, emit) => {
        const [row] = await tx
          .select({ revision: lockScreenBackground.revision, sha256: lockScreenBackground.sha256 })
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
        return {
          snapshot: {
            revision,
            background,
            changedAt: changedAt.toISOString(),
            changedBy: actor,
          },
          previous: row?.sha256 ?? null,
        };
      });
    } catch (error) {
      await this.discardUnused(sha256);
      throw error;
    }
    if (saved.previous !== null && saved.previous !== sha256) {
      // Queda un solo archivo: el anterior ya no lo usa nadie (historia 4 conservará uno más).
      await this.removeFile(saved.previous);
    }
    return saved.snapshot;
  }

  /** Borra el archivo de un cambio que no se guardó, salvo que sea el del fondo en uso. */
  private async discardUnused(sha256: string): Promise<void> {
    const [current] = await this.db
      .select({ sha256: lockScreenBackground.sha256 })
      .from(lockScreenBackground)
      .where(eq(lockScreenBackground.id, 1));
    if (current?.sha256 !== sha256) {
      await this.removeFile(sha256);
    }
  }

  /** Si no se puede borrar, solo ocupa disco: no debe romper la operación que lo pide. */
  private async removeFile(sha256: string): Promise<void> {
    await rm(join(this.dir, `${sha256}.webp`), { force: true }).catch((error: unknown) => {
      this.logger.warn(`No se pudo borrar el fondo ${sha256}: ${String(error)}`);
    });
  }
}
