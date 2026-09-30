import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type Actor,
  DEFAULT_SETTINGS,
  type SettingKey,
  type Settings,
  settingsSchema,
  type SettingsUpdateRequest,
} from '@pope/shared';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { settings } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';

const KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

/**
 * Ajustes del nodo (REQ-001-27, REQ-001-64): los guarda la base de datos y los cambia el
 * administrador desde el panel, con un evento por cada ajuste que cambia.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger('Settings');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly clock: Clock,
  ) {}

  /** Todos los ajustes; los que nunca se cambiaron valen su valor por defecto. */
  async get(db: Database = this.db): Promise<Settings> {
    const stored = new Map((await db.select().from(settings)).map((row) => [row.key, row.value]));
    const current = { ...DEFAULT_SETTINGS };
    for (const key of KEYS) {
      if (!stored.has(key)) {
        continue;
      }
      const parsed = settingsSchema.shape[key].safeParse(stored.get(key));
      if (parsed.success) {
        current[key] = parsed.data;
      } else {
        // Un valor inválido (editado a mano en la base de datos) no debe tumbar el nodo.
        this.logger.warn(`El ajuste ${key} no es válido: se usa el valor por defecto`);
      }
    }
    return current;
  }

  /**
   * Cambia los ajustes indicados y emite `setting.changed` por cada uno cuyo valor cambia.
   * Devuelve todos los ajustes.
   */
  async update(input: SettingsUpdateRequest, actor: Actor): Promise<Settings> {
    return this.events.inTransaction(async (tx, emit) => {
      const before = await this.get(tx);
      for (const key of KEYS) {
        const to = input[key];
        if (to === undefined || to === before[key]) {
          continue;
        }
        const row = { key, value: to, updatedAt: this.clock.now(), updatedBy: actor };
        await tx
          .insert(settings)
          .values(row)
          .onConflictDoUpdate({ target: settings.key, set: row });
        emit({
          type: 'setting.changed',
          version: 1,
          actor,
          payload: { key, from: before[key], to },
        });
      }
      return this.get(tx);
    });
  }
}
