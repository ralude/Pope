import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { type CashShift, newId, type StaffProfile } from '@pope/shared';
import { eq, isNull } from 'drizzle-orm';

import { staffActor } from '../auth/staff.controller.js';
import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { cashShifts } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';

/** Turno de caja para el panel. */
export function toCashShift(row: typeof cashShifts.$inferSelect): CashShift {
  return {
    id: row.id,
    staffId: row.staffId,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

/** Condición "caja abierta" (índice `cash_shifts_one_open_idx`). */
const isOpen = isNull(cashShifts.closedAt);

/**
 * Caja de turno **del local** (REQ-005-44): solo hay una abierta. Mientras lo está,
 * encargados y administradores cobran en ella, cada cobro con su actor (REQ-001-03,
 * REQ-001-60). La cierra quien la abrió o un administrador.
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

  /** Abre la caja y emite `shift.opened`. Responde 409 si ya hay una abierta en el local. */
  async open(member: StaffProfile): Promise<CashShift> {
    return this.events.inTransaction(async (tx, emit) => {
      const [current] = await tx.select({ id: cashShifts.id }).from(cashShifts).where(isOpen);
      if (current) {
        throw new ConflictException('Ya hay una caja abierta');
      }
      const [row] = await tx
        .insert(cashShifts)
        .values({ id: newId(), staffId: member.id, openedAt: this.clock.now() })
        .returning();
      if (!row) {
        throw new Error('No se pudo abrir la caja');
      }
      emit({
        type: 'shift.opened',
        version: 1,
        actor: staffActor(member),
        payload: { shiftId: row.id },
      });
      return toCashShift(row);
    });
  }

  /**
   * Cierra la caja abierta y emite `shift.closed`. Responde 409 si no hay ninguna y 403 si
   * quien cierra no la abrió ni es administrador.
   */
  async close(member: StaffProfile): Promise<CashShift> {
    return this.events.inTransaction(async (tx, emit) => {
      const [open] = await tx.select().from(cashShifts).where(isOpen).for('update');
      if (!open) {
        throw new ConflictException('No hay una caja abierta');
      }
      if (open.staffId !== member.id && member.role !== 'administrador') {
        throw new ForbiddenException('Solo quien abrió la caja o un administrador puede cerrarla');
      }
      const [row] = await tx
        .update(cashShifts)
        .set({ closedAt: this.clock.now() })
        .where(eq(cashShifts.id, open.id))
        .returning();
      if (!row) {
        throw new Error('No se pudo cerrar la caja');
      }
      emit({
        type: 'shift.closed',
        version: 1,
        actor: staffActor(member),
        payload: { shiftId: row.id },
      });
      return toCashShift(row);
    });
  }
}
