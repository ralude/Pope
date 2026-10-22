import { newId, type PcRevokeResponse, usd } from '@pope/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sessionPauses, sessions } from '../db/schema.js';
import { devPcId } from '../pcs/dev-pcs.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import { activeSession, login, PcWorld } from '../testing/pc-world.js';
import { PausesService } from './pauses.service.js';
import { PcRequestRefused } from './session-state.js';
import { SessionsService } from './sessions.service.js';

// 18:00 en Caracas de un lunes.
const MONDAY = '2026-09-28T22:00:00Z';
const MINUTE = 60_000;

describe('sesión retenida: sin cobro, cierres ni vencimientos (e2e, REQ-003-11, REQ-002-33, T34d)', () => {
  let world: PcWorld;
  let ana: string;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    ana = await world.cashier();
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(3) });
  });

  afterEach(async () => {
    await world.close();
  });

  const db = () => world.testApp.database.db;

  async function sessionRow(id: string) {
    const [row] = await db().select().from(sessions).where(eq(sessions.id, id));
    if (!row) throw new Error('Sin sesión');
    return row;
  }

  /** PC 4 con una sesión de cuenta de 2 min vividos, ya revocada y retenida. */
  async function held() {
    const pc = await world.pc(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    await world.run(4, 2 * MINUTE);
    const response = await world.api('POST', `/pcs/${devPcId(4)}/revoke`, ana, { id: newId() });
    expect(response.json<PcRevokeResponse>().heldSessionId).toBe(sessionId);
    return { pc, sessionId };
  }

  it('REQ-003-11: 40 min con los temporizadores y el cierre por falta de latidos no cobran ni cierran', async () => {
    const { sessionId } = await held();
    const before = await sessionRow(sessionId);
    await world.clock.tick(40 * MINUTE);
    const after = await sessionRow(sessionId);
    expect(after.status).toBe('active');
    expect(after.moneyChargedMicros).toBe(before.moneyChargedMicros);
    expect(after.moneySeconds).toBe(before.moneySeconds);
    expect(after.comboSecondsUsed).toBe(before.comboSecondsUsed);
    // Cualquier revisión recibe el estado retenido y tampoco cobra.
    const { state } = await world.testApp.app
      .get(SessionsService)
      .review(eq(sessions.id, sessionId));
    expect(state).toEqual({
      type: 'state',
      status: 'held',
      sessionId,
      reason: 'credential_revoked',
    });
    expect((await sessionRow(sessionId)).moneyChargedMicros).toBe(before.moneyChargedMicros);
  });

  it('REQ-003-11: el estado de la PC retenida es held, y una PC que no nombra su sesión no la cierra', async () => {
    const { sessionId } = await held();
    const service = world.testApp.app.get(SessionsService);
    expect(await service.stateFor(devPcId(4))).toMatchObject({ status: 'held', sessionId });
    await service.reconcile(devPcId(4), { sessionId: null });
    expect((await sessionRow(sessionId)).status).toBe('active');
  });

  it('REQ-002-33: la pausa de una sesión retenida no vence ni gasta su tiempo, y no se puede quitar', async () => {
    const pc = await world.pc(4);
    const sessionId = activeSession(await login(pc, 'juan')).sessionId;
    await pc.request({ type: 'pause', requestId: 'pause-1' });
    const [pause] = await db().select().from(sessionPauses);
    await world.api('POST', `/pcs/${devPcId(4)}/revoke`, ana, { id: newId() });
    // Mucho más que el máximo de la pausa: con la retención no vence.
    await world.clock.tick(3 * 60 * MINUTE);
    const [after] = await db().select().from(sessionPauses);
    expect(after).toMatchObject({ id: pause?.id, endedAt: null, billingResumedAt: null });
    expect((await sessionRow(sessionId)).status).toBe('active');
    // El personal no la quita desde el panel mientras esté retenida.
    const resume = await world.api('POST', `/sessions/${sessionId}/resume`, ana);
    expect(resume.statusCode).toBe(409);
    expect(resume.json<{ message: string }>().message).toContain('retenida');
  });

  it('REQ-002-33: el cliente tampoco puede pausar ni reanudar con la sesión retenida', async () => {
    const { sessionId } = await held();
    expect(sessionId).toBeTruthy();
    const pauses = world.testApp.app.get(PausesService);
    await expect(pauses.pause(devPcId(4))).rejects.toBeInstanceOf(PcRequestRefused);
    await expect(pauses.resume(devPcId(4))).rejects.toBeInstanceOf(PcRequestRefused);
  });
});
