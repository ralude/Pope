import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  type Actor,
  newId,
  staffDisplayNameSchema,
  staffPasswordSchema,
  type StaffProfile,
  type StaffRole,
  staffUsernameSchema,
} from '@pope/shared';
import { and, count, eq, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../db/database.js';
import { staff } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { PasswordService } from './password.service.js';

export interface NewStaff {
  username: string;
  displayName: string;
  role: StaffRole;
  password: string;
}

/** Condición "mismo usuario sin distinguir mayúsculas" (índice `staff_username_lower_idx`). */
export function sameUsername(username: string) {
  return eq(sql`lower(${staff.username})`, username.trim().toLowerCase());
}

/** Alta y consulta del personal del local (REQ-001-40). */
@Injectable()
export class StaffService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventsService,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * Da de alta a un miembro del personal y emite `staff.created`. El usuario es único sin
   * distinguir mayúsculas. La contraseña solo se guarda como hash argon2id (REQ-001-51).
   */
  async create(input: NewStaff, actor: Actor): Promise<StaffProfile> {
    const username = staffUsernameSchema.parse(input.username);
    const displayName = staffDisplayNameSchema.parse(input.displayName);
    // El hash (lento a propósito) se calcula fuera de la transacción.
    const passwordHash = await this.passwords.hash(staffPasswordSchema.parse(input.password));

    return this.events.inTransaction(async (tx, emit) => {
      const [taken] = await tx.select({ id: staff.id }).from(staff).where(sameUsername(username));
      if (taken) {
        throw new ConflictException('Ya existe un miembro del personal con ese usuario');
      }

      const id = newId();
      await tx.insert(staff).values({ id, username, displayName, role: input.role, passwordHash });
      emit({
        type: 'staff.created',
        version: 1,
        actor,
        payload: { staff: { id, username }, name: displayName, role: input.role },
      });
      return { id, username, displayName, role: input.role };
    });
  }

  /** Cuántos administradores activos hay (la CLI solo crea el primero). */
  async countActiveAdministrators(): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(staff)
      .where(and(eq(staff.role, 'administrador'), eq(staff.active, true)));
    return row?.total ?? 0;
  }
}
