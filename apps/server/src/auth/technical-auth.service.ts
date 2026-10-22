import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  type StaffProfile,
  TECHNICAL_LOGIN_LOCK_SECONDS,
  TECHNICAL_LOGIN_MAX_FAILURES,
} from '@pope/shared';
import { eq } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { staff, staffTechnicalLoginAttempts } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { PasswordService } from './password.service.js';
import { sameUsername } from './staff.service.js';

export type TechnicalAuthResult =
  | { ok: true; staff: StaffProfile }
  | { ok: false; reason: 'invalid_credentials' | 'staff_inactive' | 'forbidden' }
  | { ok: false; reason: 'locked'; lockedUntil: Date };

/** PC desde la que se intenta entrar; solo para el aviso del bloqueo. */
export interface TechnicalLoginPc {
  id: string;
  name: string;
}

/**
 * Valida al personal que entra en mantenimiento desde la PC (REQ-003-40, REQ-003-45). Solo
 * comprueba usuario, contraseña, estado y rol: no crea sesión ni cookie del panel, y su
 * contador no afecta al login del panel. Los roles admitidos son encargado y administrador.
 *
 * Diez fallos seguidos de una cuenta, desde cualquier PC, la bloquean 60 s y emiten un único
 * `staff.technical_login_locked` para avisar al panel. Un acierto o el fin del bloqueo
 * reinician el contador. Durante el bloqueo no se mira la contraseña.
 */
@Injectable()
export class TechnicalAuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly events: EventsService,
    private readonly clock: Clock,
  ) {}

  async verify(
    username: string,
    password: string,
    pc: TechnicalLoginPc,
  ): Promise<TechnicalAuthResult> {
    const [found] = await this.db.select().from(staff).where(sameUsername(username));
    if (!found) {
      // Se verifica igualmente una contraseña: el tiempo de respuesta no revela qué usuarios
      // hay. Una cuenta inexistente no tiene contador.
      await this.passwords.verify(await this.getDummyHash(), password);
      return { ok: false, reason: 'invalid_credentials' };
    }
    const [before] = await this.db
      .select({ lockedUntil: staffTechnicalLoginAttempts.lockedUntil })
      .from(staffTechnicalLoginAttempts)
      .where(eq(staffTechnicalLoginAttempts.staffId, found.id));
    const early = this.activeLock(before?.lockedUntil ?? null);
    if (early) return { ok: false, reason: 'locked', lockedUntil: early };

    // El hash (lento a propósito) se comprueba fuera de la transacción.
    const valid = await this.passwords.verify(found.passwordHash, password);

    return this.events.inTransaction(async (tx, emit): Promise<TechnicalAuthResult> => {
      await tx
        .insert(staffTechnicalLoginAttempts)
        .values({ staffId: found.id })
        .onConflictDoNothing();
      // Se relee bloqueando la fila: dos intentos a la vez no pueden perder un fallo ni
      // emitir dos avisos.
      const [row] = await tx
        .select()
        .from(staffTechnicalLoginAttempts)
        .where(eq(staffTechnicalLoginAttempts.staffId, found.id))
        .for('update');
      if (!row) return { ok: false, reason: 'invalid_credentials' };
      const lock = this.activeLock(row.lockedUntil);
      if (lock) return { ok: false, reason: 'locked', lockedUntil: lock };

      if (!valid) {
        // Un bloqueo ya vencido deja el contador en cero antes de contar este fallo.
        const failedLogins = (row.lockedUntil ? 0 : row.failedLogins) + 1;
        if (failedLogins < TECHNICAL_LOGIN_MAX_FAILURES) {
          await tx
            .update(staffTechnicalLoginAttempts)
            .set({ failedLogins, lockedAt: null, lockedUntil: null })
            .where(eq(staffTechnicalLoginAttempts.staffId, found.id));
          return { ok: false, reason: 'invalid_credentials' };
        }
        const lockedAt = this.clock.now();
        const lockedUntil = new Date(lockedAt.getTime() + TECHNICAL_LOGIN_LOCK_SECONDS * 1_000);
        await tx
          .update(staffTechnicalLoginAttempts)
          .set({ failedLogins, lockedAt, lockedUntil })
          .where(eq(staffTechnicalLoginAttempts.staffId, found.id));
        emit({
          type: 'staff.technical_login_locked',
          version: 1,
          actor: { kind: 'system' },
          payload: {
            staffId: found.id,
            username: found.username,
            pc: { id: pc.id, name: pc.name },
            lockedUntil: lockedUntil.toISOString(),
          },
        });
        return { ok: false, reason: 'locked', lockedUntil };
      }

      if (row.failedLogins > 0 || row.lockedUntil) {
        await tx
          .update(staffTechnicalLoginAttempts)
          .set({ failedLogins: 0, lockedAt: null, lockedUntil: null })
          .where(eq(staffTechnicalLoginAttempts.staffId, found.id));
      }
      if (!found.active) return { ok: false, reason: 'staff_inactive' };
      if (found.role === 'dueno') return { ok: false, reason: 'forbidden' };
      return {
        ok: true,
        staff: {
          id: found.id,
          username: found.username,
          displayName: found.displayName,
          role: found.role,
        },
      };
    });
  }

  private activeLock(lockedUntil: Date | null): Date | null {
    return lockedUntil && lockedUntil > this.clock.now() ? lockedUntil : null;
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash(randomBytes(16).toString('hex'));
    return this.dummyHash;
  }
}
