import { type NodeToPcMessage, usd } from '@pope/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loginAsStaff } from '../testing/auth.js';
import { createCustomerWithBalance } from '../testing/customers.js';
import type { PcTestClient } from '../testing/pc-client.js';
import { activeSession, heartbeat, login, logout, PcWorld } from '../testing/pc-world.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
// 18:00 en Caracas de un lunes.
const MONDAY = '2026-09-28T22:00:00Z';

const pause = (pc: PcTestClient) => pc.request({ type: 'pause', requestId: 'pause-1' });
const resume = (pc: PcTestClient) => pc.request({ type: 'resume', requestId: 'resume-1' });

/** Las pausas que quedan y el límite alcanzado, según el `state` de una sesión con cuenta. */
function allowance(message: NodeToPcMessage) {
  const session = activeSession(message);
  if (session.kind !== 'account') {
    throw new Error('Se esperaba una sesión con cuenta');
  }
  return { left: session.pausesLeft, limit: session.pauseLimit };
}

describe('límites de las pausas (e2e, spec 002)', () => {
  let world: PcWorld;
  let pc: PcTestClient;

  beforeEach(async () => {
    world = await PcWorld.start(MONDAY);
    await createCustomerWithBalance(world.testApp, 'juan', { moneyMicros: usd(20) });
    pc = await world.pc(5);
  });

  afterEach(async () => {
    await world.close();
  });

  /** Pausa y reanuda `n` veces; devuelve el último `state`. */
  async function pauses(n: number): Promise<NodeToPcMessage> {
    let last: NodeToPcMessage | null = null;
    for (let i = 0; i < n; i++) {
      await pause(pc);
      await world.run(5, MINUTE);
      last = await resume(pc);
    }
    if (!last) {
      throw new Error('Sin pausas');
    }
    return last;
  }

  it('al entrar quedan 3 pausas, y cada una resta', async () => {
    expect(allowance(await login(pc, 'juan'))).toEqual({ left: 3, limit: null });
    expect(allowance(await pause(pc))).toEqual({ left: 2, limit: null });
    expect(allowance(await resume(pc))).toEqual({ left: 2, limit: null });
    expect(allowance(await heartbeat(pc))).toEqual({ left: 2, limit: null });
  });

  it('CA-002-04: tras 3 pausas en la sesión no quedan y la cuarta se rechaza', async () => {
    await login(pc, 'juan');
    expect(allowance(await pauses(3))).toEqual({ left: 0, limit: 'session' });
    expect(await pause(pc)).toEqual({
      type: 'error',
      code: 'pause_unavailable',
      message: 'Sin pausas disponibles',
      requestId: 'pause-1',
    });
  });

  it('CA-002-06: con 5 pausas hoy en dos sesiones, la tercera no tiene; al día siguiente vuelven', async () => {
    await login(pc, 'juan');
    await pauses(3);
    await logout(pc);
    // Segunda sesión: le quedan 2, las del día.
    expect(allowance(await login(pc, 'juan'))).toEqual({ left: 2, limit: null });
    expect(allowance(await pauses(2))).toEqual({ left: 0, limit: 'day' });
    await logout(pc);

    expect(allowance(await login(pc, 'juan'))).toEqual({ left: 0, limit: 'day' });
    expect(await pause(pc)).toMatchObject({
      type: 'error',
      code: 'pause_unavailable',
      message: 'Sin pausas disponibles hoy',
    });
    await logout(pc);

    // A las 00:00 de Caracas (04:00 UTC) empieza otro día.
    world.clock.advance(6 * HOUR);
    expect(allowance(await login(pc, 'juan'))).toEqual({ left: 3, limit: null });
  });

  it('REQ-002-23: con la pausa desactivada no se puede pausar', async () => {
    const admin = await loginAsStaff(world.testApp, 'admin', 'administrador', 'Luis');
    await world.api('PUT', '/settings', admin, { pauseEnabled: 0 });
    expect(allowance(await login(pc, 'juan'))).toEqual({ left: 0, limit: 'disabled' });
    expect(await pause(pc)).toMatchObject({
      type: 'error',
      code: 'pause_unavailable',
      message: 'La pausa no está disponible en este local',
    });
  });

  it('los límites que cambia el administrador valen al momento', async () => {
    const admin = await loginAsStaff(world.testApp, 'admin', 'administrador', 'Luis');
    await world.api('PUT', '/settings', admin, { pauseMaxPerSession: 1 });
    expect(allowance(await login(pc, 'juan'))).toEqual({ left: 1, limit: null });
    expect(allowance(await pauses(1))).toEqual({ left: 0, limit: 'session' });
  });
});
