import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type Actor,
  type Customer,
  type CustomerCreateRequest,
  type CustomerPage,
  type CustomerSearchQuery,
  type CustomerStatus,
  micros,
  newId,
} from '@pope/shared';
import { asc, count, eq, ilike, or, type SQL, sql } from 'drizzle-orm';

import { PasswordService } from '../auth/password.service.js';
import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { customerBalances, customers } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';

/** Condición "mismo usuario sin distinguir mayúsculas" (índice `customers_username_lower_idx`). */
export function sameUsername(username: string): SQL {
  return eq(sql`lower(${customers.username})`, username.toLowerCase());
}

/** Escapa los comodines de ILIKE: `_` es válido en los usuarios y no debe comodinear. */
function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * Condición de búsqueda: el texto dentro del usuario o del nombre, o sus cifras dentro del
 * teléfono. Así "0412123" encuentra `+584121234567`.
 */
function searchCondition(q: string): SQL | undefined {
  const pattern = containsPattern(q);
  const conditions = [ilike(customers.username, pattern), ilike(customers.name, pattern)];
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 4) {
    // Se quita el prefijo nacional (0) o internacional (58) para buscar como se guarda.
    const national = digits.replace(/^0/, '').replace(/^58(?=[24])/, '');
    conditions.push(ilike(customers.phone, containsPattern(national)));
  }
  return or(...conditions);
}

/** Saldos de la caché; `null` si la cuenta aún no tiene movimientos. */
interface BalancesRow {
  money: number | null;
  combo: number | null;
}

/**
 * Cliente para el panel. `now` decide si el bloqueo por intentos sigue vigente. Sin
 * `balances`, los saldos son cero (cuenta recién creada).
 */
export function toCustomer(
  row: typeof customers.$inferSelect,
  now: Date,
  balances: BalancesRow = { money: null, combo: null },
): Customer {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    phone: row.phone,
    status: row.status,
    loginLockedUntil:
      row.lockedUntil && row.lockedUntil > now ? row.lockedUntil.toISOString() : null,
    balances: { moneyMicros: micros(balances.money ?? 0), comboSeconds: balances.combo ?? 0 },
    createdAt: row.createdAt.toISOString(),
  };
}

/** Clientes con sus saldos (la caché `customer_balances`, que puede no tener fila). */
function selectCustomers(db: Database) {
  return db
    .select({
      customer: customers,
      money: customerBalances.moneyMicros,
      combo: customerBalances.comboSeconds,
    })
    .from(customers)
    .leftJoin(customerBalances, eq(customerBalances.customerId, customers.id));
}

/** Un cliente con sus saldos, o `null` si no existe. Sirve dentro de una transacción. */
export async function loadCustomer(db: Database, id: string, now: Date): Promise<Customer | null> {
  const [row] = await selectCustomers(db).where(eq(customers.id, id));
  return row ? toCustomer(row.customer, now, row) : null;
}

/** Como `loadCustomer`, pero responde 404 si no existe. */
export async function requireCustomer(db: Database, id: string, now: Date): Promise<Customer> {
  const customer = await loadCustomer(db, id, now);
  if (!customer) {
    throw new NotFoundException('No existe ese cliente');
  }
  return customer;
}

/** Cuentas de cliente, creadas y gestionadas desde el panel (REQ-001-01, REQ-001-04). */
@Injectable()
export class CustomersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly passwords: PasswordService,
    private readonly clock: Clock,
  ) {}

  /** Da de alta un cliente y emite `customer.created` (REQ-001-02, REQ-001-30). */
  async create(input: CustomerCreateRequest, actor: Actor): Promise<Customer> {
    // El hash (lento a propósito) se calcula fuera de la transacción.
    const passwordHash = await this.passwords.hash(input.password);
    return this.events.inTransaction(async (tx, emit) => {
      const [taken] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(sameUsername(input.username));
      if (taken) {
        throw new ConflictException('Ya existe un cliente con ese usuario');
      }
      const [row] = await tx
        .insert(customers)
        .values({
          id: newId(),
          username: input.username,
          passwordHash,
          name: input.name,
          phone: input.phone,
        })
        .returning();
      if (!row) {
        throw new Error('No se pudo crear el cliente');
      }
      emit({
        type: 'customer.created',
        version: 1,
        actor,
        payload: {
          customer: { id: row.id, username: row.username },
          name: row.name,
          phone: row.phone,
        },
      });
      return toCustomer(row, this.clock.now());
    });
  }

  /** Busca por usuario, nombre o teléfono, ordenado por usuario y paginado. */
  async search(query: CustomerSearchQuery): Promise<CustomerPage> {
    const where = query.q ? searchCondition(query.q) : undefined;
    const [rows, [totals]] = await Promise.all([
      selectCustomers(this.db)
        .where(where)
        .orderBy(asc(sql`lower(${customers.username})`))
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: count() }).from(customers).where(where),
    ]);
    const now = this.clock.now();
    return {
      items: rows.map((row) => toCustomer(row.customer, now, row)),
      total: totals?.total ?? 0,
    };
  }

  /** Un cliente; 404 si no existe. */
  get(id: string): Promise<Customer> {
    return requireCustomer(this.db, id, this.clock.now());
  }

  /**
   * Cambia el estado de la cuenta (REQ-001-04) y emite `customer.status_changed`. Si ya
   * tenía ese estado, no hace nada.
   */
  async setStatus(id: string, status: CustomerStatus, actor: Actor): Promise<Customer> {
    return this.events.inTransaction(async (tx, emit) => {
      const [row] = await tx.select().from(customers).where(eq(customers.id, id));
      if (!row) {
        throw new NotFoundException('No existe ese cliente');
      }
      if (row.status === status) {
        return requireCustomer(tx, id, this.clock.now());
      }
      await tx.update(customers).set({ status }).where(eq(customers.id, id));
      emit({
        type: 'customer.status_changed',
        version: 1,
        actor,
        payload: {
          customer: { id: row.id, username: row.username },
          from: row.status,
          to: status,
        },
      });
      return requireCustomer(tx, id, this.clock.now());
    });
  }
}
