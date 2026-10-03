import { type PcMapItem, type PcMapSession, pcMapSessionSchema, seconds } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import {
  cellId,
  isEnding,
  layoutOf,
  legendOf,
  liveAccount,
  liveRemaining,
  MIN_ROWS,
  movedCount,
  moveTo,
  neighborCell,
  organizeRows,
  pauseMinutes,
  tileSub,
  parseCellId,
  placePcs,
  withLayout,
  shortDuration,
  tileKind,
  tileLabel,
} from './model.js';

const session = (over: Partial<Record<keyof PcMapSession, unknown>> = {}): PcMapSession =>
  pcMapSessionSchema.parse({
    sessionId: '01900000-0000-7000-8000-000000000123',
    kind: 'account',
    customerId: '01900000-0000-7000-8000-000000000777',
    who: 'juan',
    openedBy: 'juan',
    startedAt: '2026-09-28T22:00:00.000Z',
    remainingSeconds: 600,
    billedUntil: '2026-09-28T22:10:00.000Z',
    rateMicrosPerHour: 1_500_000,
    amountMicros: 250_000,
    comboSeconds: 0,
    ending: false,
    pause: null,
    pausesUsed: { inSession: 0, today: 0 },
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

describe('organizar el mapa (T39b, REQ-001-45)', () => {
  const placed = placePcs([pc(1), pc(2), pc(3)], 4);
  const layout = layoutOf(placed);

  it('mueve una PC a una casilla vacía', () => {
    const next = moveTo(layout, pc(1).id, { row: 3, col: 2 });
    expect(next.get(pc(1).id)).toEqual({ row: 3, col: 2 });
    expect(next.get(pc(2).id)).toEqual({ row: 0, col: 1 });
    expect(movedCount(placed, next)).toBe(1);
  });

  it('intercambia dos PCs si la casilla está ocupada', () => {
    const next = moveTo(layout, pc(1).id, { row: 0, col: 2 });
    expect(next.get(pc(1).id)).toEqual({ row: 0, col: 2 });
    expect(next.get(pc(3).id)).toEqual({ row: 0, col: 0 });
    expect(movedCount(placed, next)).toBe(2);
    // Soltarla en su sitio no cambia nada.
    expect(movedCount(placed, moveTo(layout, pc(2).id, { row: 0, col: 1 }))).toBe(0);
  });

  it('la distribución en edición manda al colocar las PCs', () => {
    const next = moveTo(layout, pc(3).id, { row: 2, col: 2 });
    const again = placePcs(withLayout([pc(1), pc(2), pc(3), pc(4)], next), 4);
    expect(again.map((p) => [p.pc.name, p.row, p.col])).toEqual([
      ['PC 01', 0, 0],
      ['PC 02', 0, 1],
      ['PC 03', 2, 2],
      // Una PC nueva, que no estaba al empezar a organizar, va detrás.
      ['PC 04', 3, 0],
    ]);
  });

  it('deja una fila vacía de sobra para bajar PCs, con 7 como mínimo', () => {
    expect(organizeRows(placed)).toBe(MIN_ROWS);
    expect(organizeRows([{ pc: pc(1), row: 9, col: 0 }])).toBe(11);
  });

  it('las flechas llevan a la casilla vecina, sin salir del mapa', () => {
    expect(neighborCell({ row: 1, col: 1 }, 'ArrowRight', 7, 14)).toEqual({ row: 1, col: 2 });
    expect(neighborCell({ row: 1, col: 1 }, 'ArrowUp', 7, 14)).toEqual({ row: 0, col: 1 });
    expect(neighborCell({ row: 0, col: 0 }, 'ArrowLeft', 7, 14)).toBeNull();
    expect(neighborCell({ row: 6, col: 13 }, 'ArrowDown', 7, 14)).toBeNull();
    expect(neighborCell({ row: 1, col: 1 }, 'KeyA', 7, 14)).toBeNull();
  });

  it('los ids de casilla van y vuelven', () => {
    expect(parseCellId(cellId({ row: 2, col: 13 }))).toEqual({ row: 2, col: 13 });
    expect(parseCellId('01900000-0000-7000-8000-000000000001')).toBeNull();
    expect(parseCellId(7)).toBeNull();
  });
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
      paused: 0,
      free: 1,
      ending: 1,
      offline: 1,
      pauseBilling: 0,
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

describe('PCs en pausa en el mapa (T12, REQ-002-14, CA-002-05, CA-002-08)', () => {
  // Pausa de las 22:05 a las 22:20; el nodo cobró hasta las 22:10 con 10 min restantes.
  const paused = (billing = false) =>
    session({
      remainingSeconds: 600,
      billedUntil: '2026-09-28T22:10:00.000Z',
      pause: {
        startedAt: '2026-09-28T22:05:00.000Z',
        maxUntil: '2026-09-28T22:20:00.000Z',
        billing,
      },
      pausesUsed: { inSession: 1, today: 2 },
    });
  const at = new Date('2026-09-28T22:08:00.000Z');

  it('una PC en pausa va en morado, cobre o no', () => {
    expect(tileKind(pc(5, { session: paused() }))).toBe('paused');
    expect(tileKind(pc(5, { session: paused(true) }))).toBe('paused');
  });

  it('CA-002-08: bajo la baldosa va lo que queda de pausa, en minutos redondeados hacia arriba', () => {
    expect(tileSub(pc(5, { session: paused() }), at)).toBe('12 min');
    expect(tileSub(pc(5, { session: paused() }), new Date('2026-09-28T22:19:30.000Z'))).toBe(
      '1 min',
    );
    expect(pauseMinutes(0)).toBe('0 min');
  });

  it('en pausa el tiempo y el saldo no bajan; si ya cobra, sí', () => {
    const later = new Date('2026-09-28T22:13:00.000Z');
    expect(liveRemaining(paused(), true, later)).toBe(600);
    expect(liveAccount(paused(), true, later)).toEqual({ moneyMicros: 250_000, comboSeconds: 0 });
    expect(liveRemaining(paused(true), true, later)).toBe(420);
    // Si ya cobra, bajo la baldosa vuelve el restante de la sesión.
    expect(tileSub(pc(5, { session: paused(true) }), later)).toBe('0:07');
  });

  it('en pausa no se marca la raya roja aunque queden menos de 5 min: el tiempo está detenido', () => {
    const short = (billing: boolean) =>
      pc(5, { session: { ...paused(billing), remainingSeconds: seconds(120) } });
    expect(isEnding(short(false), at)).toBe(false);
    expect(isEnding(short(true), at)).toBe(true);
  });

  it('la leyenda cuenta las PCs en pausa, las que ya cobran y las da por ocupadas', () => {
    const legend = legendOf(
      [pc(1), pc(2, { session: paused() }), pc(3, { session: paused(true) })],
      at,
    );
    expect(legend).toMatchObject({ paused: 2, pauseBilling: 1, occupied: 2, total: 3 });
  });
});
