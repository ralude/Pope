import { describe, expect, it } from 'vitest';

import {
  PC_MAP_COLUMNS,
  PC_MAP_MAX_ROWS,
  panelMessageSchema,
  pcMapLayoutRequestSchema,
  pcMapSchema,
  pcMapSessionSchema,
} from './pc-map.js';

const PC = '01900000-0000-7000-8000-000000000005';
const SESSION = '01900000-0000-7000-8000-000000000123';

const session = {
  sessionId: SESSION,
  kind: 'account',
  customerId: '01900000-0000-7000-8000-000000000777',
  who: 'juan',
  openedBy: 'juan',
  startedAt: '2026-09-28T22:00:00.000Z',
  remainingSeconds: 7080,
  billedUntil: '2026-09-28T22:02:00.000Z',
  rateMicrosPerHour: 1_500_000,
  amountMicros: 2_950_000,
  comboSeconds: 0,
  ending: false,
  pause: null,
  pausesUsed: { inSession: 0, today: 0 },
};

describe('mapa de PCs del panel (REQ-001-31)', () => {
  it('admite PCs libres, con sesión y sin posición', () => {
    const map = {
      at: '2026-09-28T22:02:05.000Z',
      pcs: [
        { id: PC, name: 'PC 05', row: null, col: null, connected: true, session },
        { id: PC, name: 'PC 06', row: 0, col: 1, connected: false, session: null },
      ],
    };
    expect(pcMapSchema.parse(map)).toEqual(map);
    expect(panelMessageSchema.parse({ type: 'pcs', map })).toEqual({ type: 'pcs', map });
    expect(panelMessageSchema.parse({ type: 'interrupted', pending: 2 })).toEqual({
      type: 'interrupted',
      pending: 2,
    });
    expect(() => panelMessageSchema.parse({ type: 'interrupted', pending: -1 })).toThrow();
  });

  it('REQ-002-14: una sesión en pausa lleva su pausa y las pausas usadas; una temporal, null', () => {
    const paused = {
      ...session,
      pause: {
        startedAt: '2026-09-28T22:01:00.000Z',
        maxUntil: '2026-09-28T22:16:00.000Z',
        billing: false,
      },
      pausesUsed: { inSession: 1, today: 3 },
    };
    expect(pcMapSessionSchema.parse(paused)).toEqual(paused);
    const temporary = { ...session, kind: 'temporary', customerId: null, pausesUsed: null };
    expect(pcMapSessionSchema.parse(temporary)).toEqual(temporary);
    expect(pcMapSessionSchema.safeParse({ ...session, pause: undefined }).success).toBe(false);
    expect(
      pcMapSessionSchema.safeParse({ ...session, pausesUsed: { inSession: -1, today: 0 } }).success,
    ).toBe(false);
  });

  it('anuncia la tasa vigente, o que no hay ninguna (REQ-005-36)', () => {
    const rate = {
      vesPerUsd: 40_000_000,
      effectiveDate: '2026-09-28',
      source: 'manual',
      obtainedAt: '2026-09-28T19:20:00.000Z',
      setBy: 'Ana',
    };
    expect(panelMessageSchema.parse({ type: 'exchangeRate', rate, stale: false })).toEqual({
      type: 'exchangeRate',
      rate,
      stale: false,
    });
    expect(
      panelMessageSchema.safeParse({ type: 'exchangeRate', rate: null, stale: false }).success,
    ).toBe(true);
    expect(
      panelMessageSchema.safeParse({
        type: 'exchangeRate',
        rate: { ...rate, vesPerUsd: 0 },
        stale: false,
      }).success,
    ).toBe(false);
  });

  it('avisa de que cambió la caja o el stock, sin datos (REQ-005-24)', () => {
    expect(panelMessageSchema.parse({ type: 'cash' })).toEqual({ type: 'cash' });
  });

  it('rechaza restantes negativos, tipos de sesión desconocidos y mensajes desconocidos', () => {
    const bad = (s: object) =>
      pcMapSchema.safeParse({
        at: '2026-09-28T22:02:05.000Z',
        pcs: [{ id: PC, name: 'PC 05', row: null, col: null, connected: true, session: s }],
      }).success;
    expect(bad({ ...session, remainingSeconds: -1 })).toBe(false);
    expect(bad({ ...session, kind: 'pausada' })).toBe(false);
    expect(panelMessageSchema.safeParse({ type: 'otra' }).success).toBe(false);
  });
});

describe('distribución del mapa (REQ-001-45)', () => {
  const OTHER = '01900000-0000-7000-8000-000000000006';
  const layout = (positions: object[]) => pcMapLayoutRequestSchema.safeParse({ positions });

  it('acepta casillas dentro del mapa, también una distribución vacía', () => {
    expect(
      layout([
        { pcId: PC, row: 0, col: 0 },
        { pcId: OTHER, row: PC_MAP_MAX_ROWS - 1, col: PC_MAP_COLUMNS - 1 },
      ]).success,
    ).toBe(true);
    expect(layout([]).success).toBe(true);
  });

  it('rechaza casillas fuera del mapa', () => {
    expect(layout([{ pcId: PC, row: 0, col: PC_MAP_COLUMNS }]).success).toBe(false);
    expect(layout([{ pcId: PC, row: PC_MAP_MAX_ROWS, col: 0 }]).success).toBe(false);
    expect(layout([{ pcId: PC, row: -1, col: 0 }]).success).toBe(false);
    expect(layout([{ pcId: PC, row: 0.5, col: 0 }]).success).toBe(false);
  });

  it('rechaza una PC dos veces o dos PCs en la misma casilla', () => {
    const twice = layout([
      { pcId: PC, row: 0, col: 0 },
      { pcId: PC, row: 0, col: 1 },
    ]);
    expect(twice.error?.issues[0]?.message).toBe('Esta PC aparece dos veces');
    const shared = layout([
      { pcId: PC, row: 0, col: 0 },
      { pcId: OTHER, row: 0, col: 0 },
    ]);
    expect(shared.error?.issues[0]?.message).toBe('Dos PCs en la misma casilla');
  });
});
