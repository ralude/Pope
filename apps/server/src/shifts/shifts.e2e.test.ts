import { Controller, Post } from '@nestjs/common';
import { type CashShift, type CurrentShiftResponse, newId } from '@pope/shared';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cashShifts, events } from '../db/schema.js';
import { createTestApp, type TestApp } from '../testing/app.js';
import { loginAsStaff } from '../testing/auth.js';
import { NO_OPENING_CASH, NOTHING_COUNTED } from '../testing/shifts.js';
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

describe('caja de turno del local (e2e, T17, REQ-001-03, REQ-005-44)', () => {
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

  /**
   * Abrir y cerrar llevan por defecto fondo 0 y nada contado: aquí no importan los importes
   * (los prueba shifts-closing.e2e.test.ts).
   */
  function request(method: 'GET' | 'POST', url: string, cookie: string) {
    const payload =
      method !== 'POST'
        ? undefined
        : url === '/shifts'
          ? NO_OPENING_CASH
          : url === '/shifts/current/close'
            ? NOTHING_COUNTED
            : undefined;
    return testApp.app.inject({ method, url, headers: { cookie }, ...(payload && { payload }) });
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

    it('cerrar sin caja abierta responde 409', async () => {
      const response = await request('POST', '/shifts/current/close', ana);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ message: 'No hay una caja abierta' });
    });

    it('el dueño no abre ni consulta turnos', async () => {
      expect((await request('POST', '/shifts', dueno)).statusCode).toBe(403);
      expect((await request('GET', '/shifts/current', dueno)).statusCode).toBe(403);
    });
  });

  describe('una sola caja abierta en el local (REQ-005-44)', () => {
    it('una segunda caja responde 409 sin emitir evento, aunque la pida otra persona', async () => {
      await openShift(ana);
      const before = await allEvents();
      for (const cookie of [ana, luis]) {
        const response = await request('POST', '/shifts', cookie);
        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({ message: 'Ya hay una caja abierta' });
      }
      expect(await allEvents()).toHaveLength(before.length);
    });

    it('todos ven la caja que abrió la encargada', async () => {
      const shift = await openShift(ana);
      expect(await current(luis)).toEqual(shift);
    });

    it('la cierra quien la abrió o un administrador, no otra encargada', async () => {
      const eva = await loginAsStaff(testApp, 'eva', 'encargado', 'Eva');
      const shift = await openShift(ana);
      const byEva = await request('POST', '/shifts/current/close', eva);
      expect(byEva.statusCode).toBe(403);
      expect(byEva.json()).toMatchObject({
        message: 'Solo quien abrió la caja o un administrador puede cerrarla',
      });
      const byLuis = await request('POST', '/shifts/current/close', luis);
      expect(byLuis.statusCode).toBe(200);
      expect(byLuis.json<CashShift>().id).toBe(shift.id);
      expect((await allEvents()).at(-1)).toMatchObject({
        type: 'shift.closed',
        actor: { kind: 'staff', name: 'Luis' },
      });
    });

    it('cerrada, se puede abrir otra el mismo día', async () => {
      const first = await openShift(ana);
      await request('POST', '/shifts/current/close', ana);
      const second = await openShift(luis);
      expect(second.id).not.toBe(first.id);
      expect(second.staffId).not.toBe(first.staffId);
    });

    it('la base de datos rechaza una segunda caja abierta aunque se salte el servicio', async () => {
      await openShift(ana);
      const luisId = (await request('GET', '/auth/me', luis)).json<{ id: string }>().id;
      const insertOpen = testApp.database.db
        .insert(cashShifts)
        .values({ id: newId(), staffId: luisId, openedAt: new Date() });
      await expect(insertOpen).rejects.toThrow();
    });
  });

  describe('guard "requiere turno abierto"', () => {
    it('sin caja abierta rechaza con 409', async () => {
      const response = await request('POST', '/test-shift/charge', ana);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ message: 'Abre un turno de caja para continuar' });
    });

    it('con caja abierta deja pasar y entrega la caja al endpoint', async () => {
      const shift = await openShift(ana);
      const response = await request('POST', '/test-shift/charge', ana);
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ shiftId: shift.id });
    });

    it('el administrador cobra en la caja que abrió la encargada; cerrada, nadie cobra', async () => {
      const shift = await openShift(ana);
      const byLuis = await request('POST', '/test-shift/charge', luis);
      expect(byLuis.statusCode).toBe(201);
      expect(byLuis.json()).toEqual({ shiftId: shift.id });
      await request('POST', '/shifts/current/close', ana);
      expect((await request('POST', '/test-shift/charge', luis)).statusCode).toBe(409);
    });

    it('sin sesión responde 401 antes de mirar el turno', async () => {
      const response = await testApp.app.inject({ method: 'POST', url: '/test-shift/charge' });
      expect(response.statusCode).toBe(401);
    });
  });
});
