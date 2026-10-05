// Esquema de la base de datos con Drizzle (ADR-0004). Cada tarea añade aquí sus tablas y
// genera la migración con `pnpm --filter @pope/server db:generate`.
//
// Convenciones (plan 001): ids UUIDv7, fechas `timestamptz` en UTC, importes `bigint` en
// micro-unidades (ADR-0015) y tiempos en segundos `integer`.
import type {
  Actor,
  CashByMethod,
  CashGroup,
  CashMethod,
  CashSource,
  ComboSnapshot,
  Currency,
  CustomerStatus,
  ExchangeRateSource,
  LedgerKind,
  PaymentMethod,
  SessionEndReason,
  SessionKind,
  StaffRole,
  StockMovementKind,
  Wallet,
  Weekday,
} from '@pope/shared';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  foreignKey,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Eventos inmutables de auditoría y sincronización (REQ-001-30, ADR-0008). Se escriben en
 * la misma transacción que el cambio que describen y nunca se modifican, salvo `sent_at`,
 * que marca el envío a la nube (spec 006).
 */
export const events = pgTable('events', {
  /** Id del evento (UUIDv7). La nube lo usa para insertar de forma idempotente. */
  id: uuid('id').primaryKey(),
  /** Orden de los eventos en este nodo: coincide con el orden en que se confirmaron. */
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity().unique().notNull(),
  type: text('type').notNull(),
  version: integer('version').notNull(),
  actor: jsonb('actor').$type<Actor>().notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});

/** Personal del local: encargados, administradores y dueño (REQ-001-40). */
export const staff = pgTable(
  'staff',
  {
    id: uuid('id').primaryKey(),
    /** Tal cual lo escribieron; es único sin distinguir mayúsculas. */
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role').$type<StaffRole>().notNull(),
    /** Hash argon2id (REQ-001-51). */
    passwordHash: text('password_hash').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('staff_username_lower_idx').on(sql`lower(${t.username})`),
    check('staff_role_check', sql`${t.role} in ('encargado', 'administrador', 'dueno')`),
  ],
);

/**
 * Sesiones del personal en el panel (pregunta resuelta de la spec 001): la cookie lleva un
 * token aleatorio y aquí solo se guarda su hash. Borrar la fila cierra la sesión.
 */
export const staffSessions = pgTable(
  'staff_sessions',
  {
    id: uuid('id').primaryKey(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'cascade' }),
    /** SHA-256 del token de la cookie. */
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    /** Se renueva con el uso: 7 días desde la última renovación. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('staff_sessions_staff_id_idx').on(t.staffId)],
);

/**
 * Cuentas de cliente (REQ-001-01, REQ-001-02, REQ-001-04). Se crean solo desde el panel.
 */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey(),
    /** Tal cual lo escribieron; es único sin distinguir mayúsculas. */
    username: text('username').notNull(),
    /** Hash argon2id (REQ-001-51). */
    passwordHash: text('password_hash').notNull(),
    name: text('name'),
    /** Teléfono venezolano normalizado: +58XXXXXXXXXX. */
    phone: text('phone'),
    status: text('status').$type<CustomerStatus>().notNull().default('active'),
    /** Intentos fallidos seguidos desde el último login correcto o el último bloqueo. */
    failedLogins: integer('failed_logins').notNull().default(0),
    /** Bloqueo temporal por intentos (REQ-001-52): no puede entrar hasta esta hora. */
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('customers_username_lower_idx').on(sql`lower(${t.username})`),
    check('customers_status_check', sql`${t.status} in ('active', 'blocked', 'disabled')`),
  ],
);

/**
 * Turnos de caja (T17): la caja del local, una abierta como mucho (REQ-005-44). La spec 005
 * añade el fondo, el conteo y las diferencias. Los cobros en caja apuntan aquí (REQ-001-03).
 * `staff_id` es quien la abrió.
 */
