// Contratos de mantenimiento, no del mecanismo elevado de Windows (spec 003, T02a).
import { z } from 'zod';

import { actorSchema, pcRefSchema } from './events.js';
import { idSchema, utcInstantSchema } from './session.js';
import { staffPasswordSchema, staffUsernameSchema } from './staff.js';

export const TECHNICAL_LOGIN_MAX_FAILURES = 10;
export const TECHNICAL_LOGIN_LOCK_SECONDS = 60;

/** El nodo deriva el actor del login o de la cookie; el solicitante no lo impone. */
export const maintenanceActorSchema = actorSchema.options[1];
export const maintenanceSourceSchema = z.enum(['local', 'panel']);

export const technicalLoginMessageSchema = z.strictObject({
  type: z.literal('technicalLogin'),
  requestId: idSchema,
  username: staffUsernameSchema,
  password: staffPasswordSchema,
});
export type TechnicalLoginMessage = z.infer<typeof technicalLoginMessageSchema>;

/** Entrada ya aplicada y confirmada; no representa una mera solicitud. */
export const pcMaintenanceSchema = z.strictObject({
  id: idSchema,
  pc: pcRefSchema,
  actor: maintenanceActorSchema,
  source: maintenanceSourceSchema,
  startedAt: utcInstantSchema,
});
export type PcMaintenance = z.infer<typeof pcMaintenanceSchema>;

export const maintenanceStateMessageSchema = z.strictObject({
  type: z.literal('maintenanceState'),
  maintenance: pcMaintenanceSchema.nullable(),
  requestId: idSchema.optional(),
});

/**
 * Registro durable de salida local. El nodo recupera el actor de la entrada autorizada.
 * El id no cambia al retransmitir; duración monotónica, reloj UTC solo como referencia.
 */
export const maintenanceExitSchema = z.strictObject({
  id: idSchema,
  maintenanceId: idSchema,
  endedAt: utcInstantSchema,
  durationSeconds: z.int().nonnegative(),
});
export type MaintenanceExit = z.infer<typeof maintenanceExitSchema>;

export const maintenanceExitMessageSchema = z.strictObject({
  type: z.literal('maintenanceExit'),
  exit: maintenanceExitSchema,
});
export const maintenanceExitAcknowledgedMessageSchema = z.strictObject({
  type: z.literal('maintenanceExitAcknowledged'),
  exitId: idSchema,
  maintenanceId: idSchema,
});

export const technicalErrorCodeSchema = z.enum([
  'invalid_credentials',
  'technical_login_locked',
  'staff_inactive',
  'forbidden',
  'pc_unavailable',
  'maintenance_unavailable',
  'unknown_maintenance',
  'invalid_exit',
  'internal_error',
]);
export const technicalErrorMessageSchema = z.strictObject({
  type: z.literal('technicalError'),
  requestId: idSchema,
  code: technicalErrorCodeSchema,
  message: z.string().min(1),
  lockedUntil: utcInstantSchema.optional(),
});
export type TechnicalErrorMessage = z.infer<typeof technicalErrorMessageSchema>;
