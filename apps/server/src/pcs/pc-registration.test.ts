import { createHash, randomBytes } from 'node:crypto';

import { newId, type Actor, type PcInstallationCodeResponse } from '@pope/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  events,
  pcCommands,
  pcControlStates,
  pcCredentials,
  pcInstallationCodes,
  pcMaintenances,
  pcs,
  sessions,
  staff,
} from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { FakeClock } from '../testing/clock.js';
import { PcRegistrationService } from './pc-registration.service.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const macAddress = 'AA:BB:CC:DD:EE:FF';

describe('T12c: consumo, recuperación y concurrencia en PostgreSQL/PGlite', () => {
  let node: TestApp;
  let registration: PcRegistrationService;
  let actor: Extract<Actor, { kind: 'staff' }>;
  const clock = new FakeClock();
  const consume = (code: PcInstallationCodeResponse) =>
    registration.register({ installationCode: code.code, macAddress });
  const issue = (pcId?: string) => registration.issue(pcId ? { pcId } : {}, actor);

  beforeAll(async () => {
    node = await createTestApp('local', [], { clock });
    await loginAsStaff(node, 'tecnicoregistro', 'administrador');
    const [member] = await node.database.db.select().from(staff);
    if (!member) throw new Error('Fixture del personal ausente');
    actor = { kind: 'staff', staffId: member.id, name: member.displayName };
    registration = node.app.get(PcRegistrationService);
  });
  afterAll(async () => node.close());

  it('REQ-003-10: acepta hasta 599999 ms y rechaza a los 600000 ms sin efectos', async () => {
    const valid = await issue();
    const expired = await issue();
    clock.advance(599_999);
    await consume(valid);
    clock.advance(1);
    await expect(consume(expired)).rejects.toMatchObject({
      response: { code: 'installation_code_expired' },
    });
    const [stored] = await node.database.db
      .select()
      .from(pcInstallationCodes)
      .where(eq(pcInstallationCodes.id, expired.id));
    expect(stored?.consumedAt).toBeNull();
    expect(
      await node.database.db
        .select()
        .from(pcCredentials)
        .where(eq(pcCredentials.installationCodeId, expired.id)),
    ).toHaveLength(0);
  });

  it('REQ-003-10: dos consumidores concurrentes producen una PC, credencial y evento', async () => {
    const code = await issue();
    const results = await Promise.allSettled([consume(code), consume(code)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected');
    expect(failure).toMatchObject({
      status: 'rejected',
      reason: { response: { code: 'installation_code_used' } },
    });
    expect(
      await node.database.db
        .select()
        .from(pcCredentials)
        .where(eq(pcCredentials.installationCodeId, code.id)),
    ).toHaveLength(1);
    const audit = await node.database.db
      .select()
      .from(events)
      .where(eq(events.type, 'pc.registered'));
    expect(audit.filter((event) => event.payload.codeId === code.id)).toHaveLength(1);
  });

  it('REQ-003-10: nombres concurrentes no colisionan y respetan nombres previos sin mayúsculas', async () => {
    await node.database.db.insert(pcs).values({ id: newId(), name: 'pc 04' });
    const codes = await Promise.all([issue(), issue()]);
    const registered = await Promise.all(codes.map(consume));
    expect(new Set(registered.map((result) => result.pc.name)).size).toBe(2);
    expect(registered.map((result) => result.pc.name)).toEqual(['PC 03', 'PC 05']);
  });

  it('REQ-003-10/11: respuesta perdida se recupera con otro código ligado a la misma PC', async () => {
    const originalCode = await issue();
    const original = await consume(originalCode);
    await node.database.db
      .update(pcs)
      .set({ mapRow: 2, mapCol: 3 })
      .where(eq(pcs.id, original.pc.id));
    const recovery = await issue(original.pc.id);
    const active = () =>
      node.database.db
        .select()
        .from(pcCredentials)
        .where(and(eq(pcCredentials.pcId, original.pc.id), isNull(pcCredentials.revokedAt)));
    expect((await active())[0]?.credentialHash).toBe(digest(original.credential));
    await expect(consume(originalCode)).rejects.toMatchObject({
      response: { code: 'installation_code_used' },
    });
    const recovered = await registration.register({
      installationCode: recovery.code,
      macAddress: '02:11:22:33:44:55',
    });
    expect(recovered.pc.id).toBe(original.pc.id);
    expect(recovered.pc.name).toBe(original.pc.name);
    expect(recovered.credential).not.toBe(original.credential);
    const credentials = await node.database.db
      .select()
      .from(pcCredentials)
      .where(eq(pcCredentials.pcId, original.pc.id));
    expect(
      credentials.find((item) => item.credentialHash === digest(original.credential))?.revokedAt,
    ).toEqual(clock.now());
    expect(await active()).toHaveLength(1);
    const [pc] = await node.database.db.select().from(pcs).where(eq(pcs.id, original.pc.id));
    expect(pc).toMatchObject({ mapRow: 2, mapCol: 3, macAddress: recovered.pc.macAddress });
    await expect(consume(recovery)).rejects.toMatchObject({
      response: { code: 'installation_code_used' },
    });
  });

  it('REQ-003-10/11: código desconocido o PC inexistente no emiten eventos', async () => {
    const before = await node.database.db.select().from(events);
    await expect(
      registration.register({
        installationCode: randomBytes(16).toString('base64url'),
        macAddress,
      }),
    ).rejects.toMatchObject({ response: { code: 'invalid_installation_code' } });
    await expect(issue(newId())).rejects.toMatchObject({ response: { code: 'unknown_pc' } });
    expect(await node.database.db.select().from(events)).toHaveLength(before.length);
  });

  it('REQ-003-10/11: sesión iniciada después de emitir rechaza emisión/consumo sin revocar', async () => {
    const registered = await consume(await issue());
    const recovery = await issue(registered.pc.id);
    // Fixture de sesión temporal; activa incluye también la sesión con pausa abierta.
    const sessionId = newId();
    await node.database.db.insert(sessions).values({
      id: sessionId,
      pcId: registered.pc.id,
      kind: 'temporary',
      tempName: 'Fixture',
      rateMicrosPerHour: 1_000_000,
      startedAt: clock.now(),
      lastHeartbeatAt: clock.now(),
      purchasedSeconds: 600,
      openedBy: actor,
    });
    await expect(issue(registered.pc.id)).rejects.toMatchObject({
      response: { code: 'pc_unavailable' },
    });
    await expect(consume(recovery)).rejects.toMatchObject({ response: { code: 'pc_unavailable' } });
    const [credential] = await node.database.db
      .select()
      .from(pcCredentials)
      .where(eq(pcCredentials.pcId, registered.pc.id));
    expect(credential?.revokedAt).toBeNull();
    await node.database.db
      .update(sessions)
      .set({ status: 'ended', endedAt: clock.now(), endReason: 'customer' })
      .where(eq(sessions.id, sessionId));
    expect((await consume(recovery)).pc.id).toBe(registered.pc.id);
  });

  it('REQ-003-10/11: mantenimiento abierto y reserva bloquean recuperación al emitir/consumir', async () => {
    for (const kind of ['maintenance', 'reservation'] as const) {
      const { pc } = await consume(await issue());
      const recovery = await issue(pc.id);
      if (kind === 'maintenance') {
        await node.database.db.insert(pcMaintenances).values({
          id: newId(),
          pcId: pc.id,
          pcName: pc.name,
          actor,
          source: 'panel',
          startedAt: clock.now(),
        });
      } else {
        const commandId = newId();
        const expected = { kind: 'free' as const, revision: newId() };
        const request = { id: commandId, expected, kind: 'lock' as const };
        await node.database.db.insert(pcCommands).values({
          id: commandId,
          pcId: pc.id,
          actor,
          request,
          expected,
          action: { kind: 'lock' },
          issuedAt: clock.now(),
          expiresAt: new Date(clock.now().getTime() + 30_000),
        });
        await node.database.db.insert(pcControlStates).values({
          pcId: pc.id,
          revision: expected.revision,
          reservedCommandId: commandId,
          reservedAt: clock.now(),
        });
      }
      await expect(issue(pc.id)).rejects.toMatchObject({ response: { code: 'pc_unavailable' } });
      await expect(consume(recovery)).rejects.toMatchObject({
        response: { code: 'pc_unavailable' },
      });
    }
  });

  it('REQ-003-10/11: fallo al emitir auditoría deshace PC, código y credencial', async () => {
    const code = await issue();
    const eventService = node.app.get(EventsService);
    const original = eventService.inTransaction.bind(eventService);
    const spy = vi.spyOn(eventService, 'inTransaction').mockImplementationOnce((work) =>
      original((tx) =>
        work(tx, () => {
          throw new Error('Fallo de auditoría simulado');
        }),
      ),
    );
    await expect(consume(code)).rejects.toMatchObject({ response: { code: 'internal_error' } });
    spy.mockRestore();
    const [stored] = await node.database.db
      .select()
      .from(pcInstallationCodes)
      .where(eq(pcInstallationCodes.id, code.id));
    expect(stored?.consumedAt).toBeNull();
    expect(
      await node.database.db
        .select()
        .from(pcCredentials)
        .where(eq(pcCredentials.installationCodeId, code.id)),
    ).toHaveLength(0);
    await consume(code);
  });
});
