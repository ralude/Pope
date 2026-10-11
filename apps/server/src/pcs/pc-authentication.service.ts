import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { pcAuthorizationHeaderSchema, type PcAuthenticationError } from '@pope/shared';
import { and, eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../db/database.js';
import { pcCredentials, pcs } from '../db/schema.js';

/** Identidad obtenida del hash de la cabecera, nunca del hello ni de la MAC. */
export interface AuthenticatedPc {
  credentialId: string;
  pc: { id: string; name: string };
}

type AuthenticationResult =
  { ok: true; identity: AuthenticatedPc } | { ok: false; error: PcAuthenticationError };

const missing = { code: 'missing_pc_credential', message: 'Falta la credencial de la PC' } as const;
const invalid = { code: 'invalid_pc_credential', message: 'Credencial de PC no válida' } as const;
const revoked = { code: 'pc_credential_revoked', message: 'Credencial de PC revocada' } as const;

/** REQ-003-11/63: solo hashes SHA-256 de secretos aleatorios de 256 bits (ADR-0017). */
@Injectable()
export class PcAuthenticationService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async authenticate(header: string | undefined): Promise<AuthenticationResult> {
    if (header === undefined) return { ok: false, error: missing };
    const parsed = pcAuthorizationHeaderSchema.safeParse(header);
    if (!parsed.success) return { ok: false, error: invalid };
    const credentialHash = createHash('sha256').update(parsed.data.slice(7)).digest('hex');
    const [row] = await this.db
      .select({
        credentialId: pcCredentials.id,
        revokedAt: pcCredentials.revokedAt,
        id: pcs.id,
        name: pcs.name,
      })
      .from(pcCredentials)
      .innerJoin(pcs, eq(pcCredentials.pcId, pcs.id))
      .where(eq(pcCredentials.credentialHash, credentialHash));
    if (!row) return { ok: false, error: invalid };
    if (row.revokedAt) return { ok: false, error: revoked };
    return {
      ok: true,
      identity: { credentialId: row.credentialId, pc: { id: row.id, name: row.name } },
    };
  }

  /** Revalida antes de procesar mensajes: una admisión anterior no legitima un hash revocado. */
  async current(identity: AuthenticatedPc): Promise<boolean> {
    const [credential] = await this.db
      .select({ revokedAt: pcCredentials.revokedAt })
      .from(pcCredentials)
      .where(
        and(eq(pcCredentials.id, identity.credentialId), eq(pcCredentials.pcId, identity.pc.id)),
      );
    return credential?.revokedAt === null;
  }
}
