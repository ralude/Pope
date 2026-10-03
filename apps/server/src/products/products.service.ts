import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type Actor,
  isLowStock,
  micros,
  newId,
  type Product,
  type ProductCreateRequest,
  type ProductUpdateRequest,
} from '@pope/shared';
import { asc, desc, eq, sql } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { products, stockMovements } from '../db/schema.js';
import { EventsService, type Transaction } from '../events/events.service.js';

type ProductRow = typeof products.$inferSelect;

/** La versión de la foto es la parte del nombre del archivo tras el id del producto. */
export function photoVersion(row: Pick<ProductRow, 'id' | 'photo'>): string | null {
  if (row.photo === null) {
    return null;
  }
  return row.photo.slice(row.id.length + 1).replace(/\.webp$/, '');
}

/** Producto para el personal, con su stock calculado (REQ-005-11, REQ-005-13). */
export function toProduct(row: ProductRow, stock: number): Product {
  return {
    id: row.id,
    name: row.name,
    priceMicros: micros(row.priceMicros),
    minStock: row.minStock,
    active: row.active,
    photoVersion: photoVersion(row),
    stock,
    lowStock: isLowStock(stock, row.minStock),
  };
}

/** Datos del producto en los eventos `product.created` y `product.updated`. */
function eventData(row: Pick<ProductRow, 'name' | 'priceMicros' | 'minStock' | 'active'>) {
  return {
    name: row.name,
    price: { micros: micros(row.priceMicros), currency: 'USD' as const },
    minStock: row.minStock,
    active: row.active,
  };
}

/** Stock de un producto: la suma de sus movimientos (REQ-005-11). */
export async function stockOf(db: Database | Transaction, productId: string): Promise<number> {
  const [row] = await db
    .select({ stock: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`.mapWith(Number) })
    .from(stockMovements)
    .where(eq(stockMovements.productId, productId));
  return row?.stock ?? 0;
}

/**
 * Productos del inventario (spec 005, REQ-005-01 a REQ-005-04): el administrador los da de
 * alta y los edita; todo el personal los ve con su stock.
 */
@Injectable()
export class ProductsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly clock: Clock,
  ) {}

  /** Todos los productos con su stock: primero los activos y, dentro, por nombre. */
  async list(): Promise<Product[]> {
    const stock = this.db
      .select({
        productId: stockMovements.productId,
        stock: sql<number>`sum(${stockMovements.quantity})`.mapWith(Number).as('stock'),
      })
      .from(stockMovements)
      .groupBy(stockMovements.productId)
      .as('stock');
    const rows = await this.db
      .select({
        product: products,
        stock: sql<number>`coalesce(${stock.stock}, 0)`.mapWith(Number),
      })
      .from(products)
      .leftJoin(stock, eq(stock.productId, products.id))
      .orderBy(desc(products.active), asc(sql`lower(${products.name})`));
    return rows.map((row) => toProduct(row.product, row.stock));
  }

  /** Un producto con su stock; 404 si no existe. */
  async get(id: string, db: Database | Transaction = this.db): Promise<Product> {
    const [row] = await db.select().from(products).where(eq(products.id, id));
    if (!row) {
      throw new NotFoundException('No existe ese producto');
    }
    return toProduct(row, await stockOf(db, id));
  }

  /**
   * Da de alta un producto (activo, salvo que se pida lo contrario) y emite `product.created`.
   * Lo que llegó se guarda como su primera entrada, con su `stock.moved` (REQ-005-10).
   */
  async create(input: ProductCreateRequest, actor: Actor): Promise<Product> {
    return this.events.inTransaction(async (tx, emit) => {
      const now = this.clock.now();
      const [created] = await tx
        .insert(products)
        .values({
          id: newId(),
          name: input.name,
          priceMicros: input.priceMicros,
          minStock: input.minStock,
          active: input.active,
          createdAt: now,
        })
        .returning();
      if (!created) {
        throw new Error('No se pudo crear el producto');
      }
      emit({
        type: 'product.created',
        version: 1,
        actor,
        payload: { productId: created.id, product: eventData(created) },
      });
      if (input.initialQuantity > 0) {
        await tx.insert(stockMovements).values({
          id: newId(),
          productId: created.id,
          kind: 'restock',
          quantity: input.initialQuantity,
          actor,
          createdAt: now,
        });
        emit({
          type: 'stock.moved',
          version: 1,
          actor,
          payload: {
            kind: 'restock',
            product: { id: created.id, name: created.name },
            quantity: input.initialQuantity,
            reason: null,
          },
        });
      }
      return toProduct(created, input.initialQuantity);
    });
  }

  /**
   * Edita o desactiva un producto y emite `product.updated` con los valores anteriores y los
   * nuevos, incluido el precio (REQ-005-02). Sin cambios, no emite nada.
   */
  async update(id: string, input: ProductUpdateRequest, actor: Actor): Promise<Product> {
    return this.events.inTransaction(async (tx, emit) => {
      const [before] = await tx.select().from(products).where(eq(products.id, id)).for('update');
      if (!before) {
        throw new NotFoundException('No existe ese producto');
      }
      const after = { ...before, ...input };
      const changed = (['name', 'priceMicros', 'minStock', 'active'] as const).some(
        (field) => after[field] !== before[field],
      );
      if (changed) {
        await tx.update(products).set(input).where(eq(products.id, id));
        emit({
          type: 'product.updated',
          version: 1,
          actor,
          payload: { productId: id, before: eventData(before), after: eventData(after) },
        });
      }
      return toProduct(after, await stockOf(tx, id));
    });
  }
}
