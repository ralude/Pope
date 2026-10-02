import { describe, expect, it } from 'vitest';

import { actorSchema, domainEventSchema } from './events.js';

// UUIDv7 de ejemplo: solo cambia el último carácter.
const id = (n: number) => `0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a${n.toString(16).padStart(2, '0')}`;

const ANA = { kind: 'staff', staffId: id(1), name: 'Ana' };
const JUAN = { id: id(2), username: 'juan' };
const PC05 = { id: id(3), name: 'PC 05' };
const SHIFT = id(4);
const usd = (micros: number) => ({ micros, currency: 'USD' });

function envelope(type: string, payload: object, actor: object = ANA) {
  return {
    id: id(100),
    type,
    version: 1,
    actor,
    occurredAt: '2026-09-25T22:30:00Z',
    payload,
  };
}

const valid = (event: unknown) => domainEventSchema.safeParse(event).success;

/** Un ejemplo válido de cada tipo de evento del plan 001. */
const examples = {
  'customer.created': envelope('customer.created', { customer: JUAN, name: null, phone: null }),
  'customer.status_changed': envelope('customer.status_changed', {
    customer: JUAN,
    from: 'active',
    to: 'blocked',
  }),
  'customer.login_locked': envelope(
    'customer.login_locked',
    { customer: JUAN, lockedUntil: '2026-09-25T22:35:00Z' },
    { kind: 'system' },
  ),
  'customer.login_unlocked': envelope('customer.login_unlocked', { customer: JUAN }),
  'wallet.recharged': envelope('wallet.recharged', {
    customer: JUAN,
    amount: usd(3_000_000),
    paymentMethod: 'mobile_payment',
    shiftId: SHIFT,
  }),
  'combo.created': envelope('combo.created', {
    comboId: id(5),
    combo: { name: 'Combo 20 horas', price: usd(20_000_000), seconds: 72_000, active: true },
  }),
  'combo.updated': envelope('combo.updated', {
    comboId: id(5),
    before: { name: 'Combo 20 horas', price: usd(20_000_000), seconds: 72_000, active: true },
    after: { name: 'Combo 20 horas', price: usd(20_000_000), seconds: 72_000, active: false },
  }),
  'combo.purchased': envelope(
    'combo.purchased',
    {
      customer: JUAN,
      combo: { id: id(5), name: 'Combo 20 horas', price: usd(20_000_000), seconds: 72_000 },
      payment: { via: 'balance' },
      sessionId: id(6),
    },
    { kind: 'customer', customerId: JUAN.id, username: 'juan' },
  ),
  'tariff.changed': envelope('tariff.changed', {
    changes: [{ weekday: 4, from: usd(2_000_000), to: usd(1_500_000) }],
  }),
  'setting.changed': envelope('setting.changed', {
    key: 'heartbeatGraceSeconds',
    from: 180,
    to: 300,
  }),
  'session.started': envelope('session.started', {
    kind: 'temporary',
    sessionId: id(6),
    pc: PC05,
    name: 'Carlos',
    rate: usd(1_500_000),
    purchasedSeconds: 3600,
    amount: usd(1_500_000),
    paymentMethod: 'cash_usd',
    shiftId: SHIFT,
  }),
  'session.ended': envelope(
    'session.ended',
    {
      sessionId: id(6),
      pc: PC05,
      reason: 'no_heartbeat',
      billedUntil: '2026-09-25T22:00:00Z',
      usage: {
        kind: 'temporary',
        purchasedSeconds: 3600,
        usedSeconds: 1200,
        remainingSeconds: 2400,
      },
    },
    { kind: 'system' },
  ),
  'session.remaining_corrected': envelope(
    'session.remaining_corrected',
    { sessionId: id(6), pc: PC05, from: 2400, to: 1500 },
    { kind: 'system' },
  ),
  'session.time_added': envelope('session.time_added', {
    sessionId: id(6),
    pc: PC05,
    seconds: 1800,
    amount: usd(750_000),
    paymentMethod: 'pos',
    shiftId: SHIFT,
  }),
  'session.restored': envelope('session.restored', {
    sessionId: id(7),
    restoredFrom: id(6),
    pc: { id: id(8), name: 'PC 02' },
    name: 'Carlos',
    seconds: 2400,
  }),
  'shift.opened': envelope('shift.opened', { shiftId: SHIFT }),
  'shift.closed': envelope('shift.closed', { shiftId: SHIFT }),
  'staff.created': envelope(
    'staff.created',
    { staff: { id: id(9), username: 'ana' }, name: 'Ana', role: 'encargado' },
    { kind: 'system' },
  ),
  'staff.status_changed': envelope('staff.status_changed', {
    staff: { id: id(9), username: 'ana' },
    from: 'active',
    to: 'inactive',
  }),
  'pc.map_changed': envelope('pc.map_changed', {
    changes: [
      { pc: PC05, from: null, to: { row: 0, col: 4 } },
      { pc: { id: id(8), name: 'PC 02' }, from: { row: 0, col: 4 }, to: { row: 1, col: 0 } },
    ],
  }),
};

