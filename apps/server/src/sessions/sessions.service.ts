import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  type Actor,
  applyCheckpoint,
  applyTemporaryCheckpoint,
  type Customer,
  type CustomerBalances,
  newId,
  type NodeToPcMessage,
  pauseAllowance,
  pendingWarnings,
  seconds,
  secondsUntilAttention,
  secondsUntilExhausted,
  type SessionEndReason,
  startUsage,
  temporaryRemaining,
  type WarningMinutes,
} from '@pope/shared';
import { and, eq, isNull, lte, type SQL } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import {
  type ComboPayment,
  ComboSalesService,
  ComboUnavailableError,
  InactiveAccountError,
  UnknownComboError,
} from '../combos/combo-sales.service.js';
import { customers, type PauseEndReason, pcs, sessionPauses, sessions } from '../db/schema.js';
import { SettingsService } from '../settings/settings.service.js';
import { type Emit, EventsService, type Transaction } from '../events/events.service.js';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service.js';
import { TariffsService } from '../tariffs/tariffs.service.js';
import { InsufficientBalanceError, WalletService } from '../wallet/wallet.service.js';
import { PcConnections, type PcIdentity } from './pc-connections.js';
import {
  accountBalances,
  activeState,
  customerInactiveMessage,
  LOCKED_STATE,
  pauseBilling,
  type PauseRow,
  type PauseStatus,
  PcRequestRefused,
  remainingSeconds,
  type SessionRow,
  temporaryUsageOf,
  usageOf,
} from './session-state.js';
import { openPauseOf, pausesUsed } from './pause-queries.js';

/** Saldo mínimo para abrir una sesión: el de 1 minuto (REQ-001-20). */
export const MIN_SESSION_SECONDS = 60;

/** Como mucho, cada sesión se revisa cada 5 min aunque le quede mucho tiempo. */
const MAX_WATCH_MS = 5 * 60_000;
/** Margen para que el temporizador no salte unos milisegundos antes del segundo justo. */
const WATCH_SLACK_MS = 20;
/**
 * Una PC cuenta como viva si su último mensaje llegó hace menos de esto (el agente late cada
 * 10 s). Con la PC en silencio, ni los temporizadores ni el panel cobran el hueco: se cobra
 * como mucho hasta su último contacto (REQ-001-27). Así, como mucho se cobran 15 s de una
 * PC que acaba de morir.
 */
const ALIVE_MS = 15_000;
/** Cuánto recuerda el nodo que una sesión se cerró, para ignorar lo que llegue tarde. */
const ENDED_MEMORY_MS = 60_000;

/** Usuario y saldos del cliente de una sesión con cuenta. */
interface AccountView {
  username: string;
  balances: CustomerBalances;
}

/**
 * La sesión está en una pausa que no cobra (REQ-002-03): su tiempo no corre, así que no se
 * avisa ni se vigila su agotamiento hasta que se reanude o venza.
 */
function onHold(pause: PauseRow | null): boolean {
  return pause !== null && !pauseBilling(pause);
}

/** Lo que la PC dice de su sesión en un `hello` o un `heartbeat`. */
export interface SessionClaim {
  sessionId: string | null;
  /** El tiempo restante que guarda la PC (REQ-001-63), si lo manda. */
  localRemainingSeconds?: number | null;
}

/**
 * Sesiones de uso de las PCs (plan 001). El nodo es la fuente de verdad del tiempo y del
 * saldo; la PC solo muestra el `state` que le envía (ADR-0007).
 */