export const cashShifts = pgTable(
  'cash_shifts',
  {
    id: uuid('id').primaryKey(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    /** `null` mientras está abierto. */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** Fondo inicial en efectivo USD y Bs, en µ-unidades (REQ-005-40). */
    openingCashUsdMicros: bigint('opening_cash_usd_micros', { mode: 'number' })
      .notNull()
      .default(0),
    openingCashVesMicros: bigint('opening_cash_ves_micros', { mode: 'number' })
      .notNull()
      .default(0),
    /**
     * Lo esperado y lo contado por método al cerrar (REQ-005-42). Lo esperado se guarda, para
     * que el reporte no cambie después.
     */
    expected: jsonb('expected').$type<CashByMethod>(),
    counted: jsonb('counted').$type<CashByMethod>(),
    /** Quién la cerró: quien la abrió o un administrador. */
    closedBy: jsonb('closed_by').$type<Actor>(),
  },
  (t) => [
    check(
      'cash_shifts_opening_nonnegative',
      sql`${t.openingCashUsdMicros} >= 0 and ${t.openingCashVesMicros} >= 0`,
    ),
    // Como mucho una caja abierta en el local (REQ-005-44), también ante peticiones
    // simultáneas: todas las abiertas darían el mismo valor (`true`) en el índice.
    uniqueIndex('cash_shifts_one_open_idx')
      .on(sql`(${t.closedAt} is null)`)
      .where(sql`${t.closedAt} is null`),
    index('cash_shifts_staff_opened_idx').on(t.staffId, t.openedAt),
    check('cash_shifts_closed_after_opened', sql`${t.closedAt} >= ${t.openedAt}`),
  ],
);

/**
 * Movimientos de saldo (REQ-001-89, ADR-0014): solo se insertan, nunca se modifican ni se
 * borran. `amount` va en µUSD (monedero `money`) o en segundos (monedero `combo`), con
 * signo: positivo suma y negativo resta.
 */
export const ledger = pgTable(
  'ledger',
  {
    id: uuid('id').primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    wallet: text('wallet').$type<Wallet>().notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    kind: text('kind').$type<LedgerKind>().notNull(),
    /** Sesión que generó el consumo. */
    sessionId: uuid('session_id').references((): AnyPgColumn => sessions.id),
    /** Turno de caja de los cobros en mostrador (REQ-001-03, REQ-001-84). */
    shiftId: uuid('shift_id').references(() => cashShifts.id),
    paymentMethod: text('payment_method').$type<PaymentMethod>(),
    comboSnapshot: jsonb('combo_snapshot').$type<ComboSnapshot>(),
    /** Motivo obligatorio de los ajustes (REQ-001-89). */
    reason: text('reason'),
    /** Venta del mostrador pagada con el saldo, o su anulación (REQ-005-21, REQ-005-23). */
    saleId: uuid('sale_id').references((): AnyPgColumn => sales.id),
    actor: jsonb('actor').$type<Actor>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('ledger_customer_created_idx').on(t.customerId, t.createdAt),
    check('ledger_wallet_check', sql`${t.wallet} in ('money', 'combo')`),
    check(
      'ledger_kind_check',
      sql`${t.kind} in ('recharge', 'combo_purchase', 'consumption', 'adjustment', 'migration', 'sale')`,
    ),
    check('ledger_amount_nonzero', sql`${t.amount} <> 0`),
  ],
);

/**
 * Saldos de cada cuenta: **caché** del ledger, actualizada en la misma transacción que cada
 * movimiento (plan 001). Nunca son negativos: el sistema es solo prepago.
 */
export const customerBalances = pgTable(
  'customer_balances',
  {
    customerId: uuid('customer_id')
      .primaryKey()
      .references(() => customers.id),
    moneyMicros: bigint('money_micros', { mode: 'number' }).notNull().default(0),
    comboSeconds: integer('combo_seconds').notNull().default(0),
  },
  (t) => [
    check('customer_balances_money_nonnegative', sql`${t.moneyMicros} >= 0`),
    check('customer_balances_combo_nonnegative', sql`${t.comboSeconds} >= 0`),
  ],
);

/**
 * Tarifa semanal (REQ-001-10, REQ-001-15): siete filas fijas, una por día (1 = lunes …
 * 7 = domingo). Los valores iniciales los pone la migración.
 */
export const tariffDays = pgTable(
  'tariff_days',
  {
    weekday: integer('weekday').$type<Weekday>().primaryKey(),
    rateMicrosPerHour: bigint('rate_micros_per_hour', { mode: 'number' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Quién hizo el último cambio; `null` en los valores iniciales. */
    updatedBy: jsonb('updated_by').$type<Actor>(),
  },
  (t) => [
    check('tariff_days_weekday_check', sql`${t.weekday} between 1 and 7`),
    check('tariff_days_rate_positive', sql`${t.rateMicrosPerHour} > 0`),
  ],
);

/**
 * Ajustes del nodo que cambia el administrador (T28a). Una fila por ajuste que se haya
 * cambiado alguna vez; sin fila vale el valor por defecto de `DEFAULT_SETTINGS`.
 */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: jsonb('updated_by').$type<Actor>().notNull(),
});

/**
 * Combos de horas (REQ-001-80, REQ-001-81). No se borran, solo se desactivan: las ventas
 * guardan su propia copia (ADR-0014).
 */
export const combos = pgTable(
  'combos',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    priceMicros: bigint('price_micros', { mode: 'number' }).notNull(),
    seconds: integer('seconds').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('combos_price_positive', sql`${t.priceMicros} > 0`),
    check('combos_seconds_positive', sql`${t.seconds} > 0`),
  ],
);

