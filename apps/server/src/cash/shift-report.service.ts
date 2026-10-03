import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CashMovement,
  formatMoney,
  micros,
  type ShiftSummary,
  type VesRate,
  vesRate,
} from '@pope/shared';
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import {
  cashEntries,
  cashShifts,
  products,
  saleLines,
  sales,
  stockMovements,
} from '../db/schema.js';
import { actorName } from '../sessions/session-state.js';
import { SettingsService } from '../settings/settings.service.js';
import { ShiftsService } from '../shifts/shifts.service.js';
import { CashRegisterService } from './cash-register.service.js';

/** Cómo se movió el stock de un producto durante la caja (REQ-005-53). */
/** Un artículo vendido en la caja, como en el Z-Report de SENET (REQ-005-51). */
export interface SoldLine {
  name: string;
  /** Unidades vendidas, sin las ventas anuladas. */
  quantity: number;
  /** Lo que queda en almacén al cerrar; `null` en lo que no lleva stock. */
  inStock: number | null;
}

export interface StockLine {
  productId: string;
  name: string;
  initial: number;
  restocked: number;
  /** Vendido, ya descontadas las anulaciones. */
  sold: number;
  adjusted: number;
  wasted: number;
  final: number;
}

/** Todo lo que lleva el reporte de una caja. */
export interface ShiftReport {
  localName: string;
  summary: ShiftSummary;
  /** Quién la abrió y quién la cerró (ids, para los permisos, y nombre). */
  openedById: string;
  closedById: string | null;
  closedByName: string | null;
  /** La última tasa con que se cobró en Bs en esta caja, si se cobró en Bs. */
  rate: VesRate | null;
  /** Los movimientos en orden de hora, el más antiguo primero. */
  movements: CashMovement[];
  /** Lo vendido por artículo, por nombre (REQ-005-51). */
  sold: SoldLine[];
  stock: StockLine[];
  generatedAt: Date;
}

/**
 * Reúne los datos de los reportes del cierre (REQ-005-51 a REQ-005-53): los totales y el
 * cuadre de la caja, y para el detallado, sus movimientos y el stock de cada producto.
 */
@Injectable()
export class ShiftReportService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly shifts: ShiftsService,
    private readonly register: CashRegisterService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  /** El reporte de una caja, abierta o cerrada; 404 si no existe. */
  async report(id: string): Promise<ShiftReport> {
    const summary = await this.shifts.summary(id);
    const [row] = await this.db.select().from(cashShifts).where(eq(cashShifts.id, id));
    if (!summary || !row) {
      throw new NotFoundException('No existe esa caja');
    }
    const [{ localName }, list, [lastRate]] = await Promise.all([
      this.settings.get(),
      this.register.list(id),
      this.db
        .select({ rate: cashEntries.vesRate })
        .from(cashEntries)
        .where(and(eq(cashEntries.shiftId, id), isNotNull(cashEntries.vesRate)))
        .orderBy(desc(cashEntries.createdAt))
        .limit(1),
    ]);
    const now = this.clock.now();
    const stock = await this.stock(row.openedAt, row.closedAt ?? now);
    return {
      localName,
      summary,
      openedById: row.staffId,
      closedById: row.closedBy?.kind === 'staff' ? row.closedBy.staffId : null,
      closedByName: row.closedBy ? actorName(row.closedBy) : null,
      rate: lastRate?.rate ? vesRate(lastRate.rate) : null,
      movements: [...list.movements].reverse(),
      stock,
      sold: await this.sold(id, stock),
      generatedAt: now,
    };
  }

  /**
   * Stock de cada producto en la caja: el de la apertura, lo que entró, se vendió, se ajustó
   * o se perdió mientras estuvo abierta, y el del cierre. Solo los activos o los que se
   * movieron.
   */
  private async stock(from: Date, to: Date): Promise<StockLine[]> {
    const inRange = sql`${stockMovements.createdAt} >= ${from} and ${stockMovements.createdAt} <= ${to}`;
    const sum = (condition: ReturnType<typeof sql>) =>
      sql<number>`coalesce(sum(${stockMovements.quantity}) filter (where ${condition}), 0)`.mapWith(
        Number,
      );
    const rows = await this.db
      .select({
        productId: products.id,
        name: products.name,
        active: products.active,
        initial: sum(sql`${stockMovements.createdAt} < ${from}`),
        restocked: sum(sql`${stockMovements.kind} = 'restock' and ${inRange}`),
        sold: sum(sql`${stockMovements.kind} = 'sale' and ${inRange}`),
        adjusted: sum(sql`${stockMovements.kind} = 'adjustment' and ${inRange}`),
        wasted: sum(sql`${stockMovements.kind} = 'waste' and ${inRange}`),
        moved: sql<number>`count(${stockMovements.id}) filter (where ${inRange})`.mapWith(Number),
      })
      .from(products)
      .leftJoin(stockMovements, eq(stockMovements.productId, products.id))
      .groupBy(products.id)
      .orderBy(asc(sql`lower(${products.name})`));
    return rows
      .filter((row) => row.active || row.moved > 0)
      .map((row) => ({
        productId: row.productId,
        name: row.name,
        initial: row.initial,
        restocked: row.restocked,
        sold: -row.sold,
        adjusted: row.adjusted,
        wasted: -row.wasted,
        final: row.initial + row.restocked + row.sold + row.adjusted + row.wasted,
      }));
  }

  /**
   * Lo vendido por artículo en la caja (REQ-005-51), como el Z-Report de SENET: las
   * golosinas con las unidades vendidas, sin las ventas anuladas, y lo que queda en almacén.
   * Los otros ingresos van juntos en una línea con su importe y cuántos se cobraron.
   */
  private async sold(shiftId: string, stock: readonly StockLine[]): Promise<SoldLine[]> {
    const rows = await this.db
      .select({
        productId: saleLines.productId,
        // El nombre copiado en la venta; si cambió entre ventas, uno cualquiera de ellos.
        name: sql<string>`max(${saleLines.name})`,
        quantity: sql<number>`sum(${saleLines.quantity})`.mapWith(Number),
        totalMicros: sql<number>`sum(${saleLines.totalMicros})`.mapWith(Number),
      })
      .from(saleLines)
      .innerJoin(sales, eq(sales.id, saleLines.saleId))
      .where(and(eq(sales.shiftId, shiftId), isNull(sales.voidedAt)))
      .groupBy(saleLines.productId);
    const finalStock = new Map(stock.map((line) => [line.productId, line.final]));
    return rows
      .map((row) => ({
        // Los otros ingresos no tienen producto: se juntan en un grupo.
        name:
          row.productId === null
            ? `Otros ingresos · ${formatMoney(micros(row.totalMicros))}`
            : row.name,
        quantity: row.quantity,
        inStock: row.productId === null ? null : (finalStock.get(row.productId) ?? null),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
}
