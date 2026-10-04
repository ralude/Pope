// Órdenes tipadas y efectos nativos (spec 003, T02b; ADR-0017).
import { z } from 'zod';

import { maintenanceActorSchema, maintenanceExitSchema } from './pc-maintenance.js';
import { idSchema, utcInstantSchema } from './session.js';

export const PC_COMMAND_TTL_SECONDS = 30;
export const STAFF_MESSAGE_DURATION_SECONDS = 5;
export const STAFF_MESSAGE_MAX_CHARACTERS = 1_000;

const freeContext = z.strictObject({ kind: z.literal('free'), revision: idSchema });
const sessionContext = z.strictObject({
  kind: z.literal('session'),
  revision: idSchema,
  sessionId: idSchema,
});
const maintenanceContext = z.strictObject({
  kind: z.literal('maintenance'),
  revision: idSchema,
  maintenanceId: idSchema,
});
export const pcControlContextSchema = z.discriminatedUnion('kind', [
  freeContext,
  sessionContext,
  maintenanceContext,
]);
export type PcControlContext = z.infer<typeof pcControlContextSchema>;
const clientContext = z.union([freeContext, sessionContext]);
const busyContext = z.union([sessionContext, maintenanceContext]);
const messageText = z.string().min(1).max(STAFF_MESSAGE_MAX_CHARACTERS);

/** Panel → nodo: el actor viene de la cookie, no del cuerpo. */
export const pcCommandRequestSchema = z.union([
  z.strictObject({ id: idSchema, kind: z.literal('lock'), expected: clientContext }),
  z.strictObject({
    id: idSchema,
    kind: z.literal('showMessage'),
    expected: clientContext,
    text: messageText,
  }),
  z.strictObject({ id: idSchema, kind: z.literal('startMaintenance'), expected: freeContext }),
  z.strictObject({ id: idSchema, kind: z.literal('endMaintenance'), expected: maintenanceContext }),
  z.strictObject({ id: idSchema, kind: z.enum(['restart', 'powerOff']), expected: freeContext }),
  z.strictObject({
    id: idSchema,
    kind: z.enum(['restart', 'powerOff']),
    expected: busyContext,
    confirmed: z.literal(true),
  }),
]);
export type PcCommandRequest = z.infer<typeof pcCommandRequestSchema>;

export const pcCommandErrorSchema = z.strictObject({
  code: z.enum([
    'unknown_pc',
    'pc_disconnected',
    'pc_unavailable',
    'stale_context',
    'confirmation_required',
    'idempotency_conflict',
    'invalid_command',
    'internal_error',
  ]),
  message: z.string().min(1),
});

export const pcCommandKindSchema = z.enum([
  'lock',
  'restart',
  'powerOff',
  'showMessage',
  'startMaintenance',
  'endMaintenance',
]);
export const pcNativeActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('lock') }),
  z.strictObject({ kind: z.literal('restart') }),
  z.strictObject({ kind: z.literal('powerOff') }),
  z.strictObject({ kind: z.literal('showMessage'), text: messageText }),
  z.strictObject({
    kind: z.literal('startMaintenance'),
    maintenanceId: idSchema,
    source: z.enum(['local', 'panel']),
  }),
  z.strictObject({ kind: z.literal('endMaintenance'), maintenanceId: idSchema, exitId: idSchema }),
]);

export const pcCommandSchema = z.strictObject({
  id: idSchema,
  pcId: idSchema,
  actor: maintenanceActorSchema,
  expected: pcControlContextSchema,
  issuedAt: utcInstantSchema,
  expiresAt: utcInstantSchema,
  action: pcNativeActionSchema,
});
export type PcCommand = z.infer<typeof pcCommandSchema>;
export const pcCommandMessageSchema = z.strictObject({
  type: z.literal('command'),
  command: pcCommandSchema,
});

export const pcCommandFailureCodeSchema = z.enum([
  'expired',
  'stale_context',
  'pc_unavailable',
  'invalid_action',
  'native_failure',
]);
/** Reiniciar/apagar no tienen resultado applied: solo aceptación de Windows. */
export const pcCommandResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('accepted'), kind: pcCommandKindSchema }),
  z.strictObject({
    status: z.literal('applied'),
    effect: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('lock') }),
      z.strictObject({ kind: z.literal('showMessage') }),
      z.strictObject({
        kind: z.literal('startMaintenance'),
        maintenanceId: idSchema,
        startedAt: utcInstantSchema,
      }),
      z.strictObject({ kind: z.literal('endMaintenance'), exit: maintenanceExitSchema }),
    ]),
  }),
  z.strictObject({
    status: z.literal('failed'),
    kind: pcCommandKindSchema,
    code: pcCommandFailureCodeSchema,
    message: z.string().min(1),
  }),
]);
export type PcCommandResult = z.infer<typeof pcCommandResultSchema>;
export const pcCommandAckMessageSchema = z.strictObject({
  type: z.literal('commandAck'),
  commandId: idSchema,
  occurredAt: utcInstantSchema,
  result: pcCommandResultSchema,
});
export type PcCommandAckMessage = z.infer<typeof pcCommandAckMessageSchema>;

export const pcCommandStatusSchema = z.enum([
  'requested',
  'accepted',
  'applied',
  'failed',
  'expired',
  'cancelled',
]);
export const pcCommandResponseSchema = z.strictObject({
  command: pcCommandSchema,
  status: pcCommandStatusSchema,
  lastResult: pcCommandResultSchema.nullable(),
});

/**
 * Elegibilidad de una orden nueva; la deduplicación durable corresponde al journal.
 * nowMs referencia al reloj del nodo; la PC lo avanza con reloj monotónico, no con Date.now.
 */
export function isPcCommandCurrent(
  command: PcCommand,
  context: PcControlContext,
  nowMs: number,
): boolean {
  const issued = Date.parse(command.issuedAt);
  const expires = Date.parse(command.expiresAt);
  if (
    !Number.isFinite(nowMs) ||
    nowMs < issued ||
    nowMs >= expires ||
    expires - issued !== PC_COMMAND_TTL_SECONDS * 1_000
  )
    return false;
  const expected = command.expected;
  if (expected.revision !== context.revision || expected.kind !== context.kind) return false;
  if (expected.kind === 'session')
    return context.kind === 'session' && expected.sessionId === context.sessionId;
  if (expected.kind === 'maintenance')
    return context.kind === 'maintenance' && expected.maintenanceId === context.maintenanceId;
  return true;
}
