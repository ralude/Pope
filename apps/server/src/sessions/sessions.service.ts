import { Inject, Injectable } from '@nestjs/common';
import {
  type Customer,
  type CustomerBalances,
  newId,
  type NodeToPcMessage,
  secondsUntilExhausted,
  startUsage,
} from '@pope/shared';
import { and, eq } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { customers, pcs, sessions } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { TariffsService } from '../tariffs/tariffs.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import type { PcIdentity } from './pc-connections.js';
import {
  accountBalances,
  activeState,
  LOCKED_STATE,
  PcRequestRefused,
  type SessionRow,
} from './session-state.js';

/** Saldo mínimo para abrir una sesión: el de 1 minuto (REQ-001-20). */
export const MIN_SESSION_SECONDS = 60;

/**
 * Sesiones de uso de las PCs (plan 001). El nodo es la fuente de verdad del tiempo y del
 * saldo; la PC solo muestra el `state` que le envía (ADR-0007).
 */
@Injectable()
export class SessionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly wallet: WalletService,
    private readonly tariffs: TariffsService,
    private readonly clock: Clock,
  ) {}

  /** Sesión activa de una PC, si tiene. */
  async activeOnPc(pcId: string, db: Database = this.db): Promise<SessionRow | undefined> {
    const [row] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.pcId, pcId), eq(sessions.status, 'active')));
    return row;
  }

  /** `state` que debe mostrar la PC ahora: bloqueada o con su sesión. */
  async stateFor(pcId: string, db: Database = this.db): Promise<NodeToPcMessage> {
    const row = await this.activeOnPc(pcId, db);
    if (!row) {
      return LOCKED_STATE;
    }
    return activeState(row, await this.accountOf(row, db));
  }

  /**
   * Abre una sesión con cuenta en la PC (REQ-001-20): la cuenta no puede tener otra sesión
   * activa (REQ-001-21) y necesita saldo para al menos 1 minuto. La sesión copia la tarifa
   * del día (REQ-001-14, REQ-001-16). Emite `session.started` con el cliente como actor.
   * Lanza `PcRequestRefused` si no se puede abrir.
   */
  async startAccountSession(pc: PcIdentity, customer: Customer): Promise<NodeToPcMessage> {
    return this.events.inTransaction(async (tx, emit) => {
      // Bloquea la PC y la cuenta: un login simultáneo en otra PC, o una sesión temporal
      // abierta a la vez en esta, esperan a que termine.
      await tx.select({ id: pcs.id }).from(pcs).where(eq(pcs.id, pc.id)).for('update');
      await tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, customer.id))
        .for('update');
      if (await this.activeOnPc(pc.id, tx)) {
        throw new PcRequestRefused('session_already_active', 'Esta PC ya tiene una sesión abierta');
      }
      const [other] = await tx
        .select({ pcName: pcs.name })
        .from(sessions)
        .innerJoin(pcs, eq(pcs.id, sessions.pcId))
        .where(and(eq(sessions.customerId, customer.id), eq(sessions.status, 'active')));
      if (other) {
        throw new PcRequestRefused(
          'session_already_active',
          `Ya tienes una sesión abierta en la ${other.pcName}`,
        );
      }

      const now = this.clock.now();
      const rate = await this.tariffs.rateAt(now, tx);
      const balances = await this.wallet.balances(customer.id, tx);
      if (
        secondsUntilExhausted(startUsage(rate), accountBalances(balances)) < MIN_SESSION_SECONDS
      ) {
        throw new PcRequestRefused(
          'insufficient_balance',
          'No tienes saldo para 1 minuto. Recarga en el mostrador',
        );
      }

      const actor = {
        kind: 'customer' as const,
        customerId: customer.id,
        username: customer.username,
      };
      const [row] = await tx
        .insert(sessions)
        .values({
          id: newId(),
          pcId: pc.id,
          kind: 'account',
          customerId: customer.id,
          rateMicrosPerHour: rate,
          startedAt: now,
          lastHeartbeatAt: now,
          openedBy: actor,
        })
        .returning();
      if (!row) {
        throw new Error('No se pudo abrir la sesión');
      }
      emit({
        type: 'session.started',
        version: 1,
        actor,
        payload: {
          kind: 'account',
          sessionId: row.id,
          pc: { id: pc.id, name: pc.name },
          customer: { id: customer.id, username: customer.username },
          rate: { micros: rate, currency: 'USD' },
        },
      });
      return activeState(row, { username: customer.username, balances });
    });
  }

  /** Usuario y saldos del cliente de una sesión con cuenta; `null` si es temporal. */
  private async accountOf(
    row: SessionRow,
    db: Database,
  ): Promise<{ username: string; balances: CustomerBalances } | null> {
    if (row.kind !== 'account' || !row.customerId) {
      return null;
    }
    const [customer] = await db
      .select({ username: customers.username })
      .from(customers)
      .where(eq(customers.id, row.customerId));
    return {
      username: customer?.username ?? '',
      balances: await this.wallet.balances(row.customerId, db),
    };
  }
}