/**
 * PCs del local. Las previas conservan identidad/mapa sin credencial de respaldo (003-11).
 * En desarrollo se crean con `pnpm --filter @pope/server dev:seed-pcs`.
 */
export const pcs = pgTable(
  'pcs',
  {
    id: uuid('id').primaryKey(),
    /** Nombre que ven el panel y los eventos, p. ej. "PC 05". */
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Casilla en el mapa del panel (REQ-001-45). Sin ella, la PC va al final del mapa. */
    mapRow: integer('map_row'),
    mapCol: integer('map_col'),
    /** Inventario/Wake-on-LAN, no autenticación; null antes de registrar (REQ-003-22). */
    macAddress: text('mac_address'),
  },
  (t) => [
    uniqueIndex('pcs_name_lower_idx').on(sql`lower(${t.name})`),
    // Una PC por casilla. PostgreSQL no compara los NULL, así que las PCs sin posición no chocan.
    uniqueIndex('pcs_map_cell_idx').on(t.mapRow, t.mapCol),
    check('pcs_map_cell_check', sql`(${t.mapRow} is null) = (${t.mapCol} is null)`),
    check(
      'pcs_mac_address_check',
      sql`${t.macAddress} is null or
      (${t.macAddress} ~ '^[0-9A-F][02468ACE](:[0-9A-F]{2}){5}$'
        and ${t.macAddress} <> '00:00:00:00:00:00')`,
    ),
  ],
);

