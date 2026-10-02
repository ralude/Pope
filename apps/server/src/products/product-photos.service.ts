import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { type Actor, type Product } from '@pope/shared';
import { eq } from 'drizzle-orm';

import { APP_CONFIG, type AppConfig } from '../config.js';
import { DATABASE, type Database } from '../db/database.js';
import { products } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { stockOf, toProduct } from './products.service.js';

/** ¿Es un WebP? Cabecera RIFF con la marca `WEBP` (no basta con lo que diga el navegador). */
export function isWebp(body: Buffer): boolean {
  return (
    body.length >= 12 &&
    body.toString('ascii', 0, 4) === 'RIFF' &&
    body.toString('ascii', 8, 12) === 'WEBP'
  );
}

/**
 * Fotos de los productos (REQ-005-03, REQ-005-73): el nodo las guarda en su carpeta de datos
 * y las sirve al panel sin internet. El nombre del archivo lo pone el nodo: el id del
 * producto y un resumen del contenido, que hace de versión para la caché del navegador.
 */
@Injectable()
export class ProductPhotosService {
  private readonly logger = new Logger('ProductPhotos');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private get dir(): string {
    return join(this.config.dataDir, 'products');
  }

  /** Guarda la foto nueva de un producto y emite `product.photo_set`. Borra la anterior. */
  async set(id: string, body: Buffer, actor: Actor): Promise<Product> {
    if (!isWebp(body)) {
      throw new UnsupportedMediaTypeException('La foto debe ser una imagen WebP');
    }
    const [existing] = await this.db.select().from(products).where(eq(products.id, id));
    if (!existing) {
      throw new NotFoundException('No existe ese producto');
    }
    const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
    const file = `${id}-${hash}.webp`;
    await mkdir(this.dir, { recursive: true });
    // Se escribe aparte y se renombra: nunca se sirve una foto a medio escribir.
    const temporary = join(this.dir, `${file}.tmp`);
    await writeFile(temporary, body);
    await rename(temporary, join(this.dir, file));

    const { product, previous } = await this.events.inTransaction(async (tx, emit) => {
      const [row] = await tx.select().from(products).where(eq(products.id, id)).for('update');
      if (!row) {
        throw new NotFoundException('No existe ese producto');
      }
      if (row.photo !== file) {
        await tx.update(products).set({ photo: file }).where(eq(products.id, id));
        emit({
          type: 'product.photo_set',
          version: 1,
          actor,
          payload: { product: { id, name: row.name }, photo: file },
        });
      }
      return {
        product: toProduct({ ...row, photo: file }, await stockOf(tx, id)),
        previous: row.photo,
      };
    });

    if (previous !== null && previous !== file) {
      // La foto vieja ya no la usa nadie; si no se puede borrar, solo ocupa disco.
      await rm(join(this.dir, previous), { force: true }).catch((error: unknown) => {
        this.logger.warn(`No se pudo borrar la foto anterior ${previous}: ${String(error)}`);
      });
    }
    return product;
  }

  /** El contenido de la foto de un producto; 404 si no existe o no tiene. */
  async read(id: string): Promise<Buffer> {
    const [row] = await this.db
      .select({ photo: products.photo })
      .from(products)
      .where(eq(products.id, id));
    if (!row?.photo) {
      throw new NotFoundException('Ese producto no tiene foto');
    }
    try {
      return await readFile(join(this.dir, row.photo));
    } catch {
      throw new NotFoundException('No se encuentra la foto del producto');
    }
  }
}
