// Protocolo del canal PC ↔ nodo local por WebSocket (plan 001, "Contratos").
//
// Lo hablan el simulador de PCs y, desde la spec 003, el agente en C#. Cada mensaje es un
// objeto JSON con un campo `type` que lo identifica. El nodo valida todo lo que recibe con
// estos esquemas (AGENTS.md: toda entrada externa se valida con zod). Se exportan también
// como JSON Schema para que el lado C# valide los mismos contratos (ADR-0002).
import { z } from 'zod';

import { moneySchema, vesRateSchema } from './money.js';
import { warningMinutesSchema } from './exhaustion.js';
import { pauseLimitSchema, sessionPauseSchema } from './pause.js';
import { idSchema, sessionEndReasonSchema, utcInstantSchema } from './session.js';

/** Versión del protocolo. Sube cuando un cambio deja de ser compatible. */
export const PROTOCOL_VERSION = 1;

// Mismo tipo que `Seconds`, pero sin negativos; así el mínimo también sale en el JSON Schema.
const nonNegativeSeconds = z.int().nonnegative().brand<'Seconds'>();

/**
 * Identificador que la PC pone a una petición (`login`, `logout`, `buyCombo`) para saber a
 * cuál responde un `error` (ADR-0003). Opcional; el nodo lo devuelve tal cual.
 */
export const requestIdSchema = z.string().min(1).max(64);

// ─── PC → nodo ──────────────────────────────────────────────────────────────────────────

/**
 * Primer mensaje al conectar. Incluye la sesión que la PC cree tener: si el nodo tiene una
 * sesión activa en esa PC y la PC dice que no tiene ninguna (se reinició), la cierra
 * (plan 001, "Latidos, cortes de luz y reinicios").
 *
 * La identidad `pcId` es provisional; el registro real con código de instalación es la
 * spec 003 (REQ-003-10).
 */
export const helloMessageSchema = z.object({
  type: z.literal('hello'),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  pcId: idSchema,
  sessionId: idSchema.nullable(),
  /**
   * Tiempo restante que guardaba la PC de esa sesión (REQ-001-63), si lo sabe. Si el nodo la
   * cerró por falta de latidos durante un corte, se queda el menor de los dos antes de
   * responder (pregunta resuelta de la spec 001). Opcional: los agentes que no lo envían
   * siguen siendo compatibles.
   */
  localRemainingSeconds: nonNegativeSeconds.nullable().optional(),
});

/**
 * Latido periódico (cada 10 s). `localRemainingSeconds` es la copia del tiempo restante que
 * guarda la PC (REQ-001-63); el nodo la registra, pero cobra con su propio reloj (ADR-0007).
 */
export const heartbeatMessageSchema = z.object({
  type: z.literal('heartbeat'),
  sessionId: idSchema.nullable(),
  localRemainingSeconds: nonNegativeSeconds.nullable(),
});

/** Inicio de sesión del cliente desde el Shell (REQ-001-20). */
export const loginMessageSchema = z.object({
  type: z.literal('login'),
  requestId: requestIdSchema.optional(),
  username: z.string().trim().min(1).max(64),
  // Límite amplio solo para no calcular argon2 sobre textos enormes.
  password: z.string().min(1).max(256),
});

/** El cliente cierra su sesión desde el Shell (REQ-001-26). */
export const logoutMessageSchema = z.object({
  type: z.literal('logout'),
  requestId: requestIdSchema.optional(),
});

/** El cliente compra un combo con su saldo durante la sesión (REQ-001-85). */
export const buyComboMessageSchema = z.object({
  type: z.literal('buyCombo'),
  requestId: requestIdSchema.optional(),
  comboId: idSchema,
});

/**
 * El Shell pide los combos a la venta para mostrarlos antes de comprar (REQ-001-85). El nodo
 * responde con `combos` (pregunta resuelta de la spec 001).
 */
export const listCombosMessageSchema = z.object({
  type: z.literal('listCombos'),
  requestId: requestIdSchema.optional(),
});

/**
 * El cliente pausa su sesión con cuenta (REQ-002-01). El nodo responde con el `state` en
 * pausa y el mismo `requestId`, o con un `error` `pause_unavailable`.
 */
export const pauseMessageSchema = z.object({
  type: z.literal('pause'),
  requestId: requestIdSchema.optional(),
});

