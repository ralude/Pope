// Ajustes del nodo que cambia el administrador desde el panel (plan 001, tabla `settings`).
import { z } from 'zod';

/** Menos sesiones temporales de respaldo por PC que este mínimo no se permiten (REQ-001-64). */
export const MIN_TEMPORARY_SESSIONS_KEPT = 3;

/**
 * Ajustes del nodo local. Cada uno tiene su valor por defecto; el administrador puede
 * cambiarlos dentro de estos límites.
 */
export const settingsSchema = z.strictObject({
  /**
   * Tiempo sin latidos tras el cual el nodo cierra la sesión de una PC (REQ-001-27). Por
   * defecto 3 min. Entre 30 s y 30 min: menos cerraría sesiones por un corte de red breve.
   */
  heartbeatGraceSeconds: z.number().int().min(30).max(1800),
  /** Sesiones temporales que el panel conserva por PC (REQ-001-64). Mínimo 3. */
  temporarySessionsKeptPerPc: z.number().int().min(MIN_TEMPORARY_SESSIONS_KEPT).max(100),
});
export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;

export const settingKeySchema = z.enum(['heartbeatGraceSeconds', 'temporarySessionsKeptPerPc']);

/** Valores con los que arranca un nodo nuevo. */
export const DEFAULT_SETTINGS: Settings = {
  heartbeatGraceSeconds: 180,
  temporarySessionsKeptPerPc: MIN_TEMPORARY_SESSIONS_KEPT,
};

/** Cuerpo de `PUT /settings`: uno o varios ajustes; los que no vienen no cambian. */
export const settingsUpdateRequestSchema = settingsSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Indica al menos un ajuste');
export type SettingsUpdateRequest = z.infer<typeof settingsUpdateRequestSchema>;
