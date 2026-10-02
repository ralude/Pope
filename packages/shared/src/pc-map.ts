// Estado de las PCs para el mapa del panel (T38a, REQ-001-31) y canal en vivo del panel.
import { z } from 'zod';

import { microsSchema } from './money.js';
import { idSchema, sessionKindSchema, utcInstantSchema } from './session.js';

const nonNegativeSeconds = z.int().nonnegative().brand<'Seconds'>();

/** La sesión activa de una PC, resumida para el mapa. */
export const pcMapSessionSchema = z.object({
  sessionId: idSchema,
  kind: sessionKindSchema,
  /** Usuario del cliente, o nombre de la sesión temporal. */
  who: z.string(),
  /** Quién la abrió: el cliente, o el nombre del encargado (REQ-001-31). */
  openedBy: z.string(),
  startedAt: utcInstantSchema,
  /**
   * Tiempo restante cuando se cobró por última vez (`billedUntil`). El panel resta el tiempo
   * pasado desde entonces para contar en vivo entre una actualización y otra.
   */
  remainingSeconds: nonNegativeSeconds,
  billedUntil: utcInstantSchema,
  rateMicrosPerHour: microsSchema,
  /** Con cuenta: saldo en dinero en vivo. Temporal: lo cobrado en total. */
  amountMicros: microsSchema,
  /** Con cuenta: horas de combo que le quedan; temporal: 0. */
  comboSeconds: nonNegativeSeconds,
  /** Quedan menos de 5 min (REQ-001-24): la raya roja del mapa. */
  ending: z.boolean(),
});
export type PcMapSession = z.infer<typeof pcMapSessionSchema>;

/** Una PC del mapa. */
export const pcMapItemSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** Posición guardada en el mapa (REQ-001-45); `null` hasta que se organice. */
  row: z.int().nonnegative().nullable(),
  col: z.int().nonnegative().nullable(),
  /** La PC tiene abierto el canal con el nodo. */
  connected: z.boolean(),
  session: pcMapSessionSchema.nullable(),
});
export type PcMapItem = z.infer<typeof pcMapItemSchema>;

/** Respuesta de `GET /pcs/map`: todas las PCs, por nombre. */
export const pcMapSchema = z.object({
  pcs: z.array(pcMapItemSchema),
  /** Cuándo se calculó, en el reloj del nodo. */
  at: utcInstantSchema,
});
export type PcMap = z.infer<typeof pcMapSchema>;

/** Ruta del canal en vivo del panel: `ws://nodo:3000/panel`, con la cookie del personal. */
export const PANEL_CHANNEL_PATH = '/panel';

/** Código de cierre del canal del panel cuando no hay sesión del personal válida. */
export const PANEL_UNAUTHORIZED_CLOSE = 4401;

/**
 * Mensajes del nodo al panel por el canal en vivo. `pcs` lleva el mapa completo: se envía al
 * conectar y cada vez que algo cambia, como mucho una vez por segundo.
 */
export const panelMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pcs'), map: pcMapSchema }),
]);
export type PanelMessage = z.infer<typeof panelMessageSchema>;
