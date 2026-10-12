// Envoltorios privados host ↔ React y servicio → host (REQ-003-63).
import { z } from 'zod';
import { nativeShellNotificationSchema, nativeShellRequestSchema } from './native-protocol.js';

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
]);
export type NativeBridgeRequest = z.infer<typeof nativeBridgeRequestSchema>;
export type NativeBridgeEvent = z.infer<typeof nativeBridgeEventSchema>;
