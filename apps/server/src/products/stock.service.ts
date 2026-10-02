import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  newId,
  type Product,
  type StaffProfile,
  stockDelta,
  type StockMovement,
  type StockMoveRequest,
} from '@pope/shared';
import { desc, eq } from 'drizzle-orm';

import { staffActor } from '../auth/staff.controller.js';
import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { products, stockMovements } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { actorName } from '../sessions/session-state.js';
import { SettingsService } from '../settings/settings.service.js';
import { stockOf, toProduct } from './products.service.js';

/** Cuántos movimientos devuelve el detalle de un producto. */
const MOVEMENTS_SHOWN = 50;

/**
 * Movimientos de stock (REQ-005-10 a REQ-005-14): el encargado registra entradas de
 * mercancía; el administrador, además, ajustes y mermas, siempre con motivo. Las ventas
 * mueven el stock desde su propio servicio.
 */
@Injectable()
export class StockService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  /**
   * Registra un movimiento y emite `stock.moved`. Responde 403 si el encargado pide un ajuste
   * o una merma, y 409 si dejaría el stock en negativo sin que el administrador lo permita
   * (REQ-005-12).
   */
  async move(id: string, input: StockMoveRequest, member: StaffProfile): Promise<Product> {
    if (input.kind !== 'restock' && member.role !== 'administrador') {
      throw new ForbiddenException('Solo el administrador registra ajustes y mermas');
    }
    const actor = staffActor(member);
    const allowNegative = (await this.settings.get()).allowNegativeStock === 1;
    return this.events.inTransaction(async (tx, emit) => {
      // Bloquea el producto: dos movimientos a la vez no pueden leer el mismo stock.
      const [row] = await tx.select().from(products).where(eq(products.id, id)).for('update');
      if (!row) {
        throw new NotFoundException('No existe ese producto');
      }
      const quantity = stockDelta(input);
      const stock = (await stockOf(tx, id)) + quantity;
      if (stock < 0 && !allowNegative) {
        throw new ConflictException(`No hay tanto stock de ${row.name}`);
      }
      const reason = input.reason ?? null;
      await tx.insert(stockMovements).values({
        id: newId(),
        productId: id,
        kind: input.kind,
        quantity,
        reason,
        actor,
        createdAt: this.clock.now(),
      });
      const product = { id, name: row.name };
      emit({
        type: 'stock.moved',
        version: 1,
        actor,
        payload:
          input.kind === 'restock'
            ? { kind: 'restock', product, quantity, reason }
            : { kind: input.kind, product, quantity, reason: input.reason },
      });
      return toProduct(row, stock);
    });
  }

  /** Últimos movimientos de un producto, el más reciente arriba (detalle de Inventario). */
  async movements(id: string): Promise<StockMovement[]> {
    const [row] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, id));
    if (!row) {
      throw new NotFoundException('No existe ese producto');
    }
    const rows = await this.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, id))
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(MOVEMENTS_SHOWN);
    return rows.map((movement) => ({
      id: movement.id,
      productId: movement.productId,
      kind: movement.kind,
      quantity: movement.quantity,
      reason: movement.reason,
      saleId: movement.saleId,
      actorName: actorName(movement.actor),
      createdAt: movement.createdAt.toISOString(),
    }));
  }
}
