// V2 para el agente autenticado; v1 sigue operativo hasta T13 (spec 003, T02c).
import { z } from 'zod';

import {
  pcCommandAckMessageSchema,
  pcCommandMessageSchema,
  pcControlContextSchema,
} from './pc-control.js';
import {
  maintenanceExitAcknowledgedMessageSchema,
  maintenanceExitMessageSchema,
  maintenanceStateMessageSchema,
  technicalErrorMessageSchema,
  technicalLoginMessageSchema,
} from './pc-maintenance.js';
import { NATIVE_PC_PROTOCOL_VERSION, pcAuthenticationErrorSchema } from './pc-registration.js';
import { moneySchema } from './money.js';
import {
  accountSessionStateSchema,
  buyComboMessageSchema,
  combosMessageSchema,
  errorMessageSchema,
  heartbeatMessageSchema,
  helloMessageSchema,
  listCombosMessageSchema,
  loginMessageSchema,
  logoutMessageSchema,
  pauseMessageSchema,
  pcComboSchema,
  pcSessionPauseSchema,
  resumeMessageSchema,
  sessionEndedMessageSchema,
  stateMessageSchema,
  temporarySessionStateSchema,
  warningMessageSchema,
} from './protocol.js';
import { idSchema, utcInstantSchema } from './session.js';

const helloBase = helloMessageSchema.strict().extend({
  protocolVersion: z.literal(NATIVE_PC_PROTOCOL_VERSION),
  pendingMaintenanceExitId: idSchema.nullable(),
});
export const nativeHelloMessageSchema = z.discriminatedUnion('recoveryState', [
  helloBase.extend({ recoveryState: z.literal('known'), controlContext: pcControlContextSchema }),
  helloBase.extend({
    recoveryState: z.literal('unknown'),
    controlContext: z.null(),
    sessionId: z.null(),
    localRemainingSeconds: z.null().optional(),
  }),
]);
export const nativeHeartbeatMessageSchema = heartbeatMessageSchema.strict().extend({
  controlContext: pcControlContextSchema.nullable(),
});

/** Solo puente local: el servicio genera el registro de salida, incluso sin nodo. */
export const endMaintenanceRequestSchema = z.strictObject({
  type: z.literal('endMaintenance'),
  requestId: idSchema,
  maintenanceId: idSchema,
});
const clientRequests = [
  loginMessageSchema.strict(),
  logoutMessageSchema.strict(),
  buyComboMessageSchema.strict(),
  listCombosMessageSchema.strict(),
  pauseMessageSchema.strict(),
  resumeMessageSchema.strict(),
] as const;
export const nativeShellRequestSchema = z.union([
  ...clientRequests,
  technicalLoginMessageSchema,
  endMaintenanceRequestSchema,
]);
export type NativeShellRequest = z.infer<typeof nativeShellRequestSchema>;

export const nativePcToNodeMessageSchema = z.union([
  nativeHelloMessageSchema,
  nativeHeartbeatMessageSchema,
  ...clientRequests,
  technicalLoginMessageSchema,
  maintenanceExitMessageSchema,
  pcCommandAckMessageSchema,
]);
export type NativePcToNodeMessage = z.infer<typeof nativePcToNodeMessageSchema>;

const nativeSessionState = z.discriminatedUnion('kind', [
  accountSessionStateSchema.strict().extend({
    ratePerHour: moneySchema.strict(),
    money: moneySchema.strict(),
    pause: pcSessionPauseSchema.strict().nullable().optional(),
  }),
  temporarySessionStateSchema.strict(),
]);
export const nativeStateMessageSchema = z.discriminatedUnion('status', [
  stateMessageSchema.options[0].strict(),
  stateMessageSchema.options[1].strict().extend({ session: nativeSessionState }),
]);
export const nativeControlStateMessageSchema = z.strictObject({
  type: z.literal('controlState'),
  context: pcControlContextSchema,
  serverTime: utcInstantSchema,
});
export const nativeAuthenticationErrorMessageSchema = pcAuthenticationErrorSchema.extend({
  type: z.literal('pcAuthenticationError'),
});
const shellNotifications = [
  nativeStateMessageSchema,
  nativeControlStateMessageSchema,
  maintenanceStateMessageSchema,
  warningMessageSchema.strict(),
  sessionEndedMessageSchema.strict(),
  combosMessageSchema.strict().extend({
    combos: z.array(pcComboSchema.strict().extend({ price: moneySchema.strict() })),
  }),
  errorMessageSchema.strict(),
  technicalErrorMessageSchema,
  nativeAuthenticationErrorMessageSchema,
] as const;
/** Las órdenes nativas se consumen en C#, no se reenvían al JavaScript del Shell. */
export const nativeShellNotificationSchema = z.union(shellNotifications);
export type NativeShellNotification = z.infer<typeof nativeShellNotificationSchema>;
export const nativeNodeToPcMessageSchema = z.union([
  ...shellNotifications,
  pcCommandMessageSchema,
  maintenanceExitAcknowledgedMessageSchema,
]);
export type NativeNodeToPcMessage = z.infer<typeof nativeNodeToPcMessageSchema>;
