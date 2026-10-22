// Encendido por Wake-on-LAN (spec 003, T33; REQ-003-22). El nodo envía el paquete mágico:
// no es una orden a una PC apagada, y enviarlo no demuestra que la PC arranque.
import { z } from 'zod';

import { idSchema, utcInstantSchema } from './session.js';

/** Plazo tras el cual el panel avisa de que la PC no conectó (sin diagnosticar avería). */
export const PC_WAKE_TIMEOUT_SECONDS = 120;

export const pcWakeRequestSchema = z.strictObject({ id: idSchema });
export type PcWakeRequest = z.infer<typeof pcWakeRequestSchema>;

export const pcWakeSchema = z.strictObject({
  requestId: idSchema,
  requestedAt: utcInstantSchema,
  /** `requestedAt` + 120 s: a partir de aquí el panel avisa (REQ-003-22). */
  deadline: utcInstantSchema,
});
export type PcWake = z.infer<typeof pcWakeSchema>;

export const pcWakeResponseSchema = z.strictObject({ pcId: idSchema, wake: pcWakeSchema });
export type PcWakeResponse = z.infer<typeof pcWakeResponseSchema>;

export const pcWakeErrorSchema = z.strictObject({
  code: z.enum([
    'unknown_pc',
    'pc_connected',
    'mac_unknown',
    'idempotency_conflict',
    'wake_failed',
  ]),
  message: z.string().min(1),
});
