import { createHash, randomBytes } from 'node:crypto';

import { HttpException, Injectable } from '@nestjs/common';
import {
  NATIVE_PC_PROTOCOL_VERSION,
  PC_INSTALLATION_CODE_TTL_SECONDS,
  newId,
  normalizePcMacAddress,
  pcInstallationCodeResponseSchema,
  pcRegistrationResponseSchema,
  type Actor,
  type PcInstallationCodeRequest,
  type PcInstallationCodeResponse,
  type PcRegistrationError,
  type PcRegistrationRequest,
  type PcRegistrationResponse,
} from '@pope/shared';
import { and, eq, isNull, isNotNull, notExists, sql } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import {
  pcControlStates,
  pcCredentials,
  pcInstallationCodes,
  pcMaintenances,
  pcs,
  sessionHolds,
  sessions,
} from '../db/schema.js';
import { EventsService, type Emit, type Transaction } from '../events/events.service.js';

const REGISTRATION_LOCK_KEY = 7_003_010;
const hash = (secret: string) => createHash('sha256').update(secret).digest('hex');

export class PcRegistrationException extends HttpException {
  constructor(code: PcRegistrationError['code'], message: string, status = 400) {
    super({ code, message } satisfies PcRegistrationError, status);
  }
}

/** Registro de un uso y recuperación ordinaria solo libre (REQ-003-10/11, ADR-0017). */
@Injectable()
export class PcRegistrationService {
  constructor(
    private readonly events: EventsService,
    private readonly clock: Clock,
  ) {}

  issue(input: PcInstallationCodeRequest, actor: Actor): Promise<PcInstallationCodeResponse> {
    return this.safeTransaction(async (tx, emit) => {
      if (actor.kind !== 'staff')
        throw new PcRegistrationException('internal_error', 'Personal requerido', 500);
      await tx.execute(sql`select pg_advisory_xact_lock(${REGISTRATION_LOCK_KEY})`);
      const pc = input.pcId ? await this.availablePc(tx, input.pcId) : null;
      const now = this.clock.now();
      const id = newId();
      const code = randomBytes(16).toString('base64url');
      const expiresAt = new Date(now.getTime() + PC_INSTALLATION_CODE_TTL_SECONDS * 1000);
      await tx.insert(pcInstallationCodes).values({
        id,
        codeHash: hash(code),
        createdByStaffId: actor.staffId,
        createdAt: now,
        expiresAt,
        targetPcId: pc?.id ?? null,
      });
      emit({
        type: 'pc.installation_code_issued',
        version: 1,
        actor,
        payload: { codeId: id, expiresAt: expiresAt.toISOString(), targetPc: pc },
      });
      return pcInstallationCodeResponseSchema.parse({
        id,
        code,
        expiresAt: expiresAt.toISOString(),
      });
    });
  }

