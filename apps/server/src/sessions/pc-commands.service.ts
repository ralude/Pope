import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  type Actor,
  newId,
  PC_COMMAND_TTL_SECONDS,
  type PcCommand,
  type PcCommandAckMessage,
  type PcCommandRequest,
  type PcCommandResponse,
  pcCommandResponseSchema,
  pcCommandSchema,
  type PcCommandResult,
  type PcControlContext,
  type PcControlSnapshot,
  pcControlSnapshotSchema,
  pcCommandErrorSchema,
} from '@pope/shared';
import { and, eq, gt } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { pcCommands, pcControlStates } from '../db/schema.js';
import { type Emit, EventsService, type Transaction } from '../events/events.service.js';
import type { PcIdentity } from './pc-connections.js';
import { PcConnections } from './pc-connections.js';
import { PcControlService } from './pc-control.service.js';

export type CommandRow = typeof pcCommands.$inferSelect;
type CommandErrorCode = ReturnType<typeof pcCommandErrorSchema.parse>['code'];
export type StaffActor = Extract<Actor, { kind: 'staff' }>;
type SystemActor = Extract<Actor, { kind: 'system' }>;

/** Error del contrato de órdenes (plan T02b): `{ code, message }` con su estado HTTP. */
export class PcCommandException extends HttpException {
  constructor(code: CommandErrorCode, message: string, status = 409) {
    super(pcCommandErrorSchema.parse({ code, message }), status);
  }
}

/**
 * Fallos del agente que prueban que la orden no tuvo efecto: liberan la reserva. Un
 * `native_failure` puede haber dejado algo a medias y la conserva (plan, concreción T28).
 * Un bloqueo solo la libera al aplicarse (T29).
 */
const FAILURES_WITHOUT_EFFECT = new Set([
  'expired',
  'stale_context',
  'invalid_action',
  'pc_unavailable',
]);

/** Las de energía terminan en la aceptación de Windows; las demás, en su efecto. */
const isPower = (kind: string) => kind === 'restart' || kind === 'powerOff';

/** Reinicio o apagado que el personal confirmó con una sesión abierta, ya cerrada (T30). */
const closedSession = (row: CommandRow) =>
  isPower(row.action.kind) && row.request.expected.kind === 'session';

/** Orden de las respuestas: un acuse nunca hace retroceder una orden. */
function rank(status: CommandRow['status']): number {
  return status === 'accepted' ? 1 : status === 'applied' || status === 'failed' ? 2 : 0;
}

/** JSON con las claves ordenadas: PostgreSQL reordena las de `jsonb`. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : inner,
  );
}

/** Orden tal como viaja a la PC; las columnas JSON se validan con el contrato. */
function commandOf(row: CommandRow): PcCommand {
  return pcCommandSchema.parse({
    id: row.id,
    pcId: row.pcId,
    actor: row.actor,
    expected: row.expected,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    action: row.action,
  });
}

export function responseOf(row: CommandRow): PcCommandResponse {
  return pcCommandResponseSchema.parse({
    command: commandOf(row),
    status: row.status,
    lastResult: row.lastResult ?? null,
  });
}

/** Si la respuesta corresponde a la orden: mismo tipo y, en mantenimiento, mismos IDs. */
function matches(row: CommandRow, result: PcCommandResult): boolean {
  const action = row.action;
  if (result.status !== 'applied') return result.kind === action.kind;
  const effect = result.effect;
  if (effect.kind !== action.kind) return false;
  if (effect.kind === 'startMaintenance' && action.kind === 'startMaintenance')
    return effect.maintenanceId === action.maintenanceId;
  if (effect.kind === 'endMaintenance' && action.kind === 'endMaintenance')
    return effect.exit.maintenanceId === action.maintenanceId && effect.exit.id === action.exitId;
  return true;
}

/** Petición del panel que cierra la sesión y la orden que la sigue (T29/T30). */
export interface CloseOrder {
  request: PcCommandRequest;
  action: { kind: 'lock' } | { kind: 'restart' } | { kind: 'powerOff' };
}

