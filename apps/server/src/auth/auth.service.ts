import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { newId, type StaffProfile } from '@pope/shared';
import { and, eq, gt } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { DATABASE, type Database } from '../db/database.js';
import { staff, staffSessions } from '../db/schema.js';
import { PasswordService } from './password.service.js';
import { sameUsername } from './staff.service.js';

/** Duración de la sesión del panel: 7 días renovables (pregunta resuelta de la spec 001). */
export const STAFF_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Solo se renueva si pasó al menos esto desde la última renovación, para no escribir en
 * la base de datos en cada petición. */
const RENEW_INTERVAL_MS = 60 * 60 * 1000;

export interface StaffLogin {
  /** Token que va en la cookie. Solo se entrega aquí; en la base de datos va su hash. */
  token: string;
  expiresAt: Date;
  staff: StaffProfile;
}

export interface StaffAuthentication {
  staff: StaffProfile;
  expiresAt: Date;
  /** La sesión se acaba de renovar: hay que reenviar la cookie con la nueva caducidad. */
  renewed: boolean;
}

/** Hash del token de sesión. Es aleatorio y largo, así que basta con SHA-256. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Sesiones del personal en el panel (REQ-001-40). */
@Injectable()
export class AuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly clock: Clock,
  ) {}

  /**
   * Comprueba usuario y contraseña y abre una sesión. Devuelve `null` si el usuario no
   * existe, está desactivado o la contraseña no coincide, sin decir cuál de las tres.
   */
  async login(username: string, password: string): Promise<StaffLogin | null> {
    const [member] = await this.db.select().from(staff).where(sameUsername(username));
    // Se verifica siempre una contraseña, aunque el usuario no exista, para que el tiempo
    // de respuesta no revele qué usuarios existen.
    const valid = await this.passwords.verify(
      member?.passwordHash ?? (await this.getDummyHash()),
      password,
    );
    if (!member || !member.active || !valid) {
      return null;
    }

    const token = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + STAFF_SESSION_TTL_MS);
    await this.db.insert(staffSessions).values({
      id: newId(),
      staffId: member.id,
      tokenHash: hashToken(token),
      createdAt: now,
      expiresAt,
    });
    return { token, expiresAt, staff: toProfile(member) };
  }

  /**
   * Valida el token de la cookie. Devuelve `null` si no existe, caducó o el miembro del
   * personal está desactivado. Si hace más de una hora de la última renovación, la extiende
   * otros 7 días.
   */
  async authenticate(token: string): Promise<StaffAuthentication | null> {
    const now = this.clock.now();
    const [row] = await this.db
      .select({ session: staffSessions, member: staff })
      .from(staffSessions)
      .innerJoin(staff, eq(staff.id, staffSessions.staffId))
      .where(and(eq(staffSessions.tokenHash, hashToken(token)), gt(staffSessions.expiresAt, now)));
    if (!row?.member.active) {
      return null;
    }

    const renewAt = new Date(now.getTime() + STAFF_SESSION_TTL_MS - RENEW_INTERVAL_MS);
    if (row.session.expiresAt >= renewAt) {
      return { staff: toProfile(row.member), expiresAt: row.session.expiresAt, renewed: false };
    }
    const expiresAt = new Date(now.getTime() + STAFF_SESSION_TTL_MS);
    await this.db
      .update(staffSessions)
      .set({ expiresAt })
      .where(eq(staffSessions.id, row.session.id));
    return { staff: toProfile(row.member), expiresAt, renewed: true };
  }

  /** Cierra la sesión del token dado. Si no existe, no hace nada. */
  async logout(token: string): Promise<void> {
    await this.db.delete(staffSessions).where(eq(staffSessions.tokenHash, hashToken(token)));
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash(randomBytes(16).toString('hex'));
    return this.dummyHash;
  }
}

function toProfile(member: typeof staff.$inferSelect): StaffProfile {
  return {
    id: member.id,
    username: member.username,
    displayName: member.displayName,
    role: member.role,
  };
}