/** Código de instalación de un uso; nunca se guarda el código en claro (REQ-003-10). */
export const pcInstallationCodes = pgTable(
  'pc_installation_codes',
  {
    id: uuid('id').primaryKey(),
    codeHash: text('code_hash').notNull().unique(),
    createdByStaffId: uuid('created_by_staff_id')
      .notNull()
      .references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    targetPcId: uuid('target_pc_id').references(() => pcs.id),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    consumedPcId: uuid('consumed_pc_id').references(() => pcs.id),
  },
  (t) => [
    unique('pc_installation_codes_consumed_pc_unique').on(t.id, t.consumedPcId),
    index('pc_installation_codes_expiration_idx')
      .on(t.expiresAt)
      .where(sql`${t.consumedAt} is null`),
    check('pc_installation_codes_hash_check', sql`${t.codeHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'pc_installation_codes_ttl_check',
      sql`${t.expiresAt} = ${t.createdAt} + interval '600 seconds'`,
    ),
    check(
      'pc_installation_codes_consumption_check',
      sql`
    (${t.consumedAt} is null and ${t.consumedPcId} is null) or
    (${t.consumedAt} is not null and ${t.consumedPcId} is not null
      and ${t.consumedAt} >= ${t.createdAt} and ${t.consumedAt} < ${t.expiresAt}
      and (${t.targetPcId} is null or ${t.targetPcId} = ${t.consumedPcId}))`,
    ),
  ],
);

/** Hash de credencial de alta entropía, una vigente por PC (REQ-003-11, ADR-0017). */
export const pcCredentials = pgTable(
  'pc_credentials',
  {
    id: uuid('id').primaryKey(),
    pcId: uuid('pc_id')
      .notNull()
      .references(() => pcs.id),
    installationCodeId: uuid('installation_code_id').notNull().unique(),
    credentialHash: text('credential_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByStaffId: uuid('revoked_by_staff_id').references(() => staff.id),
  },
  (t) => [
    foreignKey({
      columns: [t.installationCodeId, t.pcId],
      foreignColumns: [pcInstallationCodes.id, pcInstallationCodes.consumedPcId],
    }),
    uniqueIndex('pc_credentials_active_pc_idx')
      .on(t.pcId)
      .where(sql`${t.revokedAt} is null`),
    check('pc_credentials_hash_check', sql`${t.credentialHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'pc_credentials_revocation_check',
      sql`
    (${t.revokedAt} is null or ${t.revokedAt} >= ${t.createdAt})
    and (${t.revokedByStaffId} is null or ${t.revokedAt} is not null)`,
    ),
  ],
);

/**
 * Sesiones de uso de una PC (plan 001), con cuenta o temporales. Una fila por sesión: el
 * cobro se va guardando aquí en cada latido y solo al cerrar se escribe en el ledger.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    pcId: uuid('pc_id')
      .notNull()
      .references(() => pcs.id),
    kind: text('kind').$type<SessionKind>().notNull(),
    /** Solo en las sesiones con cuenta. */
    customerId: uuid('customer_id').references(() => customers.id),
    /** Solo en las temporales: el nombre que puso el encargado o el de por defecto. */
    tempName: text('temp_name'),
    status: text('status').$type<'active' | 'ended'>().notNull().default('active'),
    /** Tarifa del día en que empezó, copiada (REQ-001-14, REQ-001-16). */
    rateMicrosPerHour: bigint('rate_micros_per_hour', { mode: 'number' }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    /**
     * Hasta dónde está cobrada la sesión. Avanza en segundos enteros con cada latido, así
     * que va como mucho 1 s por detrás del último latido (REQ-001-27).
     */
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }).notNull(),
    /**
     * Primera vez que la PC nombró esta sesión (en un `hello` o un latido): prueba que le
     * llegó el `state` que la abrió. Hasta entonces, que la PC diga "no tengo sesión" no la
     * cierra, porque puede que el mensaje se perdiera por el camino.
     */
    pcConfirmedAt: timestamp('pc_confirmed_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: text('end_reason').$type<SessionEndReason>(),
    /** Quién la abrió: el cliente o el encargado (REQ-001-31). */
    openedBy: jsonb('opened_by').$type<Actor>().notNull(),
    /** Sesión interrumpida de la que viene, si es una restauración (REQ-001-67). */
    restoredFrom: uuid('restored_from').references((): AnyPgColumn => sessions.id),
    // Consumo de las sesiones con cuenta (motor de cobro de `shared`).
    comboSecondsUsed: integer('combo_seconds_used').notNull().default(0),
    moneySeconds: integer('money_seconds').notNull().default(0),
    moneyChargedMicros: bigint('money_charged_micros', { mode: 'number' }).notNull().default(0),
    // Tiempo de las temporales: el comprado y el ya usado (REQ-001-60, REQ-001-63).
    purchasedSeconds: integer('purchased_seconds'),
    usedSeconds: integer('used_seconds').notNull().default(0),
  },
  (t) => [
    // Una sola sesión activa por cuenta (REQ-001-21) y por PC.
    uniqueIndex('sessions_active_customer_idx')
      .on(t.customerId)
      .where(sql`${t.status} = 'active'`),
    uniqueIndex('sessions_active_pc_idx')
      .on(t.pcId)
      .where(sql`${t.status} = 'active'`),
    // Una sesión interrumpida solo se restaura una vez (REQ-001-68).
    uniqueIndex('sessions_restored_from_idx')
      .on(t.restoredFrom)
      .where(sql`${t.restoredFrom} is not null`),
    index('sessions_pc_started_idx').on(t.pcId, t.startedAt),
    check('sessions_kind_check', sql`${t.kind} in ('account', 'temporary')`),
    check('sessions_status_check', sql`${t.status} in ('active', 'ended')`),
    check(
      'sessions_kind_fields',
      sql`(${t.kind} = 'account' and ${t.customerId} is not null and ${t.purchasedSeconds} is null)
        or (${t.kind} = 'temporary' and ${t.customerId} is null and ${t.tempName} is not null
          and ${t.purchasedSeconds} is not null)`,
    ),
    check(
      'sessions_ended_fields',
      sql`(${t.status} = 'active') = (${t.endedAt} is null and ${t.endReason} is null)`,
    ),
  ],
);

