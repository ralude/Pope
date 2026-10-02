import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  type Actor,
  currentRate,
  type ExchangeRate,
  type ExchangeRateStatus,
  isRateStale,
  localDateInCaracas,
  newId,
  type VesRate,
  vesRate,
} from '@pope/shared';
import { desc } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { exchangeRates } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';

type RateRow = typeof exchangeRates.$inferSelect;

/**
 * Tasas que se guardan en memoria: las últimas. Cambian pocas veces al día y la vigente
 * siempre está entre ellas, así el nodo no consulta la base de datos en cada latido.
 */
const CACHED_RATES = 20;

function toRate(row: RateRow): ExchangeRate {
  return {
    vesPerUsd: vesRate(row.vesPerUsd),
    effectiveDate: row.effectiveDate,
    source: row.source,
    obtainedAt: row.obtainedAt.toISOString(),
    setBy: row.actor.kind === 'staff' ? row.actor.name : null,
  };
}

/**
 * Tasa de cambio USD → VES (spec 005, parte 1). Guarda la historia de tasas y responde cuál
 * es la vigente (REQ-005-33). En esta parte solo hay tasas manuales (REQ-005-34).
 */
@Injectable()
export class ExchangeRatesService implements OnModuleInit {
  private readonly logger = new Logger('ExchangeRates');
  private recent: ExchangeRate[] = [];
  private readonly listeners = new Set<() => Promise<void>>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly clock: Clock,
  ) {}

  async onModuleInit(): Promise<void> {
    const rows = await this.db
      .select()
      .from(exchangeRates)
      .orderBy(desc(exchangeRates.obtainedAt))
      .limit(CACHED_RATES);
    this.recent = rows.map(toRate);
  }

  /**
   * Avisa cuando se guarda una tasa nueva, para repartirla a las PCs y al panel
   * (REQ-005-36). Devuelve la función que deja de avisar.
   */
  subscribe(listener: () => Promise<void>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** La tasa vigente ahora, o `null` si aún no hay ninguna. */
  current(): ExchangeRate | null {
    return currentRate(this.recent, this.clock.now());
  }

  /** La tasa vigente y si está desactualizada (REQ-005-35). */
  status(): ExchangeRateStatus {
    const rate = this.current();
    return { rate, stale: rate !== null && isRateStale(rate, this.clock.now()) };
  }

  /**
   * Guarda una tasa escrita a mano en el panel (REQ-005-34): vale desde ahora, con la fecha
   * valor de hoy en Caracas, y emite `exchange_rate.set`. Devuelve el estado nuevo.
   */
  async setManual(vesPerUsd: VesRate, actor: Actor): Promise<ExchangeRateStatus> {
    const now = this.clock.now();
    const row = await this.events.inTransaction(async (tx, emit) => {
      const [inserted] = await tx
        .insert(exchangeRates)
        .values({
          id: newId(),
          vesPerUsd,
          effectiveDate: localDateInCaracas(now),
          source: 'manual',
          obtainedAt: now,
          actor,
        })
        .returning();
      if (!inserted) {
        throw new Error('No se pudo guardar la tasa');
      }
      emit({
        type: 'exchange_rate.set',
        version: 1,
        actor,
        payload: {
          vesPerUsd,
          effectiveDate: inserted.effectiveDate,
          source: 'manual',
        },
      });
      return inserted;
    });
    // Solo tras confirmar la transacción: si fallara, la memoria no cambia.
    this.recent = [toRate(row), ...this.recent].slice(0, CACHED_RATES);
    await this.notify();
    return this.status();
  }

  /** Avisa a los interesados; un fallo de uno no impide guardar la tasa ni avisar a los demás. */
  private async notify(): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener();
      } catch (error) {
        this.logger.error('No se pudo repartir la tasa nueva', error);
      }
    }
  }
}
