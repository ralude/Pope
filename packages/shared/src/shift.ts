// Turno de caja mínimo (T17): solo abrir y cerrar. La spec 005 añade el fondo inicial, el
// conteo al cerrar y las diferencias (REQ-005-40, REQ-005-42).
import { z } from 'zod';

import { idSchema } from './session.js';

/**
 * Turno de caja de un miembro del personal. Las recargas y los cobros en caja quedan
 * ligados a él (REQ-001-03, REQ-001-60). Cada uno tiene como mucho uno abierto.
 */
export const cashShiftSchema = z.object({
  id: idSchema,
  staffId: idSchema,
  openedAt: z.iso.datetime(),
  /** `null` mientras está abierto. */
  closedAt: z.iso.datetime().nullable(),
});
export type CashShift = z.infer<typeof cashShiftSchema>;

/** Respuesta de `GET /shifts/current`: el turno abierto de quien pregunta, si tiene. */
export const currentShiftResponseSchema = z.object({ shift: cashShiftSchema.nullable() });
export type CurrentShiftResponse = z.infer<typeof currentShiftResponseSchema>;