/**
 * Cómo terminó una pausa: la quitó el cliente, la quitó el encargado desde el panel
 * (REQ-002-13), venció con la opción b) y cerró la sesión (REQ-002-22), o la sesión se cerró
 * por otro motivo estando en pausa.
 */
export type PauseEndReason = 'resumed' | 'staff_resumed' | 'expired_closed' | 'session_closed';

/**
 * Pausas de las sesiones con cuenta (spec 002). Una fila por pausa; nada se borra, porque
 * son auditoría (ADR-0008). La pausa abierta de una sesión es la fila sin `ended_at`.
 */
export const sessionPauses = pgTable(
  'session_pauses',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id),
    /** La cuenta de la sesión, para contar sus pausas del día (REQ-002-24). */
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    /** Inicio más la duración máxima vigente al empezar (REQ-002-20). */
    maxUntil: timestamp('max_until', { withTimezone: true }).notNull(),
    /** Si venció con la opción a): desde cuándo se vuelve a cobrar, `max_until` (REQ-002-22). */
    billingResumedAt: timestamp('billing_resumed_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: text('end_reason').$type<PauseEndReason>(),
    /** Quién pausó: el cliente. */
    startedBy: jsonb('started_by').$type<Actor>().notNull(),
    /** Quién la quitó: el cliente, el encargado o el sistema. */
    endedBy: jsonb('ended_by').$type<Actor>(),
  },
  (t) => [
    // Una sola pausa abierta por sesión.
    uniqueIndex('session_pauses_open_idx')
      .on(t.sessionId)
      .where(sql`${t.endedAt} is null`),
    // Pausas de la sesión (REQ-002-21) y de la cuenta en el día (REQ-002-24).
    index('session_pauses_session_idx').on(t.sessionId),
    index('session_pauses_customer_started_idx').on(t.customerId, t.startedAt),
    check('session_pauses_max_until_check', sql`${t.maxUntil} > ${t.startedAt}`),
    check(
      'session_pauses_billing_check',
      sql`${t.billingResumedAt} is null or ${t.billingResumedAt} >= ${t.maxUntil}`,
    ),
    check(
      'session_pauses_end_reason_check',
      sql`${t.endReason} in ('resumed', 'staff_resumed', 'expired_closed', 'session_closed')`,
    ),
    check(
      'session_pauses_ended_fields',
      sql`(${t.endedAt} is null) = (${t.endReason} is null)
        and (${t.endedAt} is null) = (${t.endedBy} is null)`,
    ),
  ],
);

/**
 * Cobros en caja de las sesiones temporales: el de la apertura y los de "añadir tiempo"
 * (REQ-001-60, REQ-001-70). Solo se insertan. Van ligados al turno de quien cobró, que es
 * donde los cuenta la caja (spec 005). Una restauración no cobra, así que no tiene fila.
 */
export const sessionTopups = pgTable(
  'session_topups',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id),
    /** Tiempo que compra este cobro. */
    seconds: integer('seconds').notNull(),
    /** Importe cobrado en µUSD. */
    amountMicros: bigint('amount_micros', { mode: 'number' }).notNull(),
    paymentMethod: text('payment_method').$type<PaymentMethod>().notNull(),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => cashShifts.id),
    actor: jsonb('actor').$type<Actor>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('session_topups_session_idx').on(t.sessionId, t.createdAt),
    index('session_topups_shift_idx').on(t.shiftId),
    check('session_topups_seconds_positive', sql`${t.seconds} > 0`),
    check('session_topups_amount_positive', sql`${t.amountMicros} > 0`),
  ],
);

/**
 * Tasas de cambio USD → VES (spec 005, REQ-005-33). Solo se insertan: la historia de tasas es
 * auditoría. La vigente es la última guardada cuya fecha valor ya llegó (`currentRate`).
 */