  register(input: PcRegistrationRequest): Promise<PcRegistrationResponse> {
    return this.safeTransaction(async (tx, emit) => {
      // Serializa nombres y consumos; la fila de PC también excluye aperturas de sesión.
      await tx.execute(sql`select pg_advisory_xact_lock(${REGISTRATION_LOCK_KEY})`);
      const [code] = await tx
        .select()
        .from(pcInstallationCodes)
        .where(eq(pcInstallationCodes.codeHash, hash(input.installationCode)))
        .for('update');
      if (!code) {
        throw new PcRegistrationException(
          'invalid_installation_code',
          'Código de instalación no válido',
        );
      }
      if (code.consumedAt) {
        throw new PcRegistrationException(
          'installation_code_used',
          'Código de instalación ya utilizado',
        );
      }
      const previous = code.targetPcId ? await this.availablePc(tx, code.targetPcId) : null;
      // Leer tras adquirir todos los bloqueos evita consumir un código que caducó esperando.
      const now = this.clock.now();
      if (now >= code.expiresAt || now < code.createdAt) {
        throw new PcRegistrationException(
          'installation_code_expired',
          'Código de instalación caducado',
        );
      }
      const macAddress = normalizePcMacAddress(input.macAddress);
      const pc = previous ?? { id: newId(), name: await this.nextName(tx) };
      if (previous) {
        await tx.update(pcs).set({ macAddress }).where(eq(pcs.id, pc.id));
        await tx
          .update(pcCredentials)
          .set({ revokedAt: now })
          .where(and(eq(pcCredentials.pcId, pc.id), isNull(pcCredentials.revokedAt)));
      } else {
        await tx.insert(pcs).values({ ...pc, macAddress, createdAt: now });
      }
      await tx
        .update(pcInstallationCodes)
        .set({ consumedAt: now, consumedPcId: pc.id })
        .where(eq(pcInstallationCodes.id, code.id));
      const credentialId = newId();
      const credential = randomBytes(32).toString('base64url');
      await tx.insert(pcCredentials).values({
        id: credentialId,
        pcId: pc.id,
        installationCodeId: code.id,
        credentialHash: hash(credential),
        createdAt: now,
      });
      emit({
        type: 'pc.registered',
        version: 1,
        actor: { kind: 'system' },
        payload: { codeId: code.id, credentialId, pc, macAddress, recovery: previous !== null },
      });
      return pcRegistrationResponseSchema.parse({
        pc: { ...pc, macAddress },
        credential,
        protocolVersion: NATIVE_PC_PROTOCOL_VERSION,
      });
    });
  }

  private async availablePc(tx: Transaction, id: string): Promise<{ id: string; name: string }> {
    const [pc] = await tx
      .select({ id: pcs.id, name: pcs.name })
      .from(pcs)
      .where(eq(pcs.id, id))
      .for('update');
    if (!pc) throw new PcRegistrationException('unknown_pc', 'PC desconocida', 404);
    // T34: una PC con una sesión retenida por revocación se puede revincular (ADR-0020); con una
    // sesión normal, no. La sesión y su retención se conservan al sustituir la credencial.
    const [session] = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.pcId, id),
          eq(sessions.status, 'active'),
          notExists(
            tx
              .select({ id: sessionHolds.id })
              .from(sessionHolds)
              .where(and(eq(sessionHolds.sessionId, sessions.id), isNull(sessionHolds.endedAt))),
          ),
        ),
      )
      .limit(1);
    const [maintenance] = await tx
      .select({ id: pcMaintenances.id })
      .from(pcMaintenances)
      .where(and(eq(pcMaintenances.pcId, id), isNull(pcMaintenances.endedAt)))
      .limit(1);
    const [reservation] = await tx
      .select({ pcId: pcControlStates.pcId })
      .from(pcControlStates)
      .where(and(eq(pcControlStates.pcId, id), isNotNull(pcControlStates.reservedCommandId)))
      .limit(1);
    if (session || maintenance || reservation) {
      throw new PcRegistrationException(
        'pc_unavailable',
        'La PC debe estar libre y sin mantenimiento',
        409,
      );
    }
    return pc;
  }

  private async nextName(tx: Transaction): Promise<string> {
    const names = new Set(
      (await tx.select({ name: pcs.name }).from(pcs)).map((pc) => pc.name.toLowerCase()),
    );
    let number = 1;
    while (names.has(`pc ${String(number).padStart(2, '0')}`)) number++;
    return `PC ${String(number).padStart(2, '0')}`;
  }

  private async safeTransaction<T>(work: (tx: Transaction, emit: Emit) => Promise<T>): Promise<T> {
    try {
      return await this.events.inTransaction(work);
    } catch (error) {
      if (error instanceof PcRegistrationException) throw error;
      // No exponer parámetros SQL, hashes ni secretos en errores o logs de Nest.
      throw new PcRegistrationException('internal_error', 'No se pudo registrar la PC', 500);
    }
  }
}
