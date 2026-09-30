import { Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  type Micros,
  micros,
  rateFor,
  type TariffTable,
  type TariffUpdateRequest,
  type Weekday,
} from '@pope/shared';
import { asc, inArray } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { tariffDays } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';

/** Tarifa semanal por día (REQ-001-10, REQ-001-15, REQ-001-16). */
@Injectable()
export class TariffsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly clock: Clock,
  ) {}

  /** La tabla de los 7 días, de lunes a domingo. */
  async table(db: Database = this.db): Promise<TariffTable> {
    const rows = await db.select().from(tariffDays).orderBy(asc(tariffDays.weekday));
    return rows.map((row) => ({
      weekday: row.weekday,
      rateMicrosPerHour: micros(row.rateMicrosPerHour),
    }));
  }

  /**
   * Tarifa de un instante: la del día en Caracas. Las sesiones la copian al empezar
   * (REQ-001-14, REQ-001-16).
   */
  async rateAt(instant: Date, db: Database = this.db): Promise<Micros> {
    return rateFor(await this.table(db), instant);
  }

  /**
   * Pone el mismo precio a los días indicados y emite `tariff.changed` con los días que
   * cambian, su precio anterior y el nuevo (REQ-001-15). Si ninguno cambia, no emite nada.
   * Se aplica a las sesiones que empiecen después (REQ-001-16).
   */
  async update(input: TariffUpdateRequest, actor: Actor): Promise<TariffTable> {
    return this.events.inTransaction(async (tx, emit) => {
      const rows = await tx
        .select()
        .from(tariffDays)
        .where(inArray(tariffDays.weekday, input.weekdays))
        .orderBy(asc(tariffDays.weekday))
        .for('update');
      const changed = rows.filter((row) => row.rateMicrosPerHour !== input.rateMicrosPerHour);
      if (changed.length > 0) {
        const weekdays: Weekday[] = changed.map((row) => row.weekday);
        await tx
          .update(tariffDays)
          .set({
            rateMicrosPerHour: input.rateMicrosPerHour,
            updatedAt: this.clock.now(),
            updatedBy: actor,
          })
          .where(inArray(tariffDays.weekday, weekdays));
        emit({
          type: 'tariff.changed',
          version: 1,
          actor,
          payload: {
            changes: changed.map((row) => ({
              weekday: row.weekday,
              from: { micros: micros(row.rateMicrosPerHour), currency: 'USD' as const },
              to: { micros: input.rateMicrosPerHour, currency: 'USD' as const },
            })),
          },
        });
      }
      return this.table(tx);
    });
  }
}
