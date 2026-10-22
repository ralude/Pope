import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { StaffProfile } from '@pope/shared';

import { DATABASE, type Database } from '../db/database.js';
import { staff } from '../db/schema.js';
import { PasswordService } from './password.service.js';
import { sameUsername } from './staff.service.js';

export type TechnicalAuthResult =
  | { ok: true; staff: StaffProfile }
  | { ok: false; reason: 'invalid_credentials' | 'staff_inactive' | 'forbidden' };

/**
 * Valida al personal que entra en mantenimiento desde la PC (REQ-003-40). Solo comprueba
 * usuario, contraseña, estado y rol: no crea sesión ni cookie del panel. Los roles admitidos
 * son encargado y administrador; el dueño no puede entrar.
 */
@Injectable()
export class TechnicalAuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly passwords: PasswordService,
  ) {}

  async verify(username: string, password: string): Promise<TechnicalAuthResult> {
    const [member] = await this.db.select().from(staff).where(sameUsername(username));
    // Se verifica siempre una contraseña, aunque el usuario no exista: el tiempo de respuesta
    // no revela qué usuarios hay.
    const valid = await this.passwords.verify(
      member?.passwordHash ?? (await this.getDummyHash()),
      password,
    );
    if (!member || !valid) return { ok: false, reason: 'invalid_credentials' };
    if (!member.active) return { ok: false, reason: 'staff_inactive' };
    if (member.role === 'dueno') return { ok: false, reason: 'forbidden' };
    return {
      ok: true,
      staff: {
        id: member.id,
        username: member.username,
        displayName: member.displayName,
        role: member.role,
      },
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash(randomBytes(16).toString('hex'));
    return this.dummyHash;
  }
}
