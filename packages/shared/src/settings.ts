// Ajustes del nodo que cambia el administrador desde el panel (plan 001, tabla `settings`).
import { z } from 'zod';

/** Menos sesiones temporales de respaldo por PC que este mínimo no se permiten (REQ-001-64). */
export const MIN_TEMPORARY_SESSIONS_KEPT = 3;

/**
 * Qué pasa cuando una pausa llega a su duración máxima (REQ-002-22): a) se vuelve a cobrar
 * aunque la PC siga en la pantalla de pausa, o b) se cierra la sesión y se libera la PC.
 */
export const pauseOverrunSchema = z.enum(['resume_billing', 'close']);
export type PauseOverrun = z.infer<typeof pauseOverrunSchema>;

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
  /**
   * Si se puede vender un producto sin stock, dejándolo en negativo (REQ-005-12): 1 sí, 0 no.
   * Apagado por defecto. Es un número, como los demás ajustes, para que valga el mismo evento.
   */
  allowNegativeStock: z.number().int().min(0).max(1),
  /**
   * Nombre del local, para el reporte del cierre (REQ-005-51) y la cabecera del panel. Por
   * defecto "Pope" hasta que el administrador lo escriba.
   */
  localName: z.string().trim().min(1, 'Escribe el nombre del local').max(60),
  /**
   * Si los clientes pueden pausar su sesión en este local (REQ-002-23): 1 sí, 0 no. Es un
   * número, como `allowNegativeStock`, para que valga el mismo evento (mantenedor, 2026-10-03).
   */
  pauseEnabled: z.number().int().min(0).max(1),
  /** Duración máxima de cada pausa (REQ-002-20). Por defecto 15 min; de 1 min a 1 h. */
  pauseMaxSeconds: z.number().int().min(60).max(3600),
  /** Pausas como mucho en una sesión (REQ-002-21). Por defecto 3. */
  pauseMaxPerSession: z.number().int().min(1).max(20),
  /**
   * Pausas como mucho por cuenta en un día de Caracas, sumando todas sus sesiones
   * (REQ-002-24). Por defecto 5: cerrar y volver a entrar no da pausas nuevas sin límite.
   */
  pauseMaxPerDay: z.number().int().min(1).max(50),
  /** Qué pasa al llegar a la duración máxima (REQ-002-22). Por defecto, volver a cobrar. */
  pauseOverrun: pauseOverrunSchema,
});
export type Settings = z.infer<typeof settingsSchema>;

/** Nombre de un ajuste, sacado del esquema: un ajuste nuevo entra solo en el evento. */
export const settingKeySchema = settingsSchema.keyof();
export type SettingKey = z.infer<typeof settingKeySchema>;

/** Valores con los que arranca un nodo nuevo. */
export const DEFAULT_SETTINGS: Settings = {
  heartbeatGraceSeconds: 180,
  temporarySessionsKeptPerPc: MIN_TEMPORARY_SESSIONS_KEPT,
  allowNegativeStock: 0,
  localName: 'Pope',
  pauseEnabled: 1,
  pauseMaxSeconds: 900,
  pauseMaxPerSession: 3,
  pauseMaxPerDay: 5,
  pauseOverrun: 'resume_billing',
};

/** Cuerpo de `PUT /settings`: uno o varios ajustes; los que no vienen no cambian. */
export const settingsUpdateRequestSchema = settingsSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Indica al menos un ajuste');
export type SettingsUpdateRequest = z.infer<typeof settingsUpdateRequestSchema>;
