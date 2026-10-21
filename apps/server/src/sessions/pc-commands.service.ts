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
  PC_COMMAND_TTL_SECONDS,
  type PcCommand,
  type PcCommandAckMessage,
  type PcCommandRequest,
  type PcCommandResponse,
  pcCommandResponseSchema,
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
import { EventsService, type Transaction } from '../events/events.service.js';
import { PcConnections } from './pc-connections.js';
import { PcControlService } from './pc-control.service.js';

type CommandRow = typeof pcCommands.$inferSelect;
type CommandErrorCode = ReturnType<typeof pcCommandErrorSchema.parse>['code'];
type StaffActor = Extract<Actor, { kind: 'staff' }>;

/** Error del contrato de órdenes (plan T02b): `{ code, message }` con su estado HTTP. */
export class PcCommandException extends HttpException {
  constructor(code: CommandErrorCode, message: string, status = 409) {
    super(pcCommandErrorSchema.parse({ code, message }), status);
  }
}

/**
 * Fallos del agente que prueban que la orden no tuvo efecto: liberan la reserva. Un
 * `native_failure` puede haber dejado algo a medias y la conserva (plan, concreción T28).
 */
const FAILURES_WITHOUT_EFFECT = new Set([
  'expired',
  'stale_context',
  'invalid_action',
  'pc_unavailable',
]);

/** Las de energía terminan en la aceptación de Windows; las demás, en su efecto. */
const isPower = (kind: string) => kind === 'restart' || kind === 'powerOff';

/** Orden de las respuestas: un acuse nunca hace retroceder una orden. */
function rank(status: CommandRow['status']): number {
  return status === 'accepted' ? 1 : status === 'applied' || status === 'failed' ? 2 : 0;
}

/** JSON con las claves ordenadas: PostgreSQL reordena las de `jsonb`. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : inner,
  );
}

function sameContext(expected: PcControlContext, current: PcControlContext): boolean {
  return canonical(expected) === canonical(current);
}

/** Orden tal como viaja a la PC. */
function commandOf(row: CommandRow): PcCommand {
  return {
    id: row.id,
    pcId: row.pcId,
    actor: row.actor,
    expected: row.expected,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    action: row.action,
  };
}

