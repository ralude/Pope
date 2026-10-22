// Revocación de una PC conservando su sesión (spec 003, T34; REQ-003-11, REQ-002-33, ADR-0020 a
// ADR-0022; diseño aprobado en `docs/specs/003-bloqueo-de-pc/diseno-t34.md`). Revocar,
// revincular y autorizar continuar son del encargado y del administrador; el nodo valida el rol
// y la sesión en cada acción. La PC nunca confirma nada: el cobro del nodo solo llega hasta su
// último contacto.
import { z } from 'zod';

import { pcRefSchema } from './events.js';
import { idSchema, utcInstantSchema } from './session.js';

/** `POST /pcs/:pcId/revoke`: el ID hace idempotente la petición (doble clic, reintento). */
export const pcRevokeRequestSchema = z.strictObject({ id: idSchema });
export type PcRevokeRequest = z.infer<typeof pcRevokeRequestSchema>;

export const pcRevokeResponseSchema = z.strictObject({
  pc: pcRefSchema,
  revokedAt: utcInstantSchema,
  /** La sesión que queda retenida, si la PC tenía una. */
  heldSessionId: idSchema.nullable(),
});
export type PcRevokeResponse = z.infer<typeof pcRevokeResponseSchema>;

/** `POST /pcs/:pcId/continue`: autoriza que la sesión retenida siga tras revincular la PC. */
export const pcContinueRequestSchema = z.strictObject({ id: idSchema, sessionId: idSchema });
export type PcContinueRequest = z.infer<typeof pcContinueRequestSchema>;

export const pcContinueResponseSchema = z.strictObject({
  sessionId: idSchema,
  /** Lo que duró la retención; no se cobró ni gastó pausa en ese intervalo. */
  heldSeconds: z.int().nonnegative(),
});
export type PcContinueResponse = z.infer<typeof pcContinueResponseSchema>;

export const pcRevocationErrorSchema = z.strictObject({
  code: z.enum([
    'unknown_pc',
    'pc_not_registered',
    'pc_unavailable',
    'pc_not_held',
    'pc_not_relinked',
    'pc_disconnected',
    'idempotency_conflict',
  ]),
  message: z.string().min(1),
});