/** Lo que hace falta para guardar una orden nueva. */
export interface NewCommand {
  pc: PcIdentity;
  actor: StaffActor | SystemActor;
  /** Petición original (idempotencia); la del panel o una sintética del sistema. */
  request: PcCommandRequest;
  action: PcCommand['action'];
  /** Contexto vigente con la PC bloqueada: el que la PC comparará al recibirla. */
  context: PcControlContext;
}

/**
 * Órdenes a las PCs (spec 003, T28/T29; plan T02b): guardado con eventos, envío, acuses,
 * vencimiento a los 30 s y reserva de la PC mientras el efecto no se confirma. Una PC
 * reservada no admite sesiones nuevas (`PcControlService.unavailableIn`). Las peticiones
 * del panel entran por `PcCommandRequestsService`; los cierres de sesión, por
 * `SessionsService.close`.
 */
@Injectable()
export class PcCommandsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('PcCommands');
  /** Cómo cancelar el vencimiento programado de cada orden pendiente. */
  private readonly timers = new Map<string, () => void>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly control: PcControlService,
    private readonly connections: PcConnections,
    private readonly clock: Clock,
  ) {}

  /** Al arrancar el nodo, vence lo que caducó mientras estaba parado y vigila el resto. */
  async onApplicationBootstrap(): Promise<void> {
    const pending = await this.db
      .select({ id: pcCommands.id, expiresAt: pcCommands.expiresAt })
      .from(pcCommands)
      .where(eq(pcCommands.status, 'requested'));
    for (const { id, expiresAt } of pending) this.watch(id, expiresAt);
  }

  onModuleDestroy(): void {
    for (const cancel of this.timers.values()) cancel();
    this.timers.clear();
  }

  /** Contexto, conexión y reserva de la PC para el panel. */
  async snapshot(pcId: string): Promise<PcControlSnapshot> {
    return this.db.transaction(async (tx) => {
      if (!(await this.control.lockPc(tx, pcId))) {
        throw new PcCommandException('unknown_pc', 'No existe esa PC', 404);
      }
      const context = await this.control.contextIn(tx, pcId);
      const holder = await this.holder(tx, pcId);
      return pcControlSnapshotSchema.parse({
        context,
        connected: this.connections.isConnected(pcId),
        reservation: holder ? responseOf(holder) : null,
      });
    });
  }

  /** Orden ya guardada con ese ID, si existe. */
  async find(tx: Transaction, id: string): Promise<CommandRow | undefined> {
    const [row] = await tx.select().from(pcCommands).where(eq(pcCommands.id, id));
    return row;
  }

  /**
   * Guarda una orden que reserva la PC, con su evento, y toma la reserva de la anterior si
   * la había. Llamar con la fila de la PC bloqueada; tras el commit, `dispatch`.
   */
  async insertIn(tx: Transaction, emit: Emit, input: NewCommand): Promise<CommandRow> {
    const holder = await this.holder(tx, input.pc.id);
    const now = this.clock.now();
    const [row] = await tx
      .insert(pcCommands)
      .values({
        id: input.request.id,
        pcId: input.pc.id,
        actor: input.actor,
        request: input.request,
        expected: input.context,
        action: input.action,
        issuedAt: now,
        expiresAt: new Date(now.getTime() + PC_COMMAND_TTL_SECONDS * 1_000),
      })
      .returning();
    if (!row) throw new Error('No se pudo guardar la orden');
    await tx
      .update(pcControlStates)
      .set({ reservedCommandId: row.id, reservedAt: now })
      .where(eq(pcControlStates.pcId, input.pc.id));
    emit({
      type: 'pc.command_requested',
      version: 1,
      actor: input.actor,
      payload: {
        commandId: row.id,
        pc: { id: input.pc.id, name: input.pc.name },
        kind: row.action.kind,
        expected: { kind: input.context.kind, revision: input.context.revision },
        expiresAt: row.expiresAt.toISOString(),
        replacesCommandId: holder?.id ?? null,
      },
    });
    return row;
  }

  /**
   * Orden que sigue a un cierre de sesión (T29/T30): el bloqueo, o el reinicio o apagado que
   * el personal confirmó. Actor del personal que cerró o del sistema; espera el contexto ya
   * libre. Sin `order`, un bloqueo del sistema (también al reconectar). Nunca sobre un
   * mantenimiento, que tiene su propia salida.
   */
  async insertAfterCloseIn(
    tx: Transaction,
    emit: Emit,
    pc: PcIdentity,
    actor: StaffActor | SystemActor,
    order?: CloseOrder,
  ): Promise<CommandRow | null> {
    const context = await this.control.contextIn(tx, pc.id);
    if (context.kind === 'maintenance') return null;
    return this.insertIn(tx, emit, {
      pc,
      actor,
      request: order?.request ?? { id: newId(), kind: 'lock', expected: context },
      action: order?.action ?? { kind: 'lock' },
      context,
    });
  }

  /**
   * Después del commit: envía a la PC el contexto con el que comparará la orden y la orden,
   * y programa su vencimiento. Sin conexión, la recibirá al reconectar si no venció.
   */
  dispatch(row: CommandRow): void {
    this.watch(row.id, row.expiresAt);
    this.connections.send(row.pcId, {
      type: 'controlState',
      context: row.expected,
      serverTime: this.clock.now().toISOString(),
    });
    this.connections.send(row.pcId, { type: 'command', command: commandOf(row) });
  }

  /** Orden que reserva la PC, si hay alguna. */
  async holder(tx: Transaction, pcId: string): Promise<CommandRow | undefined> {
    const [state] = await tx
      .select({ commandId: pcControlStates.reservedCommandId })
      .from(pcControlStates)
      .where(eq(pcControlStates.pcId, pcId));
    return state?.commandId ? this.find(tx, state.commandId) : undefined;
  }

  /**
   * Si la orden puede seguir produciendo su efecto: pedida y sin vencer, o aceptada a la
   * espera del efecto. Un reinicio o apagado aceptado sigue en curso hasta que la PC vuelva.
   */
  inFlight(row: CommandRow): boolean {
    return (
      (row.status === 'requested' && row.expiresAt > this.clock.now()) || row.status === 'accepted'
    );
  }

  /**
   * Respuesta de la PC a una orden suya. Se ignora (con aviso en el log) si no es de esa PC
   * o no corresponde a la orden; repetida no cambia nada y nunca hace retroceder una orden.
   */
  async acknowledge(pcId: string, ack: PcCommandAckMessage): Promise<void> {
    const lock = await this.events.inTransaction(async (tx, emit): Promise<CommandRow | null> => {
      const pc = await this.control.lockPc(tx, pcId);
      const [row] = await tx
        .select()
        .from(pcCommands)
        .where(and(eq(pcCommands.id, ack.commandId), eq(pcCommands.pcId, pcId)));
      if (!pc || !row || !matches(row, ack.result)) {
        this.logger.warn(`Acuse que no corresponde a una orden de ${pc?.name ?? 'una PC'}`);
        return null;
      }
      const status = ack.result.status;
      if (rank(row.status) === 2) {
        if (canonical(row.lastResult) !== canonical(ack.result)) {
          this.logger.warn(`${pc.name} contradice el resultado de la orden ${row.id}`);
        }
        return null;
      }
      if (rank(status) <= rank(row.status)) return null;
      const now = this.clock.now();
      await tx
        .update(pcCommands)
        .set({ status, lastResult: ack.result, lastResultAt: now })
        .where(eq(pcCommands.id, row.id));
      // Un bloqueo protege al cliente siguiente: solo su efecto confirmado libera la PC.
      const released =
        status === 'applied' ||
        (row.action.kind !== 'lock' &&
          ack.result.status === 'failed' &&
          FAILURES_WITHOUT_EFFECT.has(ack.result.code));
      const reservationReleased = released && (await this.release(tx, pcId, row.id));
      emit({
        type: 'pc.command_acknowledged',
        version: 1,
        actor: { kind: 'system' },
        payload: {
          commandId: row.id,
          pc,
          kind: row.action.kind,
          status,
          failureCode: ack.result.status === 'failed' ? ack.result.code : null,
          reportedAt: ack.occurredAt,
          late: row.status === 'expired',
          reservationReleased,
        },
      });
      // T30: si un reinicio o apagado que cerró una sesión no se ejecutó, la PC se bloquea
      // como tras cualquier cierre, para confirmar la limpieza de los procesos del cliente.
      return ack.result.status === 'failed' && closedSession(row)
        ? this.insertAfterCloseIn(tx, emit, pc, { kind: 'system' })
        : null;
    });
    if (lock) this.dispatch(lock);
  }

  /**
   * La PC acaba de identificarse (`hello`). Si había aceptado reiniciar o apagar, ese
   * arranque cierra la orden y libera la reserva. Un bloqueo que quedó sin aplicar (vencido,
   * aceptado sin respuesta o fallido sin efecto) se pide de nuevo; uno que falló en Windows
   * espera al personal. Las órdenes aún vigentes se reenvían: el agente las reconoce por ID.
   */
  async reconnected(pcId: string): Promise<void> {
    const live = await this.events.inTransaction(async (tx, emit) => {
      const pc = await this.control.lockPc(tx, pcId);
      if (!pc) return [];
      const holder = await this.holder(tx, pcId);
      if (holder?.status === 'accepted' && isPower(holder.action.kind)) {
        await this.release(tx, pcId, holder.id);
        emit({
          type: 'pc.reservation_released',
          version: 1,
          actor: { kind: 'system' },
          payload: {
            commandId: holder.id,
            pc,
            kind: holder.action.kind === 'restart' ? 'restart' : 'powerOff',
            reason: 'reconnected',
          },
        });
      }
      // Un reinicio o apagado que cerró una sesión y venció sin respuesta tampoco confirmó la
      // limpieza (T30): se pide el bloqueo igual que si lo hubiera sido.
      if (
        (holder?.action.kind === 'lock' &&
          (holder.status === 'expired' ||
            holder.status === 'accepted' ||
            (holder.lastResult?.status === 'failed' &&
              holder.lastResult.code !== 'native_failure'))) ||
        (holder && closedSession(holder) && holder.status === 'expired')
      ) {
        await this.insertAfterCloseIn(tx, emit, pc, { kind: 'system' });
      }
      return tx
        .select()
        .from(pcCommands)
        .where(
          and(
            eq(pcCommands.pcId, pcId),
            eq(pcCommands.status, 'requested'),
            gt(pcCommands.expiresAt, this.clock.now()),
          ),
        );
    });
    for (const row of live) this.dispatch(row);
  }

  /** Vence la orden si a los 30 s la PC no respondió (plan T02b). */
  async expire(commandId: string): Promise<void> {
    this.timers.delete(commandId);
    await this.events.inTransaction(async (tx, emit) => {
      const [found] = await tx
        .select({ pcId: pcCommands.pcId })
        .from(pcCommands)
        .where(eq(pcCommands.id, commandId));
      if (!found) return;
      const pc = await this.control.lockPc(tx, found.pcId);
      const row = await this.find(tx, commandId);
      if (!pc || row?.status !== 'requested' || row.expiresAt > this.clock.now()) return;
      await tx.update(pcCommands).set({ status: 'expired' }).where(eq(pcCommands.id, commandId));
      emit({
        type: 'pc.command_expired',
        version: 1,
        actor: { kind: 'system' },
        payload: { commandId, pc, kind: row.action.kind },
      });
    });
  }

  /** Quita la reserva si la tiene esta orden. Devuelve si la quitó. */
  private async release(tx: Transaction, pcId: string, commandId: string): Promise<boolean> {
    const released = await tx
      .update(pcControlStates)
      .set({ reservedCommandId: null, reservedAt: null })
      .where(and(eq(pcControlStates.pcId, pcId), eq(pcControlStates.reservedCommandId, commandId)))
      .returning({ pcId: pcControlStates.pcId });
    return released.length > 0;
  }

  private watch(commandId: string, expiresAt: Date): void {
    this.timers.get(commandId)?.();
    const delay = Math.max(0, expiresAt.getTime() - this.clock.now().getTime());
    this.timers.set(
      commandId,
      this.clock.schedule(delay, () => this.expire(commandId)),
    );
  }
}