function responseOf(row: CommandRow): PcCommandResponse {
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

/**
 * Órdenes del panel a las PCs (spec 003, T28; plan T02b): solicitud, acuse y resultado con
 * eventos, vencimiento a los 30 s y reserva de la PC mientras el efecto no se confirma. Una
 * orden reservada impide abrir sesiones en la PC (`PcControlService.unavailableIn`).
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

  /**
   * Pide una orden (REQ-003-20). El ID la hace idempotente: repetirla (doble clic, reintento)
   * devuelve la misma orden; reutilizarlo con otra petición es un conflicto. `actions` dice
   * qué tipos están disponibles, porque cada uno se activa en su tarea (T29–T40).
   */
  async issue(
    pcId: string,
    request: PcCommandRequest,
    actor: StaffActor,
  ): Promise<PcCommandResponse> {
    const issued = await this.events.inTransaction(async (tx, emit) => {
      const pc = await this.control.lockPc(tx, pcId);
      const [existing] = await tx.select().from(pcCommands).where(eq(pcCommands.id, request.id));
      if (existing) {
        if (existing.pcId !== pcId || canonical(existing.request) !== canonical(request)) {
          throw new PcCommandException('idempotency_conflict', 'Ese ID identifica otra orden');
        }
        return { row: existing, context: null };
      }
      if (!pc) throw new PcCommandException('unknown_pc', 'No existe esa PC', 404);
      const kind = request.kind;
      // Hasta sus tareas, solo las órdenes que no exigen cerrar nada antes (concreción T28).
      if (
        (kind !== 'lock' && kind !== 'restart' && kind !== 'powerOff') ||
        request.expected.kind !== 'free'
      ) {
        throw new PcCommandException('invalid_command', 'Esta orden aún no está disponible', 400);
      }
      if (!this.connections.isConnected(pcId)) {
        throw new PcCommandException('pc_disconnected', `La ${pc.name} no está conectada`);
      }
      const context = await this.control.contextIn(tx, pcId);
      if (!sameContext(request.expected, context)) {
        throw new PcCommandException(
          'stale_context',
          `La ${pc.name} cambió de estado. Revisa el mapa y vuelve a intentarlo`,
        );
      }
      const holder = await this.holder(tx, pcId);
      if (holder && this.inFlight(holder)) {
        throw new PcCommandException('pc_unavailable', `La ${pc.name} ya tiene una orden en curso`);
      }
      const now = this.clock.now();
      const [row] = await tx
        .insert(pcCommands)
        .values({
          id: request.id,
          pcId,
          actor,
          request,
          expected: context,
          action: { kind },
          issuedAt: now,
          expiresAt: new Date(now.getTime() + PC_COMMAND_TTL_SECONDS * 1_000),
        })
        .returning();
      if (!row) throw new Error('No se pudo guardar la orden');
      await tx
        .update(pcControlStates)
        .set({ reservedCommandId: row.id, reservedAt: now })
        .where(eq(pcControlStates.pcId, pcId));
      emit({
        type: 'pc.command_requested',
        version: 1,
        actor,
        payload: {
          commandId: row.id,
          pc,
          kind: row.action.kind,
          expected: { kind: context.kind, revision: context.revision },
          expiresAt: row.expiresAt.toISOString(),
          replacesCommandId: holder?.id ?? null,
        },
      });
      return { row, context };
    });
    if (issued.context) {
      this.watch(issued.row.id, issued.row.expiresAt);
      this.deliver(issued.row, issued.context);
    }
    return responseOf(issued.row);
  }

  /**
   * Respuesta de la PC a una orden suya. Se ignora (con aviso en el log) si no es de esa PC
   * o no corresponde a la orden; repetida no cambia nada y nunca hace retroceder una orden.
   */
  async acknowledge(pcId: string, ack: PcCommandAckMessage): Promise<void> {
    await this.events.inTransaction(async (tx, emit) => {
      const pc = await this.control.lockPc(tx, pcId);
      const [row] = await tx
        .select()
        .from(pcCommands)
        .where(and(eq(pcCommands.id, ack.commandId), eq(pcCommands.pcId, pcId)));
      if (!pc || !row || !matches(row, ack.result)) {
        this.logger.warn(`Acuse que no corresponde a una orden de ${pc?.name ?? 'una PC'}`);
        return;
      }
      const status = ack.result.status;
      if (rank(row.status) === 2) {
        if (canonical(row.lastResult) !== canonical(ack.result)) {
          this.logger.warn(`${pc.name} contradice el resultado de la orden ${row.id}`);
        }
        return;
      }
      if (rank(status) <= rank(row.status)) return;
      const now = this.clock.now();
      await tx
        .update(pcCommands)
        .set({ status, lastResult: ack.result, lastResultAt: now })
        .where(eq(pcCommands.id, row.id));
      const released =
        status === 'applied' ||
        (ack.result.status === 'failed' && FAILURES_WITHOUT_EFFECT.has(ack.result.code));
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
    });
  }

  /**
   * La PC acaba de identificarse (`hello`). Si había aceptado reiniciar o apagar, ese
   * arranque cierra la orden y libera la reserva. Las órdenes aún vigentes se le reenvían:
   * el agente reconoce las que ya tenía por su ID.
   */
  async reconnected(pcId: string): Promise<void> {
    const live = await this.events.inTransaction(async (tx, emit) => {
      const pc = await this.control.lockPc(tx, pcId);
      if (!pc) return { pending: [], context: null };
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
      const pending = await tx
        .select()
        .from(pcCommands)
        .where(
          and(
            eq(pcCommands.pcId, pcId),
            eq(pcCommands.status, 'requested'),
            gt(pcCommands.expiresAt, this.clock.now()),
          ),
        );
      return { pending, context: pending.length ? await this.control.contextIn(tx, pcId) : null };
    });
    for (const row of live.pending) {
      if (live.context) this.deliver(row, live.context);
    }
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
      const [row] = await tx.select().from(pcCommands).where(eq(pcCommands.id, commandId));
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

  /** Orden que reserva la PC, si hay alguna. */
  private async holder(tx: Transaction, pcId: string): Promise<CommandRow | undefined> {
    const [state] = await tx
      .select({ commandId: pcControlStates.reservedCommandId })
      .from(pcControlStates)
      .where(eq(pcControlStates.pcId, pcId));
    if (!state?.commandId) return undefined;
    const [row] = await tx.select().from(pcCommands).where(eq(pcCommands.id, state.commandId));
    return row;
  }

  /**
   * Si la orden puede seguir produciendo su efecto: pedida y sin vencer, o aceptada a la
   * espera del efecto. Un reinicio o apagado aceptado sigue en curso hasta que la PC vuelva.
   */
  private inFlight(row: CommandRow): boolean {
    return (
      (row.status === 'requested' && row.expiresAt > this.clock.now()) || row.status === 'accepted'
    );
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

  /** Envía el contexto vigente y la orden: la PC compara uno con otro antes de ejecutar. */
  private deliver(row: CommandRow, context: PcControlContext): void {
    this.connections.send(row.pcId, {
      type: 'controlState',
      context,
      serverTime: this.clock.now().toISOString(),
    });
    this.connections.send(row.pcId, { type: 'command', command: commandOf(row) });
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
