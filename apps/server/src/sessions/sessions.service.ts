import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type Actor,
  applyCheckpoint,
  applyTemporaryCheckpoint,
  type Customer,
  type CustomerBalances,
  newId,
  type NodeToPcMessage,
  seconds,
  secondsUntilExhausted,
  type SessionEndReason,
  startUsage,
  temporaryRemaining,
} from '@pope/shared';
import { and, eq } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { customers, pcs, sessions } from '../db/schema.js';
import { type Emit, EventsService, type Transaction } from '../events/events.service.js';
import { TariffsService } from '../tariffs/tariffs.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { PcConnections, type PcIdentity } from './pc-connections.js';
import {
  accountBalances,
  activeState,
  LOCKED_STATE,
  PcRequestRefused,
  type SessionRow,
  temporaryUsageOf,
  usageOf,
} from './session-state.js';

/** Saldo mínimo para abrir una sesión: el de 1 minuto (REQ-001-20). */
export const MIN_SESSION_SECONDS = 60;

/**
 * Sesiones de uso de las PCs (plan 001). El nodo es la fuente de verdad del tiempo y del
 * saldo; la PC solo muestra el `state` que le envía (ADR-0007).
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger('Sessions');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly wallet: WalletService,
    private readonly tariffs: TariffsService,
    private readonly connections: PcConnections,
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

  /**
   * El encargado cierra una sesión desde el panel (REQ-001-26). Responde 404 si no existe y
   * 409 si ya estaba cerrada (por ejemplo, la cerró el cliente un instante antes).
   */
  async closeByStaff(sessionId: string, actor: Actor): Promise<void> {
    if (await this.close(sessionId, 'staff', actor)) {
      return;
    }
    const [existing] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, sessionId));
    if (!existing) {
      throw new NotFoundException('No existe esa sesión');
    }
    throw new ConflictException('La sesión ya está cerrada');
  }

  /**
   * El cliente cierra su sesión desde el Shell (REQ-001-26). Devuelve `false` si la PC no
   * tenía sesión activa: entonces quien llama debe corregir lo que muestra la PC.
   */
  async logout(pcId: string): Promise<boolean> {
    const [found] = await this.db
      .select({ id: sessions.id, customerId: sessions.customerId, username: customers.username })
      .from(sessions)
      .leftJoin(customers, eq(customers.id, sessions.customerId))
      .where(and(eq(sessions.pcId, pcId), eq(sessions.status, 'active')));
    if (!found) {
      return false;
    }
    // Una sesión temporal no tiene cliente: el cierre lo hace el sistema a petición de la PC.
    const actor: Actor =
      found.customerId && found.username
        ? { kind: 'customer', customerId: found.customerId, username: found.username }
        : { kind: 'system' };
    return (await this.close(found.id, 'customer', actor)) !== null;
  }

  /**
   * Cierra la sesión y liquida su consumo (REQ-001-26, REQ-001-31): escribe en el ledger lo
   * gastado (hasta dos filas, combo y dinero), guarda el cierre con su motivo y emite
   * `session.ended`. Por defecto cobra antes hasta ahora; un cierre por falta de latidos
   * pasa `billToNow: false` para cobrar solo hasta el último latido (REQ-001-27). Avisa a la
   * PC con `sessionEnded`. Devuelve la sesión cerrada, o `null` si ya no estaba activa.
   */
  async close(
    sessionId: string,
    reason: SessionEndReason,
    actor: Actor,
    options: { billToNow?: boolean } = {},
  ): Promise<SessionRow | null> {
    const billToNow = options.billToNow ?? true;
    const ended = await this.events.inTransaction(async (tx, emit) => {
      const [locked] = await tx
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .for('update');
      if (locked?.status !== 'active') {
        return null;
      }
      if (locked.customerId) {
        // Bloquea también la cuenta: una compra o una recarga a la vez esperan al cierre.
        await tx
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.id, locked.customerId))
          .for('update');
      }
      const { row } = billToNow ? await this.checkpoint(locked, tx) : { row: locked };
      await this.settle(row, actor, tx);
      const [closed] = await tx
        .update(sessions)
        .set({ status: 'ended', endedAt: this.clock.now(), endReason: reason })
        .where(eq(sessions.id, row.id))
        .returning();
      if (!closed) {
        throw new Error('No se pudo cerrar la sesión');
      }
      await this.emitEnded(closed, reason, actor, tx, emit);
      return closed;
    });
    if (ended) {
      this.connections.send(ended.pcId, {
        type: 'sessionEnded',
        sessionId: ended.id,
        reason,
      });
    }
    return ended;
  }

  /**
   * Escribe en el ledger lo consumido por una sesión con cuenta: una fila por monedero con
   * consumo (REQ-001-89). Si el saldo de la cuenta bajó durante la sesión (un ajuste), solo
   * se descuenta lo que había: el sistema es prepago y el saldo nunca queda negativo.
   */
  private async settle(row: SessionRow, actor: Actor, tx: Transaction): Promise<void> {
    if (!row.customerId) {
      return;
    }
    const balances = await this.wallet.balances(row.customerId, tx);
    const combo = Math.min(row.comboSecondsUsed, balances.comboSeconds);
    const money = Math.min(row.moneyChargedMicros, balances.moneyMicros);
    if (combo < row.comboSecondsUsed || money < row.moneyChargedMicros) {
      this.logger.warn(
        `La cuenta no tenía saldo para liquidar la sesión ${row.id}: se cobra lo que había`,
      );
    }
    if (combo > 0) {
      await this.wallet.post(tx, {
        customerId: row.customerId,
        wallet: 'combo',
        amount: -combo,
        kind: 'consumption',
        actor,
        sessionId: row.id,
      });
    }
    if (money > 0) {
      await this.wallet.post(tx, {
        customerId: row.customerId,
        wallet: 'money',
        amount: -money,
        kind: 'consumption',
        actor,
        sessionId: row.id,
      });
    }
  }

  /** `session.ended` con lo consumido y hasta cuándo se cobró (REQ-001-31). */
  private async emitEnded(
    row: SessionRow,
    reason: SessionEndReason,
    actor: Actor,
    tx: Database,
    emit: Emit,
  ): Promise<void> {
    const [pc] = await tx.select({ name: pcs.name }).from(pcs).where(eq(pcs.id, row.pcId));
    const temporary = temporaryUsageOf(row);
    const account = usageOf(row);
    emit({
      type: 'session.ended',
      version: 1,
      actor,
      payload: {
        sessionId: row.id,
        pc: { id: row.pcId, name: pc?.name ?? '' },
        reason,
        billedUntil: row.lastHeartbeatAt.toISOString(),
        usage:
          row.kind === 'account'
            ? {
                kind: 'account',
                comboSecondsUsed: account.comboSecondsUsed,
                moneySeconds: account.moneySeconds,
                moneyCharged: { micros: account.moneyChargedMicros, currency: 'USD' },
              }
            : {
                kind: 'temporary',
                purchasedSeconds: temporary.purchasedSeconds,
                usedSeconds: temporary.usedSeconds,
                remainingSeconds: temporaryRemaining(temporary),
              },
      },
    });
  }

  /**
   * Latido de la PC: cobra la sesión activa hasta ahora con el reloj del nodo (REQ-001-23,
   * ADR-0007), guarda el consumo en su fila (REQ-001-63) y devuelve el `state` para que el
   * Shell actualice tiempo y saldo (REQ-001-12). Sin sesión activa, devuelve la pantalla
   * de bloqueo.
   */
  async heartbeat(pcId: string): Promise<NodeToPcMessage> {
    return this.events.inTransaction(async (tx) => {
      // Bloquea la fila: un cierre o un latido simultáneos esperan a que termine este.
      const [locked] = await tx
        .select()
        .from(sessions)
        .where(and(eq(sessions.pcId, pcId), eq(sessions.status, 'active')))
        .for('update');
      if (!locked) {
        return LOCKED_STATE;
      }
      const { row, account } = await this.checkpoint(locked, tx);
      return activeState(row, account);
    });
  }

  /**
   * Cobra la sesión hasta el instante actual y guarda el resultado. Avanza `lastHeartbeatAt`
   * exactamente los segundos enteros cobrados, no hasta "ahora": así la fracción de segundo
   * se cobra en el siguiente latido y no se pierde (motor de cobro, `applyCheckpoint`).
   * Si el reloj se corrigió hacia atrás no se cobra nada y la marca no se mueve.
   */
  private async checkpoint(
    row: SessionRow,
    tx: Database,
  ): Promise<{
    row: SessionRow;
    account: { username: string; balances: CustomerBalances } | null;
  }> {
    const elapsed = seconds(
      Math.max(0, Math.floor((this.clock.now().getTime() - row.lastHeartbeatAt.getTime()) / 1000)),
    );
    const lastHeartbeatAt = new Date(row.lastHeartbeatAt.getTime() + elapsed * 1000);

    const account = await this.accountOf(row, tx);
    if (account) {
      const { usage } = applyCheckpoint(usageOf(row), accountBalances(account.balances), elapsed);
      const [updated] = await tx
        .update(sessions)
        .set({
          comboSecondsUsed: usage.comboSecondsUsed,
          moneySeconds: usage.moneySeconds,
          moneyChargedMicros: usage.moneyChargedMicros,
          lastHeartbeatAt,
        })
        .where(eq(sessions.id, row.id))
        .returning();
      return { row: updated ?? row, account };
    }

    const usage = applyTemporaryCheckpoint(temporaryUsageOf(row), elapsed);
    const [updated] = await tx
      .update(sessions)
      .set({ usedSeconds: usage.usedSeconds, lastHeartbeatAt })
      .where(eq(sessions.id, row.id))
      .returning();
    return { row: updated ?? row, account };
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
