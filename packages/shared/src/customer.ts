// Cuentas de cliente (REQ-001-01, REQ-001-02, REQ-001-04). Las crea el encargado desde el
// panel; la PC nunca crea ni guarda cuentas.
import { z } from 'zod';

import { idSchema } from './session.js';

/**
 * Estado de una cuenta (pregunta resuelta de la spec 001): "bloqueada" (sanción) y
 * "desactivada" (ya no se usa) tienen el mismo efecto: no puede iniciar sesión ni recibir
 * recargas. El encargado puede pasar de cualquiera a cualquiera y el saldo se conserva.
 */
export const customerStatusSchema = z.enum(['active', 'blocked', 'disabled']);
export type CustomerStatus = z.infer<typeof customerStatusSchema>;

/**
 * Usuario del cliente: de 3 a 32 letras, números, `.`, `_` o `-`, sin espacios ni tildes.
 * Es único sin distinguir mayúsculas (REQ-001-02).
 */
export const customerUsernameSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9._-]{3,32}$/,
    'El usuario debe tener de 3 a 32 letras, números, puntos, guiones o guiones bajos',
  );

/** Contraseña del cliente: mínimo 4 caracteres. El máximo solo protege a argon2. */
export const customerPasswordSchema = z
  .string()
  .min(4, 'La contraseña debe tener al menos 4 caracteres')
  .max(256);

/** Texto opcional: vacío o solo espacios cuenta como "sin dato" (`null`). */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value === '' ? null : (value ?? null)));
}

/**
 * Teléfono venezolano, fijo (2XX) o móvil (4XX). Admite `0412-1234567`,
 * `+58 412 123 45 67`, `(0212) 555.12.34`… y lo guarda normalizado: `+584121234567`.
 */
export const venezuelanPhoneSchema = z.string().transform((value, ctx) => {
  const normalized = normalizeVenezuelanPhone(value);
  if (normalized === null) {
    ctx.addIssue({
      code: 'custom',
      message: 'El teléfono debe ser venezolano, p. ej. 0412-1234567 o +58 412 1234567',
    });
    return z.NEVER;
  }
  return normalized;
});

/** Normaliza un teléfono venezolano a `+58XXXXXXXXXX`, o devuelve `null` si no lo es. */
export function normalizeVenezuelanPhone(value: string): string | null {
  const compact = value.replace(/[\s\-.()]/g, '');
  const national = compact.startsWith('+58')
    ? compact.slice(3)
    : compact.startsWith('0')
      ? compact.slice(1)
      : null;
  return national !== null && /^[24]\d{9}$/.test(national) ? `+58${national}` : null;
}

/** Cuerpo de `POST /customers`: alta de cliente desde el panel (REQ-001-02). */
export const customerCreateRequestSchema = z.object({
  username: customerUsernameSchema,
  password: customerPasswordSchema,
  name: optionalText(100),
  phone: z
    .string()
    .nullish()
    .transform((value) => (value?.trim() ? value : null))
    .pipe(venezuelanPhoneSchema.nullable()),
});
export type CustomerCreateRequest = z.infer<typeof customerCreateRequestSchema>;

/** Cuerpo de `PATCH /customers/:id/status` (REQ-001-04). */
export const customerStatusRequestSchema = z.object({ status: customerStatusSchema });
export type CustomerStatusRequest = z.infer<typeof customerStatusRequestSchema>;

/** Parámetros de búsqueda de `GET /customers`: texto y página. */
export const customerSearchQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type CustomerSearchQuery = z.infer<typeof customerSearchQuerySchema>;

/** Cliente tal como lo ve el panel. Los saldos llegan con T18. */
export const customerSchema = z.object({
  id: idSchema,
  username: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  status: customerStatusSchema,
  createdAt: z.iso.datetime(),
});
export type Customer = z.infer<typeof customerSchema>;

/** Respuesta de `GET /customers`: una página y el total de resultados. */
export const customerPageSchema = z.object({
  items: z.array(customerSchema),
  total: z.int().nonnegative(),
});
export type CustomerPage = z.infer<typeof customerPageSchema>;