export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: uuid('id').primaryKey(),
    /** µVES por 1 USD (`VesRate`, ADR-0015). */
    vesPerUsd: bigint('ves_per_usd', { mode: 'number' }).notNull(),
    /** Fecha valor, día en hora de Caracas: desde ese día vale. */
    effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
    source: text('source').$type<ExchangeRateSource>().notNull(),
    obtainedAt: timestamp('obtained_at', { withTimezone: true }).notNull(),
    actor: jsonb('actor').$type<Actor>().notNull(),
  },
  (t) => [
    index('exchange_rates_effective_idx').on(t.effectiveDate, t.obtainedAt),
    check('exchange_rates_positive', sql`${t.vesPerUsd} > 0`),
  ],
);

/**
 * Productos del inventario (spec 005, REQ-005-01): golosinas, bebidas… No se borran, solo se
 * desactivan. El stock no se guarda aquí: es la suma de `stock_movements` (REQ-005-11).
 */
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    /** Precio de venta en µUSD. */
    priceMicros: bigint('price_micros', { mode: 'number' }).notNull(),
    /** Por debajo de este stock, el panel avisa (REQ-005-13). */
    minStock: integer('min_stock'),
    active: boolean('active').notNull().default(true),
    /** Archivo de la foto en la carpeta de datos del nodo (REQ-005-03), si tiene. */
    photo: text('photo'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('products_price_positive', sql`${t.priceMicros} > 0`),
    check('products_min_stock_nonnegative', sql`${t.minStock} >= 0`),
  ],
);

/**
 * Movimientos de stock (REQ-005-10): solo se insertan. `quantity` lleva signo: las entradas
 * suman, las ventas y las mermas restan y los ajustes van en cualquier sentido. Anular una
 * venta escribe un movimiento `sale` positivo que apunta a la venta anulada (REQ-005-23).
 */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    kind: text('kind').$type<StockMovementKind>().notNull(),
    quantity: integer('quantity').notNull(),
    /** Obligatorio en ajustes y mermas (REQ-005-10). */
    reason: text('reason'),
    /** La venta que lo causó, o la anulada si es su devolución. */
    saleId: uuid('sale_id').references((): AnyPgColumn => sales.id),
    actor: jsonb('actor').$type<Actor>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('stock_movements_product_created_idx').on(t.productId, t.createdAt),
    index('stock_movements_sale_idx').on(t.saleId),
    check(
      'stock_movements_kind_check',
      sql`${t.kind} in ('restock', 'sale', 'adjustment', 'waste')`,
    ),
    check('stock_movements_quantity_nonzero', sql`${t.quantity} <> 0`),
    check(
      'stock_movements_kind_fields',
      sql`(${t.kind} = 'restock' and ${t.quantity} > 0 and ${t.saleId} is null)
        or (${t.kind} = 'sale' and ${t.saleId} is not null)
        or (${t.kind} = 'adjustment' and ${t.reason} is not null and ${t.saleId} is null)
        or (${t.kind} = 'waste' and ${t.quantity} < 0 and ${t.reason} is not null
          and ${t.saleId} is null)`,
    ),
  ],
);

/**
 * Registro único de lo cobrado (spec 005, REQ-005-24): una fila por pago y grupo del
 * reporte. Lo escriben las ventas, las recargas, las sesiones temporales y los combos
 * cobrados en caja, en la misma transacción que el cobro. Solo se insertan: una anulación
 * escribe filas con importes negativos.
 */