/**
 * El cliente quita la pausa tras confirmar que es él (REQ-002-10). El nodo responde con el
 * `state` sin pausa y el mismo `requestId`.
 */
export const resumeMessageSchema = z.object({
  type: z.literal('resume'),
  requestId: requestIdSchema.optional(),
});

export const pcToNodeMessageSchema = z.discriminatedUnion('type', [
  helloMessageSchema,
  heartbeatMessageSchema,
  loginMessageSchema,
  logoutMessageSchema,
  buyComboMessageSchema,
  listCombosMessageSchema,
  pauseMessageSchema,
  resumeMessageSchema,
]);
export type PcToNodeMessage = z.infer<typeof pcToNodeMessageSchema>;

// ─── nodo → PC ──────────────────────────────────────────────────────────────────────────

/**
 * La pausa tal como la ve la PC: la del mapa más los segundos de pausa que quedan, calculados
 * por el nodo al enviar el `state`. El Shell descuenta desde ahí, sin fiarse del reloj de la PC
 * (ADR-0007; mantenedor, 2026-10-03).
 */
export const pcSessionPauseSchema = sessionPauseSchema.extend({
  secondsLeft: nonNegativeSeconds,
});

/** Sesión con cuenta: saldos en vivo por separado y tiempo total (REQ-001-12, REQ-001-88). */
export const accountSessionStateSchema = z.object({
  kind: z.literal('account'),
  sessionId: idSchema,
  startedAt: utcInstantSchema,
  username: z.string(),
  /** Tarifa copiada al empezar la sesión, por hora (REQ-001-14). */
  ratePerHour: moneySchema,
  /** Horas de combo que quedan. */
  comboSeconds: nonNegativeSeconds,
  /** Saldo en dinero en vivo. */
  money: moneySchema,
  /** Tiempo que paga el saldo en dinero a la tarifa de la sesión (REQ-001-11). */
  moneySeconds: nonNegativeSeconds,
  /** Tiempo total restante: combo + dinero. */
  remainingSeconds: nonNegativeSeconds,
  /**
   * La pausa en curso, o `null` (REQ-002-06). Este campo y los dos siguientes son
   * opcionales: el simulador y los agentes que no conocen la pausa siguen siendo compatibles.
   */
  pause: pcSessionPauseSchema.nullable().optional(),
  /**
   * Pausas que quedan: el mínimo entre las de la sesión y las del día (REQ-002-02,
   * REQ-002-21, REQ-002-24); 0 con la pausa desactivada.
   */
  pausesLeft: z.int().nonnegative().optional(),
  /**
   * Por qué no quedan pausas, para el mensaje del botón Pausar: `null` si quedan
   * (CA-002-04, CA-002-06, REQ-002-23).
   */
  pauseLimit: pauseLimitSchema.nullable().optional(),
  /**
   * Duración máxima de una pausa en el local (REQ-002-20), para la confirmación del Shell
   * («Puedes estar en pausa hasta 15 min»; mantenedor, 2026-10-03).
   */
  pauseMaxSeconds: z.int().positive().optional(),
});

/** Sesión temporal sin cuenta (REQ-001-60, REQ-001-61). */
export const temporarySessionStateSchema = z.object({
  kind: z.literal('temporary'),
  sessionId: idSchema,
  startedAt: utcInstantSchema,
  /** Nombre que puso el encargado, o "Temporal · PC 05 · 18:30". */
  name: z.string(),
  purchasedSeconds: nonNegativeSeconds,
  remainingSeconds: nonNegativeSeconds,
});

export const sessionStateSchema = z.discriminatedUnion('kind', [
  accountSessionStateSchema,
  temporarySessionStateSchema,
]);
export type SessionState = z.infer<typeof sessionStateSchema>;

/**
 * Estado de la PC. El nodo lo envía al conectar, tras cada latido y en cada cambio. La PC
 * obedece: bloqueada o en sesión (ADR-0007). `vesRate` permite mostrar el equivalente en
 * bolívares (REQ-001-13); es `null` mientras no haya tasa (spec 005).
 */