describe('eventos de auditoría (REQ-001-30, ADR-0008)', () => {
  it.each(Object.entries(examples))('%s es válido', (_type, event) => {
    expect(domainEventSchema.parse(event)).toEqual(event);
  });

  it('cubre todos los eventos del plan 001', () => {
    expect(Object.keys(examples)).toHaveLength(domainEventSchema.options.length);
  });

  it('exige id UUIDv7, versión, actor y fecha en UTC', () => {
    const base = examples['shift.opened'];
    expect(valid({ ...base, id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })).toBe(false);
    expect(valid({ ...base, version: 2 })).toBe(false);
    expect(valid({ ...base, occurredAt: '2026-09-25T18:30:00-04:00' })).toBe(false);
    expect(valid({ ...base, actor: undefined })).toBe(false);
  });

  it('rechaza tipos desconocidos', () => {
    expect(valid({ ...examples['shift.opened'], type: 'shift.reopened' })).toBe(false);
  });

  it('rechaza campos inesperados, p. ej. una contraseña (REQ-001-51)', () => {
    const created = examples['customer.created'];
    expect(valid({ ...created, payload: { ...created.payload, password: 'secreto' } })).toBe(false);
    expect(valid({ ...created, password: 'secreto' })).toBe(false);
  });
});

describe('actor (REQ-001-31, CA-001-04)', () => {
  it('lleva la copia del nombre del encargado o del cliente', () => {
    expect(actorSchema.safeParse(ANA).success).toBe(true);
    expect(actorSchema.safeParse({ kind: 'staff', staffId: id(1) }).success).toBe(false);
    expect(
      actorSchema.safeParse({ kind: 'customer', customerId: id(2), username: 'juan' }).success,
    ).toBe(true);
    expect(actorSchema.safeParse({ kind: 'system' }).success).toBe(true);
    expect(actorSchema.safeParse({ kind: 'pc' }).success).toBe(false);
  });

  it('CA-001-04: la sesión temporal figura como abierta por Ana', () => {
    const event = domainEventSchema.parse(examples['session.started']);
    expect(event.actor).toEqual({ kind: 'staff', staffId: id(1), name: 'Ana' });
  });
});

describe('importes y tiempos en los eventos (ADR-0015)', () => {
  it('solo acepta USD en micro-unidades enteras', () => {
    const recharge = examples['wallet.recharged'];
    const withAmount = (amount: object) => ({
      ...recharge,
      payload: { ...recharge.payload, amount },
    });
    expect(valid(withAmount({ micros: 3.5, currency: 'USD' }))).toBe(false);
    expect(valid(withAmount({ micros: 3_000_000, currency: 'VES' }))).toBe(false);
    expect(valid(withAmount({ micros: 0, currency: 'USD' }))).toBe(false);
    expect(valid(withAmount({ micros: -1, currency: 'USD' }))).toBe(false);
  });

  it('solo acepta los métodos de pago de la lista', () => {
    const recharge = examples['wallet.recharged'];
    const withMethod = (paymentMethod: string) => ({
      ...recharge,
      payload: { ...recharge.payload, paymentMethod },
    });
    for (const method of ['cash_usd', 'cash_ves', 'mobile_payment', 'pos']) {
      expect(valid(withMethod(method))).toBe(true);
    }
    expect(valid(withMethod('zelle'))).toBe(false);
  });

  it('la compra en caja exige método y turno (REQ-001-84)', () => {
    const purchase = examples['combo.purchased'];
    const withPayment = (payment: object) => ({
      ...purchase,
      payload: { ...purchase.payload, payment },
    });
    expect(
      valid(withPayment({ via: 'cash_desk', paymentMethod: 'cash_ves', shiftId: SHIFT })),
    ).toBe(true);
    expect(valid(withPayment({ via: 'cash_desk' }))).toBe(false);
  });

  it('el cambio de tarifa trae el día y los valores anterior y nuevo (REQ-001-15)', () => {
    const changed = examples['tariff.changed'];
    expect(valid({ ...changed, payload: { changes: [] } })).toBe(false);
    expect(
      valid({
        ...changed,
        payload: { changes: [{ weekday: 8, from: usd(1), to: usd(2) }] },
      }),
    ).toBe(false);
  });

  it('el cierre de una sesión con cuenta trae lo consumido', () => {
    const ended = examples['session.ended'];
    const usage = {
      kind: 'account',
      comboSecondsUsed: 1800,
      moneySeconds: 620,
      moneyCharged: usd(258_333),
    };
    expect(valid({ ...ended, payload: { ...ended.payload, reason: 'customer', usage } })).toBe(
      true,
    );
    expect(
      valid({
        ...ended,
        payload: { ...ended.payload, usage: { ...usage, moneySeconds: -1 } },
      }),
    ).toBe(false);
  });
});

describe('personal (REQ-001-40)', () => {
  it('staff.created solo admite los roles del personal y nunca la contraseña', () => {
    const created = examples['staff.created'];
    const withPayload = (payload: object) => ({
      ...created,
      payload: { ...created.payload, ...payload },
    });
    expect(valid(withPayload({ role: 'administrador' }))).toBe(true);
    expect(valid(withPayload({ role: 'dueno' }))).toBe(true);
    expect(valid(withPayload({ role: 'cliente' }))).toBe(false);
    expect(valid(withPayload({ password: 'secreto' }))).toBe(false);
  });
});
