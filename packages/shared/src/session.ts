// Conceptos de sesión compartidos por el protocolo de la PC y los eventos.
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

/** Identificador de Pope: UUIDv7 (ordenable por fecha de creación). */
export const idSchema = z.uuidv7();

/** Genera un id nuevo (UUIDv7). Los generados en el mismo proceso salen en orden. */
export function newId(): string {
  return uuidv7();
}

/** Instante en UTC, en formato ISO 8601 con `Z` (AGENTS.md: fechas en UTC). */
export const utcInstantSchema = z.iso.datetime();

/** Sesión con cuenta de cliente o temporal sin cuenta (REQ-001-22). */
export const sessionKindSchema = z.enum(['account', 'temporary']);
export type SessionKind = z.infer<typeof sessionKindSchema>;

/**
 * Por qué se cerró una sesión (REQ-001-31): la cerró el cliente, la cerró el encargado,
 * se agotó el saldo o el tiempo, o la PC dejó de enviar latidos (REQ-001-27).
 */
export const sessionEndReasonSchema = z.enum(['customer', 'staff', 'exhausted', 'no_heartbeat']);
export type SessionEndReason = z.infer<typeof sessionEndReasonSchema>;
