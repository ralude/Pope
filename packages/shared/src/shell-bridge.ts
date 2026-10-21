// Envoltorios privados host ↔ React y servicio → host (REQ-003-63).
import { z } from 'zod';
import { nativeShellNotificationSchema, nativeShellRequestSchema } from './native-protocol.js';
import { STAFF_MESSAGE_MAX_CHARACTERS } from './pc-control.js';
import { idSchema } from './session.js';

export const nativeBridgeRequestSchema = z.union([
  z.strictObject({ version: z.literal(1), kind: z.literal('ready') }),
  z.strictObject({
    version: z.literal(1),
    kind: z.literal('request'),
    request: nativeShellRequestSchema,
  }),
]);

export const nativeBridgeEventSchema = z.union([
  z.strictObject({
    version: z.literal(1),
    kind: z.literal('status'),
    status: z.enum(['connecting', 'online', 'offline']),
    pcName: z.string().min(1),
  }),
  z.strictObject({
    version: z.literal(1),
    kind: z.literal('message'),
    message: nativeShellNotificationSchema,
    // Edad de la copia autorizada al enviarla; un host nuevo no reinicia el tiempo.
    elapsedSeconds: z.int().nonnegative(),
  }),
  // T32 · REQ-003-20: mensaje del encargado ya validado por el agente. Lo muestra el host en
  // una ventana nativa; React no lo recibe. Texto plano, nunca HTML.
  z.strictObject({
    version: z.literal(1),
    kind: z.literal('staffMessage'),
    commandId: idSchema,
    text: z.string().min(1).max(STAFF_MESSAGE_MAX_CHARACTERS),
  }),
]);
export type NativeBridgeRequest = z.infer<typeof nativeBridgeRequestSchema>;
export type NativeBridgeEvent = z.infer<typeof nativeBridgeEventSchema>;
