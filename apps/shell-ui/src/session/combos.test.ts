import { describe, expect, it } from 'vitest';

import { hours, type NodeToPcMessage, type PcCombo, usd, vesRate } from '@pope/shared';

import { UNEXPECTED_MESSAGE } from '../lock/login.js';
import { buyReply, comboOptions, combosReply, defaultChoice } from './combos.js';

const COMBO5: PcCombo = {
  comboId: '01900000-0000-7000-8000-000000000c05',
  name: 'Combo 5 horas',
  price: { micros: usd(6), currency: 'USD' },
  seconds: hours(5),
};
const COMBO20: PcCombo = {
  comboId: '01900000-0000-7000-8000-000000000c20',
  name: 'Combo 20 horas',
  price: { micros: usd(20), currency: 'USD' },
  seconds: hours(20),
};

const ACTIVE = {
  type: 'state',
  status: 'active',
  vesRate: null,
  session: {
    kind: 'temporary',
    sessionId: '01900000-0000-7000-8000-0000000000aa',
    startedAt: '2026-10-01T22:00:00.000Z',
    name: 'Carlos',
    purchasedSeconds: 1500,
    remainingSeconds: 1500,
  },
} as NodeToPcMessage;

describe('respuestas del nodo (T49)', () => {
  it('reconoce la lista de combos de su petición', () => {
    const reply: NodeToPcMessage = { type: 'combos', requestId: 'c1', combos: [COMBO20] };
    expect(combosReply(reply, 'c1')).toEqual({ ok: true, combos: [COMBO20] });
    expect(combosReply(reply, 'otro')).toBeNull();
  });

  it('la compra solo se da por hecha con el state que lleva su requestId', () => {
    expect(buyReply({ ...ACTIVE, requestId: 'b1' } as NodeToPcMessage, 'b1')).toEqual({
      ok: true,
    });
    // Un latido que se cruza no confirma nada.
    expect(buyReply(ACTIVE, 'b1')).toBeNull();
  });

  it('muestra el motivo del rechazo como frase', () => {
    expect(
      buyReply(
        {
          type: 'error',
          code: 'insufficient_balance',
          message: 'No tienes saldo suficiente para este combo. Recarga en el mostrador',
          requestId: 'b1',
        },
        'b1',
      ),
    ).toEqual({
      ok: false,
      message: 'No tienes saldo suficiente para este combo. Recarga en el mostrador.',
    });
    expect(
      buyReply({ type: 'error', code: 'internal_error', message: 'x', requestId: 'b1' }, 'b1'),
    ).toEqual({ ok: false, message: UNEXPECTED_MESSAGE });
  });
});

describe('opciones del diálogo (CA-001-17)', () => {
  it('con 25 USD alcanzan los dos y se elige el de 20 h', () => {
    const options = comboOptions([COMBO5, COMBO20], usd(25), null);
    expect(
      options.map(({ name, detail, price, affordable }) => ({ name, detail, price, affordable })),
    ).toEqual([
      { name: 'Combo 5 horas', detail: '5 h · 1,20 USD/h', price: '6,00 USD', affordable: true },
      { name: 'Combo 20 horas', detail: '20 h · 1,00 USD/h', price: '20,00 USD', affordable: true },
    ]);
    expect(defaultChoice(options)).toBe(COMBO20.comboId);
  });

  it('con poco saldo solo ofrece lo que alcanza, y sin saldo no elige ninguno', () => {
    expect(defaultChoice(comboOptions([COMBO5, COMBO20], usd(10), null))).toBe(COMBO5.comboId);
    expect(defaultChoice(comboOptions([COMBO5, COMBO20], usd(5.96), null))).toBeNull();
  });

  it('añade el precio en Bs solo si hay tasa', () => {
    expect(comboOptions([COMBO20], usd(25), null)[0]?.priceBs).toBeNull();
    expect(comboOptions([COMBO20], usd(25), vesRate(40_000_000))[0]?.priceBs).toBe('≈ 800,00 Bs');
  });
});
