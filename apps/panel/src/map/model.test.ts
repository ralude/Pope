import { type PcMapItem, type PcMapSession, pcMapSessionSchema } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import {
  legendOf,
  liveAccount,
  liveRemaining,
  placePcs,
  shortDuration,
  tileKind,
  tileLabel,
} from './model.js';

const session = (over: Partial<Record<keyof PcMapSession, unknown>> = {}): PcMapSession =>
  pcMapSessionSchema.parse({
    sessionId: '01900000-0000-7000-8000-000000000123',
    kind: 'account',
    who: 'juan',
    openedBy: 'juan',
    startedAt: '2026-09-28T22:00:00.000Z',
    remainingSeconds: 600,
    billedUntil: '2026-09-28T22:10:00.000Z',
    rateMicrosPerHour: 1_500_000,
    amountMicros: 250_000,
    comboSeconds: 0,
    ending: false,
    ...over,
  });

const pc = (n: number, over: Partial<PcMapItem> = {}): PcMapItem => ({
  id: `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`,
  name: `PC ${String(n).padStart(2, '0')}`,
  row: null,
  col: null,
  connected: true,
  session: null,
  ...over,
});

describe('mapa de PCs (T39)', () => {
  it('cada baldosa toma el color de su estado', () => {
    expect(tileKind(pc(1))).toBe('free');
    expect(tileKind(pc(1, { connected: false }))).toBe('offline');
    expect(tileKind(pc(1, { session: session() }))).toBe('account');
    expect(tileKind(pc(1, { session: session({ kind: 'temporary' }) }))).toBe('temporary');
    // Con sesión pero sin conexión, manda la sesión: sigue abierta durante la gracia.
    expect(tileKind(pc(1, { connected: false, session: session() }))).toBe('account');
  });

  it('sin posición guardada, las PCs van por orden de número, fila a fila', () => {
    const placed = placePcs([pc(10), pc(2), pc(1)], 2);
    expect(placed.map((p) => [p.pc.name, p.row, p.col])).toEqual([
      ['PC 01', 0, 0],
      ['PC 02', 0, 1],
      ['PC 10', 1, 0],
    ]);
  });

  it('respeta las posiciones guardadas y coloca el resto después, sin pisarlas', () => {
    const placed = placePcs(
      [pc(1, { row: 0, col: 3 }), pc(2), pc(3, { row: 1, col: 0 }), pc(4)],
      4,
    );
    expect(placed.map((p) => [p.pc.name, p.row, p.col])).toEqual([
      ['PC 01', 0, 3],
      ['PC 03', 1, 0],
      ['PC 02', 2, 0],
      ['PC 04', 2, 1],
    ]);
  });

  it('el restante baja en vivo desde el último cobro, salvo con la PC desconectada', () => {
    const s = session({ remainingSeconds: 600, billedUntil: '2026-09-28T22:10:00.000Z' });
    expect(liveRemaining(s, true, new Date('2026-09-28T22:10:45.900Z'))).toBe(555);
    expect(liveRemaining(s, true, new Date('2026-09-28T23:10:00.000Z'))).toBe(0);
    expect(liveRemaining(s, true, new Date('2026-09-28T22:09:00.000Z'))).toBe(600);
    expect(liveRemaining(s, false, new Date('2026-09-28T22:20:00.000Z'))).toBe(600);
  });

  it('la baldosa muestra el número de la PC', () => {
    expect(tileLabel('PC 05')).toBe('5');
    expect(tileLabel('PC-12')).toBe('12');
    expect(tileLabel('Caja')).toBe('Caja');
  });

  it('el restante corto lleva horas y minutos', () => {
    expect(shortDuration(7080)).toBe('1:58');
    expect(shortDuration(59)).toBe('0:00');
    expect(shortDuration(36_000)).toBe('10:00');
  });

  it('la leyenda cuenta cada estado y la ocupación', () => {
    const now = new Date('2026-09-28T22:10:00.000Z');
    const legend = legendOf(
      [
        pc(1),
        pc(2, { connected: false }),
        pc(3, { session: session() }),
        pc(4, { session: session({ kind: 'temporary', remainingSeconds: 200 }) }),
        pc(5, { connected: false, session: session() }),
      ],
      now,
    );
    expect(legend).toEqual({
      account: 2,
      temporary: 1,
      free: 1,
      ending: 1,
      offline: 1,
      occupied: 3,
      total: 5,
    });
  });

  it('el saldo en vivo gasta primero las horas de combo y luego el dinero', () => {
    const s = session({
      rateMicrosPerHour: 1_200_000,
      amountMicros: 1_000_000,
      comboSeconds: 60,
      billedUntil: '2026-09-28T22:10:00.000Z',
    });
    // 60 s de combo y 120 s de dinero a 1,20 USD/h = 0,04 USD.
    const at = new Date('2026-09-28T22:13:00.000Z');
    expect(liveAccount(s, true, at)).toEqual({ moneyMicros: 960_000, comboSeconds: 0 });
    expect(liveAccount(s, false, at)).toEqual({ moneyMicros: 1_000_000, comboSeconds: 60 });
  });
});
