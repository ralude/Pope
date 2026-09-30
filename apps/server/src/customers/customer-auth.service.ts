import { randomBytes } from 'node:crypto';

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Actor, Customer } from '@pope/shared';
import { eq } from 'drizzle-orm';

import { PasswordService } from '../auth/password.service.js';
import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { customers } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { requireCustomer, sameUsername } from './customers.service.js';

/** Intentos fallidos seguidos que bloquean el login (REQ-001-52). */
export const MAX_FAILED_LOGINS = 5;

/** Duración del bloqueo por intentos (REQ-001-52). */
export const LOGIN_LOCK_MS = 5 * 60 * 1000;

/**
 * Resultado de comprobar las credenciales de un cliente. Los motivos coinciden con los
 * códigos de error del protocolo de la PC, que da un mensaje distinto para cada uno
 * (pregunta resuelta de la spec 001).
 */
export type CustomerVerification =
  | { ok: true; customer: Customer }
  | { ok: false; reason: 'invalid_credentials' }
  | { ok: false; reason: 'account_locked'; lockedUntil: Date }
  | { ok: false; reason: 'account_inactive'; status: 'blocked' | 'disabled' };

/** Credenciales de los clientes y bloqueo por intentos fallidos (REQ-001-51, REQ-001-52). */
@Injectable()
export class CustomerAuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly passwords: PasswordService,
    private readonly clock: Clock,
  ) {}

  /**
   * Comprueba usuario y contraseña. Tras 5 fallos seguidos, la cuenta no puede entrar
   * durante 5 minutos, aunque la contraseña sea correcta, y se emite
   * `customer.login_locked`. Los intentos durante el bloqueo no cuentan ni lo alargan; al
   * terminar, vuelve a tener 5 intentos. Un login correcto pone el contador a cero.
   *
   * El estado de la cuenta (bloqueada o desactivada) solo se revela con la contraseña
   * correcta.
   */
  async verify(username: string, password: string): Promise<CustomerVerification> {
    const [found] = await this.db.select().from(customers).where(sameUsername(username.trim()));
    if (!found) {
      // Se verifica igualmente una contraseña para que el tiempo de respuesta no revele
      // qué usuarios existen.
      await this.passwords.verify(await this.getDummyHash(), password);
      return { ok: false, reason: 'invalid_credentials' };
    }
    const lock = this.activeLock(found.lockedUntil);
    if (lock) {
      return { ok: false, reason: 'account_locked', lockedUntil: lock };
    }

    // El hash (lento a propósito) se comprueba fuera de la transacción.
    const valid = await this.passwords.verify(found.passwordHash, password);

    return this.events.inTransaction(async (tx, emit) => {
      // Se relee bloqueando la fila: dos intentos a la vez no pueden perder un fallo.
      const [row] = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, found.id))
        .for('update');
      if (!row) {
        return { ok: false, reason: 'invalid_credentials' } as const;
      }
      const currentLock = this.activeLock(row.lockedUntil);
      if (currentLock) {
        return { ok: false, reason: 'account_locked', lockedUntil: currentLock } as const;
      }

      if (!valid) {
        const failedLogins = row.failedLogins + 1;
        if (failedLogins < MAX_FAILED_LOGINS) {
          await tx.update(customers).set({ failedLogins }).where(eq(customers.id, row.id));
          return { ok: false, reason: 'invalid_credentials' } as const;
        }
        const lockedUntil = new Date(this.clock.now().getTime() + LOGIN_LOCK_MS);
        await tx
          .update(customers)
          .set({ failedLogins: 0, lockedUntil })
          .where(eq(customers.id, row.id));
        emit({
          type: 'customer.login_locked',
          version: 1,
          actor: { kind: 'system' },
          payload: {
            customer: { id: row.id, username: row.username },
            lockedUntil: lockedUntil.toISOString(),
          },
        });
        return { ok: false, reason: 'account_locked', lockedUntil } as const;
      }

      if (row.failedLogins > 0 || row.lockedUntil) {
        await tx
          .update(customers)
          .set({ failedLogins: 0, lockedUntil: null })
          .where(eq(customers.id, row.id));
      }
      if (row.status !== 'active') {
        return { ok: false, reason: 'account_inactive', status: row.status } as const;
      }
      return {
        ok: true,
        customer: await requireCustomer(tx, row.id, this.clock.now()),
      } as const;
    });
  }

  /**
   * El encargado quita el bloqueo por intentos antes de tiempo (T16a) y emite
   * `customer.login_unlocked`. Si no hay un bloqueo vigente, no hace nada.
   */
  async unlock(id: string, actor: Actor): Promise<Customer> {
    return this.events.inTransaction(async (tx, emit) => {
      const [row] = await tx.select().from(customers).where(eq(customers.id, id)).for('update');
      if (!row) {
        throw new NotFoundException('No existe ese cliente');
      }
      const now = this.clock.now();
      if (!this.activeLock(row.lockedUntil)) {
        return requireCustomer(tx, id, now);
      }
      await tx
        .update(customers)
        .set({ failedLogins: 0, lockedUntil: null })
        .where(eq(customers.id, id));
      emit({
        type: 'customer.login_unlocked',
        version: 1,
        actor,
        payload: { customer: { id: row.id, username: row.username } },
      });
      return requireCustomer(tx, id, now);
    });
  }

  /** Fin del bloqueo si sigue vigente; `null` si no hay o ya terminó. */
  private activeLock(lockedUntil: Date | null): Date | null {
    return lockedUntil && lockedUntil > this.clock.now() ? lockedUntil : null;
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash(randomBytes(16).toString('hex'));
    return this.dummyHash;
  }
}
