import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type Actor,
  type Customer,
  type CustomerCreateRequest,
  type CustomerPage,
  type CustomerSearchQuery,
  type CustomerStatus,
  newId,
} from '@pope/shared';
import { asc, count, eq, ilike, or, type SQL, sql } from 'drizzle-orm';

import { PasswordService } from '../auth/password.service.js';
import { DATABASE, type Database } from '../db/database.js';
import { customers } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';

/** Condición "mismo usuario sin distinguir mayúsculas" (índice `customers_username_lower_idx`). */
function sameUsername(username: string): SQL {
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

function toCustomer(row: typeof customers.$inferSelect): Customer {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    phone: row.phone,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Cuentas de cliente, creadas y gestionadas desde el panel (REQ-001-01, REQ-001-04). */
@Injectable()
export class CustomersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly passwords: PasswordService,
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
      return toCustomer(row);
    });
  }

  /** Busca por usuario, nombre o teléfono, ordenado por usuario y paginado. */
  async search(query: CustomerSearchQuery): Promise<CustomerPage> {
    const where = query.q ? searchCondition(query.q) : undefined;
    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(customers)
        .where(where)
        .orderBy(asc(sql`lower(${customers.username})`))
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: count() }).from(customers).where(where),
    ]);
    return { items: rows.map(toCustomer), total: totals?.total ?? 0 };
  }

  /** Un cliente; 404 si no existe. */
  async get(id: string): Promise<Customer> {
    const [row] = await this.db.select().from(customers).where(eq(customers.id, id));
    if (!row) {
      throw new NotFoundException('No existe ese cliente');
    }
    return toCustomer(row);
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
        return toCustomer(row);
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
      return toCustomer({ ...row, status });
    });
  }
}