@Injectable()
export class SessionsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Sessions');
  /** Deja de escuchar los cambios de tasa al cerrar. */
  private stopRates: (() => void) | null = null;
  /** Cómo cancelar el temporizador de cada sesión vigilada. */
  private readonly timers = new Map<string, () => void>();
  /** Avisos ya enviados de cada sesión (5 y 1 min). Se pierden al reiniciar el nodo. */
  private readonly warned = new Map<string, WarningMinutes[]>();
  /** Cuándo se supo por última vez de cada PC (latido, login o `hello`), en ms. */
  private readonly seen = new Map<string, number>();
  /**
   * Sesiones recién cerradas. Una revisión, una compra o un cambio desde el panel que
   * confirmó su transacción justo antes del cierre no debe, al terminar, volver a avisar,
   * programar un temporizador ni enviar el `state` de una sesión que ya terminó. Se olvidan
   * al cabo de `ENDED_MEMORY_MS`.
   */
  private readonly ended = new Set<string>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly wallet: WalletService,
    private readonly tariffs: TariffsService,
    private readonly comboSales: ComboSalesService,
    private readonly connections: PcConnections,
    private readonly rates: ExchangeRatesService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  /** El `state` de una sesión activa, con la tasa vigente (REQ-005-36) y su pausa. */
  private stateOf(
    row: SessionRow,
    account: Parameters<typeof activeState>[1],
    pause: PauseStatus | null,
  ): NodeToPcMessage {
    return activeState(row, account, this.rates.current()?.vesPerUsd ?? null, pause);
  }

  /**
   * La pausa de una sesión con cuenta para su `state`: la abierta y las que le quedan, con
   * los ajustes del local (spec 002). `null` en una temporal, que no pausa (REQ-002-11).
   */
  async pauseStatus(
    row: SessionRow,
    open: PauseRow | null,
    db: Database = this.db,
  ): Promise<PauseStatus | null> {
    if (row.kind !== 'account' || !row.customerId) {
      return null;
    }
    const used = await pausesUsed(db, row.id, row.customerId, this.clock.now());
    return { open, allowance: pauseAllowance(await this.settings.get(db), used) };
  }

  /**
   * La tasa cambió (REQ-005-36): cada PC conectada con sesión recibe su `state` cobrado hasta
   * ahora, como en un latido, con la tasa nueva.
   */
  async resendStates(): Promise<void> {
    const active = await this.db
      .select({ pcId: sessions.pcId })
      .from(sessions)
      .where(eq(sessions.status, 'active'));
    for (const { pcId } of active) {
      if (!this.connections.isConnected(pcId)) {
        continue;
      }
      const { state } = await this.review(eq(sessions.pcId, pcId));
      this.connections.send(pcId, state);
    }
  }

  /** La PC acaba de dar señales de vida: cualquier mensaje suyo cuenta. */
  touch(pcId: string): void {
    this.seen.set(pcId, this.clock.now().getTime());
  }

  private isAlive(pcId: string): boolean {
    const last = this.seen.get(pcId);
    return last !== undefined && this.clock.now().getTime() - last <= ALIVE_MS;
  }

  /**
   * Hasta qué instante se puede cobrar una sesión de esta PC (REQ-001-27): hasta ahora si
   * la PC está viva; si lleva en silencio más de `ALIVE_MS`, solo hasta su último contacto.
   * Sin ningún contacto desde que arrancó el nodo, no se cobra más allá de lo ya cobrado.
   */
  private billableUntil(row: SessionRow): number {
    const now = this.clock.now().getTime();
    if (this.isAlive(row.pcId)) {
      return now;
    }
    const last = this.seen.get(row.pcId);
    return last === undefined ? row.lastHeartbeatAt.getTime() : Math.min(now, last);
  }

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
    const status = await this.pauseStatus(row, await openPauseOf(row.id, db), db);
    return this.stateOf(row, await this.accountOf(row, db), status);
  }

  /**
   * Abre una sesión con cuenta en la PC (REQ-001-20): la cuenta no puede tener otra sesión
   * activa (REQ-001-21) y necesita saldo para al menos 1 minuto. La sesión copia la tarifa
   * del día (REQ-001-14, REQ-001-16). Emite `session.started` con el cliente como actor.
   * Lanza `PcRequestRefused` si no se puede abrir.
   */
  async startAccountSession(pc: PcIdentity, customer: Customer): Promise<NodeToPcMessage> {
    const started = await this.events.inTransaction(async (tx, emit) => {
      // Bloquea la PC y la cuenta: un login simultáneo en otra PC, o una sesión temporal
      // abierta a la vez en esta, esperan a que termine.
      await tx.select({ id: pcs.id }).from(pcs).where(eq(pcs.id, pc.id)).for('update');
      const [current] = await tx
        .select({ status: customers.status })
        .from(customers)
        .where(eq(customers.id, customer.id))
        .for('update');
      // La contraseña se comprobó antes, fuera de esta transacción: si el encargado bloqueó
      // la cuenta justo entonces, se ve aquí, con la fila ya bloqueada.
      if (current && current.status !== 'active') {
        throw new PcRequestRefused('account_inactive', customerInactiveMessage(current.status));
      }
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
      const remaining = secondsUntilExhausted(startUsage(rate), accountBalances(balances));
      if (remaining < MIN_SESSION_SECONDS) {
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
      return {
        row,
        remaining,
        state: this.stateOf(
          row,
          { username: customer.username, balances },
          await this.pauseStatus(row, null, tx),
        ),
      };
    });
    this.touch(pc.id);
    this.watch(started.row, started.remaining);
    return started.state;
  }

  /**
   * El cliente compra un combo con su saldo desde el Shell, durante la sesión (REQ-001-85,
   * CA-001-17). Primero cobra la sesión hasta ahora y después compra, en la misma
   * transacción: el saldo en vivo es el correcto y desde este instante el tiempo sale de las
   * horas de combo. Devuelve el `state` actualizado. Solo las cuentas pueden comprar
   * combos (REQ-001-82).
   */
  async buyCombo(pcId: string, comboId: string): Promise<NodeToPcMessage> {
    let bought: { row: SessionRow; account: AccountView; pause: PauseRow | null };
    try {
      bought = await this.events.inTransaction((tx, emit) =>
        this.buyComboIn(pcId, comboId, tx, emit),
      );
    } catch (error) {
      // Las comprobaciones son las de la venta de combos; aquí solo se traducen al protocolo.
      if (error instanceof InsufficientBalanceError) {
        throw new PcRequestRefused(
          'insufficient_balance',
          'No tienes saldo suficiente para este combo. Recarga en el mostrador',
        );
      }
      if (error instanceof UnknownComboError || error instanceof ComboUnavailableError) {
        throw new PcRequestRefused('combo_unavailable', 'Ese combo ya no está a la venta');
      }
      if (error instanceof InactiveAccountError) {
        throw new PcRequestRefused(
          'account_inactive',
          customerInactiveMessage(error.accountStatus),
        );
      }
      throw error;
    }
    const remaining = remainingSeconds(bought.row, bought.account.balances);
    // Con más tiempo, los avisos que ya se dieron pueden volver a tocar (se rearman).
    this.attend(bought.row, remaining, bought.pause);
    return this.ended.has(bought.row.id)
      ? LOCKED_STATE
      : this.stateOf(bought.row, bought.account, await this.pauseStatus(bought.row, bought.pause));
  }

  /**
   * El encargado vende un combo a una cuenta desde el panel, en caja o con su saldo
   * (REQ-001-84, REQ-001-85). Si la cuenta tiene una sesión en curso, primero la cobra hasta
   * ahora en la misma transacción: así el saldo en vivo es el correcto y el tiempo usado
   * antes de la compra no sale de las horas nuevas. La PC ve el nuevo saldo al momento.
   */
  async sellCombo(
    customerId: string,
    comboId: string,
    payment: ComboPayment,
    actor: Actor,
  ): Promise<Customer> {
    const sold = await this.events.inTransaction(async (tx, emit) => {
      const [locked] = await tx
        .select()
        .from(sessions)
        .where(and(eq(sessions.customerId, customerId), eq(sessions.status, 'active')))
        .for('update');
      const checked = locked ? await this.checkpoint(locked, tx) : null;
      const customer = await this.comboSales.purchaseIn(
        tx,
        emit,
        customerId,
        comboId,
        payment,
        actor,
      );
      return { customer, checked };
    });
    const { customer, checked } = sold;
    if (checked && !this.ended.has(checked.row.id)) {
      const session = checked.row;
      const account = { username: customer.username, balances: customer.balances };
      const remaining = remainingSeconds(session, customer.balances);
      const status = await this.pauseStatus(session, checked.pause);
      this.connections.send(session.pcId, this.stateOf(session, account, status));
      this.attend(session, remaining, checked.pause);
    }
    return customer;
  }

  private async buyComboIn(
    pcId: string,
    comboId: string,
    tx: Transaction,
    emit: Emit,
  ): Promise<{ row: SessionRow; account: AccountView; pause: PauseRow | null }> {
    const [locked] = await tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.pcId, pcId), eq(sessions.status, 'active')))
      .for('update');
    if (!locked) {
      throw new PcRequestRefused('no_active_session', 'No tienes una sesión abierta');
    }
    if (locked.kind !== 'account' || !locked.customerId) {
      throw new PcRequestRefused(
        'no_active_session',
        'Los combos son solo para clientes con cuenta',
      );
    }
    const { row, account, pause } = await this.checkpoint(locked, tx);
    const username = account?.username ?? '';
    const customer = await this.comboSales.purchaseIn(
      tx,
      emit,
      locked.customerId,
      comboId,
      { via: 'balance' },
      { kind: 'customer', customerId: locked.customerId, username },
      row.id,
    );
    return {
      row,
      account: { username: customer.username, balances: customer.balances },
      pause,
    };
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
   * pasa `billToNow: false` para cobrar solo hasta el último latido (REQ-001-27) y
   * `ifNotBeatAfter` para no cerrar una sesión que acaba de latir. Un cierre por
   * agotamiento pasa `onlyIfExhausted` para no cerrar una sesión a la que se acaba de
   * añadir tiempo o saldo. Avisa a la PC con `sessionEnded`. Devuelve la sesión cerrada, o
   * `null` si ya no estaba activa o no se cumplió alguna de esas condiciones.
   */
  async close(
    sessionId: string,
    reason: SessionEndReason,
    actor: Actor,
    options: {
      billToNow?: boolean;
      ifNotBeatAfter?: Date;
      onlyIfExhausted?: boolean;
      /** Cómo termina su pausa abierta, si la tiene (spec 002). */
      pauseEndReason?: PauseEndReason;
    } = {},
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
      // Un latido que llegó mientras se decidía cerrar por falta de latidos la salva.
      if (options.ifNotBeatAfter && locked.lastHeartbeatAt > options.ifNotBeatAfter) {
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
      if (options.onlyIfExhausted) {
        const account = await this.accountOf(locked, tx);
        if (remainingSeconds(locked, account?.balances ?? null) > 0) {
          return null;
        }
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
      // Una sesión que se cierra en pausa termina también su pausa (spec 002).
      await tx
        .update(sessionPauses)
        .set({
          endedAt: this.clock.now(),
          endReason: options.pauseEndReason ?? 'session_closed',
          endedBy: actor,
        })
        .where(and(eq(sessionPauses.sessionId, closed.id), isNull(sessionPauses.endedAt)));
      await this.emitEnded(closed, reason, actor, tx, emit);
      return closed;
    });
    if (ended) {
      this.unwatch(ended.id);
      const endedId = ended.id;
      this.ended.add(endedId);
      this.clock.schedule(ENDED_MEMORY_MS, () => {
        this.ended.delete(endedId);
        return Promise.resolve();
      });
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
   * Shell actualice tiempo y saldo (REQ-001-12). Además revisa si toca avisar o cerrar
   * (`review`). Sin sesión activa, o si acaba de agotarse, devuelve la pantalla de bloqueo.
   *
   * Si la PC dice tener una sesión que el nodo ya cerró (volvió tras un corte de red), la
   * sesión sigue cerrada: se le avisa con `sessionEnded` (`rejectClaim`). Que la PC diga que
   * no tiene sesión no cierra nada aquí: eso lo decide el `hello`, porque un latido enviado
   * justo antes de recibir el `state` del login diría lo mismo.
   */
  async heartbeat(pcId: string, claim: SessionClaim): Promise<NodeToPcMessage> {
    this.touch(pcId);
    await this.confirm(pcId, claim.sessionId);
    const { state, closedId } = await this.review(eq(sessions.pcId, pcId));
    const activeId =
      state.type === 'state' && state.status === 'active' ? state.session.sessionId : null;
    // Si la revisión acaba de cerrarla, la PC ya recibió su `sessionEnded`.
    if (claim.sessionId !== null && claim.sessionId !== activeId && claim.sessionId !== closedId) {
      await this.rejectClaim(pcId, claim.sessionId, claim.localRemainingSeconds ?? null);
    }
    return state;
  }

  /**
   * La PC se identifica con `hello` diciendo qué sesión cree tener (plan 001, "Latidos,
   * cortes de luz y reinicios"). Si el nodo tiene una sesión activa en esa PC que la PC ya
   * conocía (`pcConfirmedAt`) y ella dice que no tiene ninguna, se reinició: la sesión se
   * cierra al momento como `no_heartbeat`, se cobra hasta el último latido y una temporal
   * queda en "Sesiones interrumpidas". Si la PC nunca llegó a conocerla (se perdió el `state`
   * que la abría), sigue abierta y la PC la recibe ahora con su `state`. Si dice tener una
   * sesión ya cerrada, se le avisa con `sessionEnded`.
   */
  async reconcile(pcId: string, claim: SessionClaim): Promise<void> {
    const claimedId = claim.sessionId;
    this.touch(pcId);
    await this.confirm(pcId, claimedId);
    const active = await this.activeOnPc(pcId);
    if (active && claimedId === null) {
      if (active.pcConfirmedAt) {
        await this.close(active.id, 'no_heartbeat', { kind: 'system' }, { billToNow: false });
      }
    } else if (claimedId !== null && claimedId !== active?.id) {
      await this.rejectClaim(pcId, claimedId, claim.localRemainingSeconds ?? null);
    }
  }

  /** La PC nombró su sesión activa: ya sabe que la tiene. Solo escribe la primera vez. */
  private async confirm(pcId: string, sessionId: string | null): Promise<void> {
    if (sessionId === null) {
      return;
    }
    await this.db
      .update(sessions)
      .set({ pcConfirmedAt: this.clock.now() })
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.pcId, pcId),
          eq(sessions.status, 'active'),
          isNull(sessions.pcConfirmedAt),
        ),
      );
  }

  /**
   * La PC cree tener la sesión `claimedId`, pero el nodo no la tiene activa. Si la cerró el
   * nodo, se le dice cómo y por qué (`sessionEnded`) para que se bloquee. Si era temporal y
   * se cerró por falta de latidos, su restante pasa a ser el menor entre el del nodo y el de
   * la PC (`localRemaining`). Una sesión desconocida se ignora.
   */
  private async rejectClaim(
    pcId: string,
    claimedId: string,
    localRemaining: number | null,
  ): Promise<void> {
    const [claimed] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, claimedId), eq(sessions.pcId, pcId)));
    if (claimed?.status !== 'ended' || !claimed.endReason) {
      return;
    }
    if (claimed.endReason === 'no_heartbeat' && localRemaining !== null) {
      await this.correctRemaining(claimed.id, localRemaining);
    }
    this.connections.send(pcId, {
      type: 'sessionEnded',
      sessionId: claimed.id,
      reason: claimed.endReason,
    });
  }

  /**
   * Baja el restante de una sesión temporal cerrada sin latidos al que informa la PC, si es
   * menor. No toca las que ya se restauraron: la copia ya se llevó su tiempo (REQ-001-68).
   */
  private async correctRemaining(sessionId: string, localRemaining: number): Promise<void> {
    await this.events.inTransaction(async (tx, emit) => {
      const [row] = await tx
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .for('update');
      if (row?.kind !== 'temporary' || row.endReason !== 'no_heartbeat') {
        return;
      }
      const [restored] = await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.restoredFrom, sessionId));
      const usage = temporaryUsageOf(row);
      const from = temporaryRemaining(usage);
      const to = Math.min(from, localRemaining);
      if (restored || to >= from) {
        return;
      }
      await tx
        .update(sessions)
        .set({ usedSeconds: usage.purchasedSeconds - to })
        .where(eq(sessions.id, sessionId));
      const [pc] = await tx.select({ name: pcs.name }).from(pcs).where(eq(pcs.id, row.pcId));
      emit({
        type: 'session.remaining_corrected',
        version: 1,
        actor: { kind: 'system' },
        payload: {
          sessionId,
          pc: { id: row.pcId, name: pc?.name ?? '' },
          from,
          to: seconds(to),
        },
      });
    });
  }

  /**
   * Cierra como `no_heartbeat` las sesiones activas sin latidos desde `lastBeatBefore` (el
   * tiempo de gracia ya vencido), cobrando solo hasta su último latido (REQ-001-27,
   * CA-001-03). Lo usan el proceso periódico y la revisión al arrancar el nodo.
   */
  async closeStale(lastBeatBefore: Date): Promise<void> {
    const stale = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.status, 'active'), lte(sessions.lastHeartbeatAt, lastBeatBefore)));
    for (const { id } of stale) {
      await this.close(
        id,
        'no_heartbeat',
        { kind: 'system' },
        { billToNow: false, ifNotBeatAfter: lastBeatBefore },
      );
    }
  }

  /**
   * Cobra la sesión activa que cumple `target` hasta ahora y actúa según lo que le queda
   * (REQ-001-24, REQ-001-25): si se agotó, la cierra; si toca, avisa a 5 y 1 min; y
   * programa la próxima revisión. La llaman el latido de la PC y el temporizador de la
   * sesión. Devuelve el `state` que debe ver la PC y, si la cerró por agotamiento, su id
   * (la PC ya recibió su `sessionEnded`).
   */
  async review(target: SQL): Promise<{ state: NodeToPcMessage; closedId: string | null }> {
    const checked = await this.events.inTransaction(async (tx) => {
      // Bloquea la fila: un cierre o una revisión simultáneos esperan a que termine esta.
      const [locked] = await tx
        .select()
        .from(sessions)
        .where(and(target, eq(sessions.status, 'active')))
        .for('update');
      return locked ? this.checkpoint(locked, tx) : null;
    });
    if (!checked) {
      return { state: LOCKED_STATE, closedId: null };
    }
    const { row, account, pause } = checked;
    const remaining = remainingSeconds(row, account?.balances ?? null);
    if (remaining === 0) {
      // Ya se cobró hasta ahora: el cierre no necesita cobrar otra vez.
      const closed = await this.close(
        row.id,
        'exhausted',
        { kind: 'system' },
        { billToNow: false, onlyIfExhausted: true },
      );
      // Si no cerró, justo entonces le añadieron tiempo o saldo (o ya la habían cerrado):
      // se revisa de nuevo con los datos al día.
      return closed ? { state: LOCKED_STATE, closedId: closed.id } : this.review(target);
    }
    this.attend(row, remaining, pause);
    // Si la cerraron mientras tanto, la PC ya recibió `sessionEnded`: no hay que desbloquearla.
    return {
      state: this.ended.has(row.id)
        ? LOCKED_STATE
        : this.stateOf(row, account, await this.pauseStatus(row, pause)),
      closedId: null,
    };
  }

  /**
   * Avisos y vigilancia de una sesión activa según lo que le queda. En una pausa que no
   * cobra el tiempo no corre: se deja de vigilar hasta que se reanude (REQ-002-03).
   */
  private attend(row: SessionRow, remaining: number, pause: PauseRow | null): void {
    if (onHold(pause)) {
      this.timers.get(row.id)?.();
      this.timers.delete(row.id);
      return;
    }
    this.sendWarning(row, remaining);
    this.watch(row, remaining);
  }

  /** Envía el aviso de 5 o 1 min si toca. Si la PC no está conectada, se reintenta luego. */
  private sendWarning(row: SessionRow, remaining: number): void {
    if (this.ended.has(row.id)) {
      return;
    }
    const check = pendingWarnings(seconds(remaining), this.warned.get(row.id) ?? []);
    if (check.send !== null) {
      const delivered = this.connections.send(row.pcId, {
        type: 'warning',
        sessionId: row.id,
        minutesLeft: check.send,
      });
      if (!delivered) {
        return;
      }
    }
    this.warned.set(row.id, check.sent);
  }

  /**
   * Programa la próxima revisión de la sesión: cuando le toque el siguiente aviso o se
   * agote (`secondsUntilAttention`), o ya mismo si hay un aviso pendiente y la PC está
   * conectada (una sesión que empieza con menos de 5 min). Si cambia lo que le queda (una
   * recarga, una compra), el temporizador puede saltar antes o después de lo justo: da
   * igual, porque cada revisión recalcula todo y reprograma, y el latido de la PC revisa
   * además cada 10 s.
   */
  private watch(row: SessionRow, remaining: number): void {
    if (this.ended.has(row.id)) {
      return;
    }
    this.timers.get(row.id)?.();
    const due =
      this.connections.isConnected(row.pcId) &&
      pendingWarnings(seconds(remaining), this.warned.get(row.id) ?? []).send !== null;
    const wait = due ? 0 : secondsUntilAttention(seconds(remaining)) * 1000;
    const deadline = row.lastHeartbeatAt.getTime() + wait;
    const delay = Math.min(Math.max(0, deadline - this.clock.now().getTime()), MAX_WATCH_MS);
    this.timers.set(
      row.id,
      this.clock.schedule(delay + WATCH_SLACK_MS, async () => {
        this.timers.delete(row.id);
        // Con la PC en silencio no se cobra ni se cierra aquí: el siguiente latido reprograma
        // el temporizador y, si no llega, el cierre por falta de latidos cobra hasta el último.
        if (!this.isAlive(row.pcId)) {
          return;
        }
        try {
          await this.review(eq(sessions.id, row.id));
        } catch (error) {
          this.logger.error(`Error al revisar la sesión ${row.id}`, error);
        }
      }),
    );
  }

  /**
   * El panel acaba de abrir una sesión temporal o de cambiar su tiempo (añadir tiempo,
   * restaurar): la PC recibe su `state` al momento, y la sesión empieza a vigilarse o
   * reprograma sus avisos con el nuevo restante.
   */
  announce(row: SessionRow): void {
    // Si la cerraron justo después, mandar su `state` desbloquearía la PC.
    if (this.ended.has(row.id)) {
      return;
    }
    const remaining = remainingSeconds(row, null);
    // Enviar no prueba que la PC esté viva (el socket puede estar medio cerrado): su último
    // contacto sigue siendo el que decide hasta dónde se cobra.
    this.connections.send(row.pcId, this.stateOf(row, null, null));
    this.sendWarning(row, remaining);
    this.watch(row, remaining);
  }

  /** Deja de vigilar una sesión que se cerró. */
  private unwatch(sessionId: string): void {
    this.timers.get(sessionId)?.();
    this.timers.delete(sessionId);
    this.warned.delete(sessionId);
  }

  onApplicationBootstrap(): void {
    this.stopRates = this.rates.subscribe(() => this.resendStates());
  }

  onModuleDestroy(): void {
    this.stopRates?.();
    for (const cancel of this.timers.values()) {
      cancel();
    }
    this.timers.clear();
  }

  /**
   * Cobra la sesión hasta el instante actual, o hasta el último contacto de la PC si está en
   * silencio (`billableUntil`, REQ-001-27), y guarda el resultado. Avanza `lastHeartbeatAt`
   * exactamente los segundos enteros cobrados, no hasta "ahora": así la fracción de segundo
   * se cobra en el siguiente latido y no se pierde (motor de cobro, `applyCheckpoint`).
   * Si el reloj se corrigió hacia atrás no se cobra nada y la marca no se mueve. Debe
   * llamarse con la fila de la sesión bloqueada (`for update`) dentro de la transacción.
   *
   * En una pausa que no cobra (REQ-002-03) no se cobra nada, la llame quien la llame (latido,
   * temporizador, cierre, compra, cambio de tasa): la marca avanza hasta ahora sin cobrar, y
   * como mucho hasta el fin de la pausa, desde donde se cobrará si vence con la opción a).
   * Devuelve también la pausa abierta, si la hay.
   */
  async checkpoint(
    row: SessionRow,
    tx: Database,
  ): Promise<{
    row: SessionRow;
    account: { username: string; balances: CustomerBalances } | null;
    pause: PauseRow | null;
  }> {
    const pause = row.kind === 'account' ? await openPauseOf(row.id, tx) : null;
    if (onHold(pause) && pause) {
      const held = Math.min(this.clock.now().getTime(), pause.maxUntil.getTime());
      const lastHeartbeatAt = new Date(Math.max(row.lastHeartbeatAt.getTime(), held));
      const [updated] = await tx
        .update(sessions)
        .set({ lastHeartbeatAt })
        .where(eq(sessions.id, row.id))
        .returning();
      return { row: updated ?? row, account: await this.accountOf(row, tx), pause };
    }

    const elapsed = seconds(
      Math.max(0, Math.floor((this.billableUntil(row) - row.lastHeartbeatAt.getTime()) / 1000)),
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
      return { row: updated ?? row, account, pause };
    }

    const usage = applyTemporaryCheckpoint(temporaryUsageOf(row), elapsed);
    const [updated] = await tx
      .update(sessions)
      .set({ usedSeconds: usage.usedSeconds, lastHeartbeatAt })
      .where(eq(sessions.id, row.id))
      .returning();
    return { row: updated ?? row, account, pause };
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
