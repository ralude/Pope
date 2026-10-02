import { describe, expect, it } from 'vitest';

import { panelMessageSchema, pcMapSchema } from './pc-map.js';

const PC = '01900000-0000-7000-8000-000000000005';
const SESSION = '01900000-0000-7000-8000-000000000123';

const session = {
  sessionId: SESSION,
  kind: 'account',
  who: 'juan',
  openedBy: 'juan',
  startedAt: '2026-09-28T22:00:00.000Z',
  remainingSeconds: 7080,
  billedUntil: '2026-09-28T22:02:00.000Z',
  rateMicrosPerHour: 1_500_000,
  amountMicros: 2_950_000,
  comboSeconds: 0,
  ending: false,
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
