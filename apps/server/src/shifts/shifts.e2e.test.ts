import { Controller, Post } from '@nestjs/common';
import { type CashShift, type CurrentShiftResponse, newId } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cashShifts, events } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { CurrentShift, RequiresOpenShift } from './open-shift.guard.js';

/** Endpoint solo para el test, para probar el guard "requiere turno abierto". */
@Controller('test-shift')
class ShiftProbeController {
  @RequiresOpenShift()
  @Post('charge')
  charge(@CurrentShift() shift: CashShift): { shiftId: string } {
    return { shiftId: shift.id };
  }
}

describe('turno de caja mínimo (e2e, T17, REQ-001-03)', () => {
  let testApp: TestApp;
  let ana: string;
  let luis: string;
  let dueno: string;

  beforeEach(async () => {
    testApp = await createTestApp('local', [ShiftProbeController]);
    ana = await loginAsStaff(testApp, 'ana', 'encargado', 'Ana');
    luis = await loginAsStaff(testApp, 'luis', 'administrador', 'Luis');
    dueno = await loginAsStaff(testApp, 'dueno', 'dueno');
  });

  afterEach(async () => {
    await testApp.close();
  });

  function request(method: 'GET' | 'POST', url: string, cookie: string) {
    return testApp.app.inject({ method, url, headers: { cookie } });
  }

  async function openShift(cookie: string): Promise<CashShift> {
    const response = await request('POST', '/shifts', cookie);
    expect(response.statusCode).toBe(201);
    return response.json<CashShift>();
  }

  const current = async (cookie: string) =>
    (await request('GET', '/shifts/current', cookie)).json<CurrentShiftResponse>().shift;

  const allEvents = () => testApp.database.db.select().from(events).orderBy(asc(events.seq));

  describe('abrir y cerrar', () => {
    it('la encargada abre su turno y emite shift.opened', async () => {
      expect(await current(ana)).toBeNull();
      const shift = await openShift(ana);
      expect(shift.closedAt).toBeNull();
      expect(await current(ana)).toEqual(shift);
      expect((await allEvents()).at(-1)).toMatchObject({
        type: 'shift.opened',
        actor: { kind: 'staff', name: 'Ana' },
        payload: { shiftId: shift.id },
      });
    });

    it('cierra su turno, emite shift.closed y puede abrir otro', async () => {
      const first = await openShift(ana);
      const response = await request('POST', '/shifts/current/close', ana);
      expect(response.statusCode).toBe(200);
      const closed = response.json<CashShift>();
      expect(closed.id).toBe(first.id);
      expect(closed.closedAt).not.toBeNull();
      expect((await allEvents()).at(-1)).toMatchObject({
        type: 'shift.closed',
        actor: { kind: 'staff', name: 'Ana' },
        payload: { shiftId: first.id },
      });
      expect(await current(ana)).toBeNull();
      const second = await openShift(ana);
      expect(second.id).not.toBe(first.id);
    });

    it('cerrar sin turno abierto responde 409', async () => {
      const response = await request('POST', '/shifts/current/close', ana);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ message: 'No tienes un turno de caja abierto' });
    });

    it('el dueño no abre ni consulta turnos', async () => {
      expect((await request('POST', '/shifts', dueno)).statusCode).toBe(403);
      expect((await request('GET', '/shifts/current', dueno)).statusCode).toBe(403);
    });
  });

  describe('un solo turno abierto por miembro del personal', () => {
    it('un segundo turno abierto responde 409 sin emitir evento', async () => {
      await openShift(ana);
      const before = await allEvents();
      const response = await request('POST', '/shifts', ana);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ message: 'Ya tienes un turno de caja abierto' });
      expect(await allEvents()).toHaveLength(before.length);
    });

    it('cada miembro del personal tiene su propio turno', async () => {
      const anaShift = await openShift(ana);
      const luisShift = await openShift(luis);
      expect(anaShift.id).not.toBe(luisShift.id);
      await request('POST', '/shifts/current/close', luis);
      expect(await current(ana)).toEqual(anaShift);
    });

    it('la base de datos rechaza un segundo turno abierto aunque se salte el servicio', async () => {
      const shift = await openShift(ana);
      const insertOpen = testApp.database.db
        .insert(cashShifts)
        .values({ id: newId(), staffId: shift.staffId, openedAt: new Date() });
      await expect(insertOpen).rejects.toThrow();
    });
  });

  describe('guard "requiere turno abierto"', () => {
    it('sin turno abierto rechaza con 409', async () => {
      const response = await request('POST', '/test-shift/charge', ana);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ message: 'Abre un turno de caja para continuar' });
    });

    it('con turno abierto deja pasar y entrega el turno al endpoint', async () => {
      const shift = await openShift(ana);
      const response = await request('POST', '/test-shift/charge', ana);
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ shiftId: shift.id });
    });

    it('el turno de otro no sirve y, tras cerrar el propio, vuelve a rechazar', async () => {
      await openShift(luis);
      expect((await request('POST', '/test-shift/charge', ana)).statusCode).toBe(409);
      await openShift(ana);
      await request('POST', '/shifts/current/close', ana);
      expect((await request('POST', '/test-shift/charge', ana)).statusCode).toBe(409);
    });

    it('sin sesión responde 401 antes de mirar el turno', async () => {
      const response = await testApp.app.inject({ method: 'POST', url: '/test-shift/charge' });
      expect(response.statusCode).toBe(401);
    });
  });
});
