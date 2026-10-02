import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type Actor,
  type Combo,
  type ComboCreateRequest,
  comboDiscounts,
  comboRatePerHour,
  type ComboUpdateRequest,
  micros,
  newId,
  type PcCombo,
  seconds,
  type TariffTable,
} from '@pope/shared';
import { asc, desc, eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../db/database.js';
import { combos } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { TariffsService } from '../tariffs/tariffs.service.js';

type ComboRow = typeof combos.$inferSelect;

/** Combo para el personal, con el precio por hora y el descuento de cada día (REQ-001-80). */
export function toCombo(row: ComboRow, table: TariffTable): Combo {
  const ratePerHourMicros = comboRatePerHour(micros(row.priceMicros), row.seconds);
  return {
    id: row.id,
    name: row.name,
    priceMicros: micros(row.priceMicros),
    seconds: row.seconds,
    active: row.active,
    ratePerHourMicros,
    discounts: comboDiscounts(ratePerHourMicros, table),
  };
}

/** Datos del combo en los eventos `combo.created` y `combo.updated`. */
function eventData(row: Pick<ComboRow, 'name' | 'priceMicros' | 'seconds' | 'active'>) {
  return {
    name: row.name,
    price: { micros: micros(row.priceMicros), currency: 'USD' as const },
    seconds: seconds(row.seconds),
    active: row.active,
  };
}

/** Combos de horas (REQ-001-80, REQ-001-81): el administrador los crea y los edita. */
@Injectable()
export class CombosService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly tariffs: TariffsService,
  ) {}

  /** Todos los combos: primero los activos y, dentro, de menos a más tiempo. */
  async list(): Promise<Combo[]> {
    const [rows, table] = await Promise.all([
      this.db.select().from(combos).orderBy(desc(combos.active), asc(combos.seconds)),
      this.tariffs.table(),
    ]);
    return rows.map((row) => toCombo(row, table));
  }

  /**
   * Combos a la venta para el Shell (REQ-001-81, REQ-001-85): solo los activos, de menos a
   * más tiempo, con lo que necesita ver el cliente.
   */
  async forSale(): Promise<PcCombo[]> {
    const rows = await this.db
      .select()
      .from(combos)
      .where(eq(combos.active, true))
      .orderBy(asc(combos.seconds));
    return rows.map((row) => ({
      comboId: row.id,
      name: row.name,
      price: { micros: micros(row.priceMicros), currency: 'USD' },
      seconds: row.seconds,
    }));
  }

  /** Un combo; 404 si no existe. */
  async get(id: string): Promise<Combo> {
    const [row] = await this.db.select().from(combos).where(eq(combos.id, id));
    if (!row) {
      throw new NotFoundException('No existe ese combo');
    }
    return toCombo(row, await this.tariffs.table());
  }

  /** Crea un combo activo y emite `combo.created`. */
  async create(input: ComboCreateRequest, actor: Actor): Promise<Combo> {
    const row = await this.events.inTransaction(async (tx, emit) => {
      const [created] = await tx
        .insert(combos)
        .values({ id: newId(), ...input })
        .returning();
      if (!created) {
        throw new Error('No se pudo crear el combo');
      }
      emit({
        type: 'combo.created',
        version: 1,
        actor,
        payload: { comboId: created.id, combo: eventData(created) },
      });
      return created;
    });
    return toCombo(row, await this.tariffs.table());
  }

  /**
   * Edita o desactiva un combo y emite `combo.updated` con los valores anteriores y los
   * nuevos. Las horas ya vendidas no cambian (REQ-001-81). Sin cambios, no emite nada.
   */
  async update(id: string, input: ComboUpdateRequest, actor: Actor): Promise<Combo> {
    const row = await this.events.inTransaction(async (tx, emit) => {
      const [before] = await tx.select().from(combos).where(eq(combos.id, id)).for('update');
      if (!before) {
        throw new NotFoundException('No existe ese combo');
      }
      const after = { ...before, ...input };
      const changed = (['name', 'priceMicros', 'seconds', 'active'] as const).some(
        (field) => after[field] !== before[field],
      );
      if (!changed) {
        return before;
      }
      await tx.update(combos).set(input).where(eq(combos.id, id));
      emit({
        type: 'combo.updated',
        version: 1,
        actor,
        payload: { comboId: id, before: eventData(before), after: eventData(after) },
      });
      return after;
    });
    return toCombo(row, await this.tariffs.table());
  }
}