export const cashEntries = pgTable(
  'cash_entries',
  {
    id: uuid('id').primaryKey(),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => cashShifts.id),
    source: text('source').$type<CashSource>().notNull(),
    /** La venta, recarga (fila del ledger), cobro de la temporal o compra de combo. */
    sourceId: uuid('source_id').notNull(),
    /** Grupo del reporte (REQ-005-52). */
    group: text('report_group').$type<CashGroup>().notNull(),
    method: text('method').$type<CashMethod>().notNull(),
    currency: text('currency').$type<Currency>().notNull(),
    /** En la moneda del pago, µ-unidades (ADR-0015). */
    amountMicros: bigint('amount_micros', { mode: 'number' }).notNull(),
    /** Su equivalente en µUSD. */
    usdMicros: bigint('usd_micros', { mode: 'number' }).notNull(),
    /** Tasa aplicada si se cobró en Bs (REQ-005-22). */
    vesRate: bigint('ves_rate', { mode: 'number' }),
    /** Qué fue, copiado al cobrar: "Recarga · juan", "Impresiones × 12". */
    description: text('description').notNull(),
    /** La cuenta del cobro, copiada al cobrar (REQ-005-24); `null` si no la hay. */
    customerName: text('customer_name'),
    actor: jsonb('actor').$type<Actor>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('cash_entries_shift_created_idx').on(t.shiftId, t.createdAt),
    index('cash_entries_source_idx').on(t.source, t.sourceId),
    check(
      'cash_entries_source_check',
      sql`${t.source} in ('sale', 'recharge', 'temporary', 'combo', 'void')`,
    ),
    check('cash_entries_group_check', sql`${t.group} in ('pc', 'snacks', 'other')`),
    check(
      'cash_entries_method_check',
      sql`${t.method} in ('cash_usd', 'cash_ves', 'mobile_payment', 'pos', 'balance')`,
    ),
    check('cash_entries_currency_check', sql`${t.currency} in ('USD', 'VES')`),
    check(
      'cash_entries_amounts',
      sql`${t.amountMicros} <> 0 and sign(${t.amountMicros}) = sign(${t.usdMicros})`,
    ),
    check(
      'cash_entries_rate',
      sql`(${t.currency} = 'VES') = (${t.vesRate} is not null) and (${t.vesRate} is null or ${t.vesRate} > 0)`,
    ),
    check('cash_entries_balance_usd', sql`${t.method} <> 'balance' or ${t.currency} = 'USD'`),
  ],
);

/**
 * Ventas del mostrador (spec 005, REQ-005-20): una fila por venta. No se borran: anularla
 * (REQ-005-23) la marca y escribe los movimientos inversos.
 */
export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey(),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => cashShifts.id),
    /** La cuenta que pagó con su saldo, si alguna (REQ-005-21). */
    customerId: uuid('customer_id').references(() => customers.id),
    /** Total en µUSD. */
    totalMicros: bigint('total_micros', { mode: 'number' }).notNull(),
    actor: jsonb('actor').$type<Actor>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    voidedBy: jsonb('voided_by').$type<Actor>(),
  },
  (t) => [
    index('sales_shift_created_idx').on(t.shiftId, t.createdAt),
    check('sales_total_positive', sql`${t.totalMicros} > 0`),
    check(
      'sales_void_fields',
      sql`(${t.voidedAt} is null) = (${t.voidReason} is null) and (${t.voidedAt} is null) = (${t.voidedBy} is null)`,
    ),
  ],
);

/**
 * Líneas de una venta: un producto o un otro ingreso, con la copia del nombre y del precio
 * del momento (como los combos, ADR-0014). Un otro ingreso se llama "Otro ingreso", lleva
 * cantidad 1, su importe como precio y el comentario (REQ-005-05); la migración 0022 convirtió
 * así las líneas de los conceptos, que ya no existen.
 */
export const saleLines = pgTable(
  'sale_lines',
  {
    id: uuid('id').primaryKey(),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id),
    /** Orden de la línea dentro de la venta. */
    position: integer('position').notNull(),
    kind: text('kind').$type<'product' | 'other'>().notNull(),
    productId: uuid('product_id').references(() => products.id),
    name: text('name').notNull(),
    quantity: integer('quantity').notNull(),
    unitPriceMicros: bigint('unit_price_micros', { mode: 'number' }).notNull(),
    totalMicros: bigint('total_micros', { mode: 'number' }).notNull(),
    /** Comentario de un otro ingreso ("20 impresiones"); `null` en las demás líneas. */
    comment: text('comment'),
  },
  (t) => [
    uniqueIndex('sale_lines_sale_position_idx').on(t.saleId, t.position),
    check(
      'sale_lines_kind_fields',
      sql`(${t.kind} = 'product' and ${t.productId} is not null)
        or (${t.kind} = 'other' and ${t.productId} is null and ${t.quantity} = 1)`,
    ),
    check('sale_lines_comment', sql`${t.comment} is null or ${t.kind} = 'other'`),
    check('sale_lines_quantity_positive', sql`${t.quantity} > 0`),
    check('sale_lines_price_positive', sql`${t.unitPriceMicros} > 0`),
    check('sale_lines_total', sql`${t.totalMicros} = ${t.quantity} * ${t.unitPriceMicros}`),
  ],
);
