import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  type CashByMethod,
  cashDifference,
  type CashShift,
  cashTotals,
  type CashTotals,
  expectedCash,
  methodCurrency,
  micros,
  newId,
  type OpeningCash,
  type PaymentMethod,
  type ShiftClosing,
  type ShiftSummary,
  type StaffProfile,
} from '@pope/shared';
import { desc, eq, inArray, isNull } from 'drizzle-orm';

import { staffActor } from '../auth/staff.controller.js';
import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { cashEntries, cashShifts, staff } from '../db/schema.js';
import { EventsService, type Transaction } from '../events/events.service.js';

type ShiftRow = typeof cashShifts.$inferSelect;

/** Turno de caja para el panel. */
export function toCashShift(row: ShiftRow): CashShift {
  return {
    id: row.id,
    staffId: row.staffId,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

function openingOf(row: ShiftRow): OpeningCash {
  return {
    cashUsdMicros: micros(row.openingCashUsdMicros),
    cashVesMicros: micros(row.openingCashVesMicros),
  };
}

/** Condición "caja abierta" (índice `cash_shifts_one_open_idx`). */
const isOpen = isNull(cashShifts.closedAt);

/**
 * Caja de turno **del local** (REQ-005-44): solo hay una abierta. Mientras lo está,
 * encargados y administradores cobran en ella, cada cobro con su actor (REQ-001-03,
 * REQ-001-60). Se abre con el fondo inicial y se cierra contando el dinero por método
 * (REQ-005-40, REQ-005-42). La cierra quien la abrió o un administrador.
 */
@Injectable()
export class ShiftsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly clock: Clock,
  ) {}

  /** La caja abierta del local, o `null` si no hay ninguna. */
  async findOpen(): Promise<CashShift | null> {
    const [row] = await this.db.select().from(cashShifts).where(isOpen);
    return row ? toCashShift(row) : null;
  }

  /**
   * Abre la caja con el fondo inicial (REQ-005-40) y emite `shift.opened`. Responde 409 si ya
   * hay una abierta en el local.
   */
  async open(member: StaffProfile, opening: OpeningCash): Promise<CashShift> {
    return this.events.inTransaction(async (tx, emit) => {
      const [current] = await tx.select({ id: cashShifts.id }).from(cashShifts).where(isOpen);
      if (current) {
        throw new ConflictException('Ya hay una caja abierta');
      }
      const [row] = await tx
        .insert(cashShifts)
        .values({
          id: newId(),
          staffId: member.id,
          openedAt: this.clock.now(),
          openingCashUsdMicros: opening.cashUsdMicros,
          openingCashVesMicros: opening.cashVesMicros,
        })
        .returning();
      if (!row) {
        throw new Error('No se pudo abrir la caja');
      }
      emit({
        type: 'shift.opened',
        version: 2,
        actor: staffActor(member),
        payload: {
          shiftId: row.id,
          openingCash: {
            usd: { micros: opening.cashUsdMicros, currency: 'USD' },
            ves: { micros: opening.cashVesMicros, currency: 'VES' },
          },
        },
      });
      return toCashShift(row);
    });
  }

  /** Lo que hace falta para cerrar la caja abierta: lo esperado por método (REQ-005-42). */
  async closing(): Promise<ShiftClosing> {
    const [row] = await this.db.select().from(cashShifts).where(isOpen);
    if (!row) {
      throw new ConflictException('No hay una caja abierta');
    }
    const { expected, totals } = await this.expectedOf(this.db, row);
    return {
      shiftId: row.id,
      openedAt: row.openedAt.toISOString(),
      opening: openingOf(row),
      expected,
      totals,
    };
  }

  /**
   * Cierra la caja con lo contado en cada método, guarda lo esperado y emite `shift.closed`
   * con la diferencia (REQ-005-42, CA-005-03). Responde 409 si no hay caja abierta y 403 si
   * quien cierra no la abrió ni es administrador.
   */
  async close(member: StaffProfile, counted: CashByMethod): Promise<ShiftSummary> {
    const id = await this.events.inTransaction(async (tx, emit) => {
      const [open] = await tx.select().from(cashShifts).where(isOpen).for('update');
      if (!open) {
        throw new ConflictException('No hay una caja abierta');
      }
      if (open.staffId !== member.id && member.role !== 'administrador') {
        throw new ForbiddenException('Solo quien abrió la caja o un administrador puede cerrarla');
      }
      const { expected } = await this.expectedOf(tx, open);
      const difference = cashDifference(expected, counted);
      const actor = staffActor(member);
      await tx
        .update(cashShifts)
        .set({ closedAt: this.clock.now(), expected, counted, closedBy: actor })
        .where(eq(cashShifts.id, open.id));
      const line = (method: PaymentMethod) => ({
        currency: methodCurrency(method),
        expected: expected[method],
        counted: counted[method],
        difference: difference[method],
      });
      const methods = {
        cash_usd: line('cash_usd'),
        cash_ves: line('cash_ves'),
        mobile_payment: line('mobile_payment'),
        pos: line('pos'),
      };
      emit({
        type: 'shift.closed',
        version: 2,
        actor,
        payload: { shiftId: open.id, methods },
      });
      return open.id;
    });
    const [summary] = await this.summaries(eq(cashShifts.id, id));
    if (!summary) {
      throw new Error('No se pudo leer la caja cerrada');
    }
    return summary;
  }

  /** Historial de cajas, la más reciente arriba (REQ-005-53). */
  history(): Promise<ShiftSummary[]> {
    return this.summaries();
  }

  /** Una caja con sus totales, lo esperado, lo contado y la diferencia. */
  async summary(id: string): Promise<ShiftSummary | null> {
    const [summary] = await this.summaries(eq(cashShifts.id, id));
    return summary ?? null;
  }

  private async summaries(where?: ReturnType<typeof eq>): Promise<ShiftSummary[]> {
    const rows = await this.db
      .select({ shift: cashShifts, staffName: staff.displayName })
      .from(cashShifts)
      .innerJoin(staff, eq(staff.id, cashShifts.staffId))
      .where(where)
      .orderBy(desc(cashShifts.openedAt));
    const ids = rows.map((row) => row.shift.id);
    if (ids.length === 0) {
      return [];
    }
    const entries = await this.db
      .select({
        shiftId: cashEntries.shiftId,
        group: cashEntries.group,
        method: cashEntries.method,
        usdMicros: cashEntries.usdMicros,
      })
      .from(cashEntries)
      .where(inArray(cashEntries.shiftId, ids));
    const byShift = new Map<string, typeof entries>();
    for (const entry of entries) {
      byShift.set(entry.shiftId, [...(byShift.get(entry.shiftId) ?? []), entry]);
    }
    return rows.map(({ shift, staffName }) => {
      const totals: CashTotals = cashTotals(
        (byShift.get(shift.id) ?? []).map((e) => ({ ...e, usdMicros: micros(e.usdMicros) })),
      );
      return {
        id: shift.id,
        staffName,
        openedAt: shift.openedAt.toISOString(),
        closedAt: shift.closedAt?.toISOString() ?? null,
        opening: openingOf(shift),
        totals,
        expected: shift.expected,
        counted: shift.counted,
        difference:
          shift.expected && shift.counted ? cashDifference(shift.expected, shift.counted) : null,
      };
    });
  }

  /** Lo esperado por método y los totales de una caja, a partir de su registro. */
  private async expectedOf(
    db: Database | Transaction,
    shift: ShiftRow,
  ): Promise<{ expected: CashByMethod; totals: CashTotals }> {
    const rows = await db.select().from(cashEntries).where(eq(cashEntries.shiftId, shift.id));
    const entries = rows.map((row) => ({
      group: row.group,
      method: row.method,
      currency: row.currency,
      amountMicros: micros(row.amountMicros),
      usdMicros: micros(row.usdMicros),
    }));
    return { expected: expectedCash(openingOf(shift), entries), totals: cashTotals(entries) };
  }
}
