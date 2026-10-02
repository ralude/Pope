// Esquema de la base de datos con Drizzle (ADR-0004). Cada tarea añade aquí sus tablas y
// genera la migración con `pnpm --filter @pope/server db:generate`.
//
// Convenciones (plan 001): ids UUIDv7, fechas `timestamptz` en UTC, importes `bigint` en
// micro-unidades (ADR-0015) y tiempos en segundos `integer`.
import type {
  Actor,
  ComboSnapshot,
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
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
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
  },
  (t) => [
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
    actor: jsonb('actor').$type<Actor>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('ledger_customer_created_idx').on(t.customerId, t.createdAt),
    check('ledger_wallet_check', sql`${t.wallet} in ('money', 'combo')`),
    check(
      'ledger_kind_check',
      sql`${t.kind} in ('recharge', 'combo_purchase', 'consumption', 'adjustment', 'migration')`,
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
 * PCs del local. **Mínima**: la spec 003 añade el registro con código de instalación y las
 * credenciales. En desarrollo se crean con `pnpm --filter @pope/server dev:seed-pcs`.
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
  },
  (t) => [
    uniqueIndex('pcs_name_lower_idx').on(sql`lower(${t.name})`),
    // Una PC por casilla. PostgreSQL no compara los NULL, así que las PCs sin posición no chocan.
    uniqueIndex('pcs_map_cell_idx').on(t.mapRow, t.mapCol),
    check('pcs_map_cell_check', sql`(${t.mapRow} is null) = (${t.mapCol} is null)`),
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
    saleId: uuid('sale_id'),
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
 * Conceptos que se venden sin inventario, como "Impresiones" (REQ-005-05). No se borran,
 * solo se desactivan: las ventas guardan su propia copia del nombre y del precio.
 */
export const saleConcepts = pgTable(
  'sale_concepts',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    /** Precio por unidad sugerido en µUSD; el encargado puede cambiarlo al vender. */
    unitPriceMicros: bigint('unit_price_micros', { mode: 'number' }).notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [check('sale_concepts_price_positive', sql`${t.unitPriceMicros} > 0`)],
);
