import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { type CashShift, newId, type StaffProfile } from '@pope/shared';
import { and, eq, isNull } from 'drizzle-orm';

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

/** Condición "turno abierto de este miembro del personal" (índice `cash_shifts_open_staff_idx`). */
function openShiftOf(staffId: string) {
  return and(eq(cashShifts.staffId, staffId), isNull(cashShifts.closedAt));
}

/**
 * Turno de caja mínimo (T17): cada miembro del personal abre y cierra el suyo. Las
 * recargas y los cobros en caja lo exigen (REQ-001-03, REQ-001-60).
 */
@Injectable()
export class ShiftsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly clock: Clock,
  ) {}

  /** El turno abierto de este miembro del personal, o `null` si no tiene. */
  async findOpen(staffId: string): Promise<CashShift | null> {
    const [row] = await this.db.select().from(cashShifts).where(openShiftOf(staffId));
    return row ? toCashShift(row) : null;
  }

  /** Abre un turno y emite `shift.opened`. Responde 409 si ya tiene uno abierto. */
  async open(member: StaffProfile): Promise<CashShift> {
    return this.events.inTransaction(async (tx, emit) => {
      const [current] = await tx
        .select({ id: cashShifts.id })
        .from(cashShifts)
        .where(openShiftOf(member.id));
      if (current) {
        throw new ConflictException('Ya tienes un turno de caja abierto');
      }
      const [row] = await tx
        .insert(cashShifts)
        .values({ id: newId(), staffId: member.id, openedAt: this.clock.now() })
        .returning();
      if (!row) {
        throw new Error('No se pudo abrir el turno');
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

  /** Cierra el turno abierto y emite `shift.closed`. Responde 409 si no tiene ninguno. */
  async close(member: StaffProfile): Promise<CashShift> {
    return this.events.inTransaction(async (tx, emit) => {
      const [row] = await tx
        .update(cashShifts)
        .set({ closedAt: this.clock.now() })
        .where(openShiftOf(member.id))
        .returning();
      if (!row) {
        throw new ConflictException('No tienes un turno de caja abierto');
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