export const stateMessageSchema = z.discriminatedUnion('status', [
  z.object({
    type: z.literal('state'),
    status: z.literal('locked'),
  }),
  z.object({
    type: z.literal('state'),
    status: z.literal('active'),
    session: sessionStateSchema,
    vesRate: vesRateSchema.nullable(),
    /**
     * `requestId` de la petición a la que responde, si responde a una (p. ej. `buyCombo`).
     * Así el Shell distingue la respuesta de un `state` de latido que se cruce. Opcional.
     */
    requestId: requestIdSchema.optional(),
  }),
]);

/** Aviso de que quedan 5 o 1 minutos (REQ-001-24). */
export const warningMessageSchema = z.object({
  type: z.literal('warning'),
  sessionId: idSchema,
  minutesLeft: warningMinutesSchema,
});

/** La sesión terminó; la PC vuelve a la pantalla de bloqueo (REQ-001-25, REQ-001-31). */
export const sessionEndedMessageSchema = z.object({
  type: z.literal('sessionEnded'),
  sessionId: idSchema,
  reason: sessionEndReasonSchema,
});

/** Combo a la venta, tal como lo ve el cliente en el Shell. */
export const pcComboSchema = z.object({
  comboId: idSchema,
  name: z.string().min(1),
  price: moneySchema,
  /** Horas que da el combo, en segundos. */
  seconds: z.int().positive(),
});
export type PcCombo = z.infer<typeof pcComboSchema>;

/**
 * Respuesta a `listCombos`: los combos activos, de menos a más tiempo (REQ-001-81,
 * REQ-001-85). Lleva el `requestId` de la petición, si lo traía.
 */
export const combosMessageSchema = z.object({
  type: z.literal('combos'),
  requestId: requestIdSchema.optional(),
  combos: z.array(pcComboSchema),
});

/** Códigos de error que la PC puede recibir. El texto para el cliente va en `message`. */
export const protocolErrorCodeSchema = z.enum([
  /** El mensaje no cumple el protocolo. */
  'invalid_message',
  /** La PC no está registrada en el nodo (`hello` con un `pcId` desconocido). */
  'unknown_pc',
  /** Usuario o contraseña incorrectos (no se distingue cuál, por seguridad). */
  'invalid_credentials',
  /** Bloqueo temporal tras 5 intentos fallidos (REQ-001-52). */
  'account_locked',
  /** Cuenta bloqueada o desactivada por el encargado (REQ-001-04). */
  'account_inactive',
  /** No hay saldo para al menos 1 minuto (REQ-001-20) o para el combo (REQ-001-85). */
  'insufficient_balance',
  /** La cuenta ya tiene una sesión abierta en otra PC (REQ-001-21). */
  'session_already_active',
  /** La acción necesita una sesión activa en esta PC. */
  'no_active_session',
  /** El combo no existe o está desactivado (REQ-001-81). */
  'combo_unavailable',
  /**
   * No se puede pausar: sesión temporal, pausa desactivada, sin pausas o ya en pausa
   * (REQ-002-11, REQ-002-21, REQ-002-23, REQ-002-24).
   */
  'pause_unavailable',
  /** Error inesperado del nodo. */
  'internal_error',
]);
export type ProtocolErrorCode = z.infer<typeof protocolErrorCodeSchema>;

/**
 * Error con un código estable y un mensaje en español para mostrar al cliente. Lleva el
 * `requestId` de la petición que falló, si lo traía.
 */
export const errorMessageSchema = z.object({
  type: z.literal('error'),
  code: protocolErrorCodeSchema,
  message: z.string().min(1),
  requestId: requestIdSchema.optional(),
});

export const nodeToPcMessageSchema = z.union([
  stateMessageSchema,
  warningMessageSchema,
  sessionEndedMessageSchema,
  combosMessageSchema,
  errorMessageSchema,
]);
export type NodeToPcMessage = z.infer<typeof nodeToPcMessageSchema>;

/**
 * JSON Schema (draft 2020-12) de los dos sentidos del canal, para el agente en C#
 * (spec 003). El build lo escribe en `dist/json-schema/`.
 */
export function pcProtocolJsonSchemas(): Record<'pc-to-node' | 'node-to-pc', unknown> {
  return {
    'pc-to-node': z.toJSONSchema(pcToNodeMessageSchema),
    'node-to-pc': z.toJSONSchema(nodeToPcMessageSchema),
  };
}
