// Estado de las PCs para el mapa del panel (T38a, REQ-001-31) y canal en vivo del panel.
import { z } from 'zod';

import { exchangeRateStatusSchema } from './exchange-rate.js';
import { microsSchema } from './money.js';
import { pausesUsedSchema, sessionPauseSchema } from './pause.js';
import { idSchema, sessionKindSchema, utcInstantSchema } from './session.js';

const nonNegativeSeconds = z.int().nonnegative().brand<'Seconds'>();

/** La sesión activa de una PC, resumida para el mapa. */
export const pcMapSessionSchema = z.object({
  sessionId: idSchema,
  kind: sessionKindSchema,
  /**
   * Cliente de una sesión con cuenta, para recargarle o venderle un combo desde el mapa;
   * `null` en una temporal.
   */
  customerId: idSchema.nullable(),
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
  /** La pausa en curso, o `null`: la baldosa morada (REQ-002-14, CA-002-08). */
  pause: sessionPauseSchema.nullable(),
  /**
   * Pausas que lleva la cuenta en la sesión y hoy, para el detalle de la PC (REQ-002-13);
   * `null` en una temporal, que no pausa (REQ-002-11).
   */
  pausesUsed: pausesUsedSchema.nullable(),
});
export type PcMapSession = z.infer<typeof pcMapSessionSchema>;

/** Columnas del mapa del panel (diseño: 14 × 7 casillas en la pantalla de 1920×1080). */
export const PC_MAP_COLUMNS = 14;

/** Filas como máximo. Sobra para un local de 40 PCs con pasillos y paredes. */
export const PC_MAP_MAX_ROWS = 30;

/** Una casilla del mapa (REQ-001-45), contando desde 0. */
export const pcMapCellSchema = z.strictObject({
  row: z
    .int()
    .min(0)
    .max(PC_MAP_MAX_ROWS - 1),
  col: z
    .int()
    .min(0)
    .max(PC_MAP_COLUMNS - 1),
});
export type PcMapCell = z.infer<typeof pcMapCellSchema>;

/**
 * Cuerpo de `PUT /pcs/map` (REQ-001-45): la distribución completa. Las PCs que no aparecen
 * se quedan sin posición y van al final del mapa. Ni una PC dos veces ni dos en una casilla.
 */
export const pcMapLayoutRequestSchema = z
  .strictObject({
    positions: z.array(pcMapCellSchema.extend({ pcId: idSchema })).max(500),
  })
  .superRefine(({ positions }, ctx) => {
    const pcs = new Set<string>();
    const cells = new Set<string>();
    positions.forEach((position, index) => {
      if (pcs.has(position.pcId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['positions', index, 'pcId'],
          message: 'Esta PC aparece dos veces',
        });
      }
      const cell = `${String(position.row)}:${String(position.col)}`;
      if (cells.has(cell)) {
        ctx.addIssue({
          code: 'custom',
          path: ['positions', index],
          message: 'Dos PCs en la misma casilla',
        });
      }
      pcs.add(position.pcId);
      cells.add(cell);
    });
  });
export type PcMapLayoutRequest = z.infer<typeof pcMapLayoutRequestSchema>;

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
 * conectar y cada vez que algo cambia, como mucho una vez por segundo. `interrupted` lleva
 * cuántas sesiones interrumpidas hay pendientes de restaurar (REQ-001-66), para el aviso del
 * raíl: se envía al conectar y cuando cambia. `exchangeRate` lleva la tasa vigente y si está
 * desactualizada (REQ-005-36): se envía al conectar, al cambiar la tasa y al cambiar de día.
 */
export const panelMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pcs'), map: pcMapSchema }),
  z.object({ type: z.literal('interrupted'), pending: z.int().nonnegative() }),
  exchangeRateStatusSchema.extend({ type: z.literal('exchangeRate') }),
  /** Cambió el registro de caja o el stock: las pantallas abiertas vuelven a pedirlos. */
  z.object({ type: z.literal('cash') }),
]);
export type PanelMessage = z.infer<typeof panelMessageSchema>;
