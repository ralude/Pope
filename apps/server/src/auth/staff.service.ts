import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type Actor,
  newId,
  staffDisplayNameSchema,
  type StaffListItem,
  staffPasswordSchema,
  type StaffProfile,
  type StaffRole,
  staffUsernameSchema,
} from '@pope/shared';
import { and, asc, count, eq, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../db/database.js';
import { staff, staffSessions } from '../db/schema.js';
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

  /** Todo el personal, por orden de alta (T14d). */
  async list(): Promise<StaffListItem[]> {
    const rows = await this.db.select().from(staff).orderBy(asc(staff.createdAt), asc(staff.id));
    return rows.map(toListItem);
  }

  /** Un miembro del personal; 404 si no existe. */
  async get(id: string): Promise<StaffListItem> {
    const [row] = await this.db.select().from(staff).where(eq(staff.id, id));
    if (!row) {
      throw new NotFoundException('No existe ese miembro del personal');
    }
    return toListItem(row);
  }

  /**
   * Activa o desactiva a un miembro del personal y emite `staff.status_changed` (pregunta
   * resuelta de la spec 001). Al desactivarlo se borran sus sesiones del panel, para que no
   * vuelvan a valer si se reactiva. Si el estado ya era ese, no hace nada.
   */
  async setActive(id: string, active: boolean, actor: Actor): Promise<StaffListItem> {
    await this.events.inTransaction(async (tx, emit) => {
      const [member] = await tx.select().from(staff).where(eq(staff.id, id));
      if (!member) {
        throw new NotFoundException('No existe ese miembro del personal');
      }
      if (member.active === active) {
        return;
      }
      await tx.update(staff).set({ active }).where(eq(staff.id, id));
      if (!active) {
        await tx.delete(staffSessions).where(eq(staffSessions.staffId, id));
      }
      emit({
        type: 'staff.status_changed',
        version: 1,
        actor,
        payload: {
          staff: { id, username: member.username },
          from: member.active ? 'active' : 'inactive',
          to: active ? 'active' : 'inactive',
        },
      });
    });
    return this.get(id);
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

function toListItem(row: typeof staff.$inferSelect): StaffListItem {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}
