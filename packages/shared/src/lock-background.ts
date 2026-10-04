import { z } from 'zod';

import { lockBackgroundImageSchema } from './lock-background-image.js';
import { maintenanceActorSchema } from './pc-maintenance.js';
import { utcInstantSchema } from './session.js';

/** Respuesta HTTP global: distingue el valor inicial del último cambio del administrador. */
export const lockBackgroundSnapshotSchema = z.union([
  z.strictObject({
    revision: z.literal(0),
    background: z.null(),
    changedAt: z.null(),
    changedBy: z.null(),
  }),
  z.strictObject({
    revision: z.int().positive(),
    background: lockBackgroundImageSchema.nullable(),
    changedAt: utcInstantSchema,
    changedBy: maintenanceActorSchema,
  }),
]);
export type LockBackgroundSnapshot = z.infer<typeof lockBackgroundSnapshotSchema>;

/** Aviso en vivo y en hello: solo metadatos, misma forma al volver al fondo por defecto. */
export const lockBackgroundMessageSchema = z.strictObject({
  type: z.literal('lockBackground'),
  revision: z.int().nonnegative(),
  background: lockBackgroundImageSchema.nullable(),
});
export type LockBackgroundMessage = z.infer<typeof lockBackgroundMessageSchema>;

/** Progreso exclusivamente local, separado de state y de la verificación de la huella. */
export const lockBackgroundProgressMessageSchema = z.discriminatedUnion('stage', [
  z.strictObject({
    type: z.literal('backgroundProgress'),
    revision: z.int().nonnegative(),
    stage: z.literal('downloading'),
    percent: z.int().min(0).max(100),
  }),
  z.strictObject({
    type: z.literal('backgroundProgress'),
    revision: z.int().nonnegative(),
    stage: z.enum(['verifying', 'ready']),
  }),
  z.strictObject({
    type: z.literal('backgroundProgress'),
    revision: z.int().nonnegative(),
    stage: z.literal('failed'),
    code: z.enum(['download_failed', 'hash_mismatch', 'invalid_image']),
  }),
]);
export type LockBackgroundProgressMessage = z.infer<typeof lockBackgroundProgressMessageSchema>;
export const lockBackgroundErrorSchema = z.strictObject({
  code: z.enum([
    'too_large',
    'unsupported_media_type',
    'invalid_image',
    'background_not_found',
    'internal_error',
  ]),
  message: z.string().min(1),
});
