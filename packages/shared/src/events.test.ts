import { describe, expect, it } from 'vitest';

import { actorSchema, domainEventSchema, shiftClosedV2EventSchema } from './events.js';

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
  // Spec 005 (REQ-005-34): tasa manual escrita por Ana.
  'exchange_rate.set': envelope('exchange_rate.set', {
    vesPerUsd: 40_000_000,
    effectiveDate: '2026-09-25',
    source: 'manual',
  }),
  // Spec 005, parte 2: inventario.
  'product.created': envelope('product.created', {
    productId: id(10),
    product: { name: 'Doritos', price: usd(1_500_000), minStock: 5, active: true },
  }),
  'product.updated': envelope('product.updated', {
    productId: id(10),
    before: { name: 'Doritos', price: usd(1_500_000), minStock: 5, active: true },
    after: { name: 'Doritos', price: usd(1_750_000), minStock: 5, active: true },
  }),
  'product.photo_set': envelope('product.photo_set', {
    product: { id: id(10), name: 'Doritos' },
    photo: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a0a-3f2a9c.webp',
  }),
  'stock.moved': envelope('stock.moved', {
    kind: 'restock',
    product: { id: id(10), name: 'Doritos' },
    quantity: 24,
    reason: null,
  }),
  'sale_concept.created': envelope('sale_concept.created', {
    conceptId: id(11),
    concept: { name: 'Impresiones', unitPrice: usd(100_000), active: true },
  }),
  'sale_concept.updated': envelope('sale_concept.updated', {
    conceptId: id(11),
    before: { name: 'Impresiones', unitPrice: usd(100_000), active: true },
    after: { name: 'Impresiones', unitPrice: usd(150_000), active: true },
  }),
  // Spec 005, parte 2: ventas. Un refresco en Bs (CA-005-02) y 12 impresiones en USD.
  'sale.recorded': envelope('sale.recorded', {
    saleId: id(12),
    shiftId: SHIFT,
    customer: null,
    lines: [
      {
        kind: 'product',
        id: id(13),
        name: 'Refresco',
        quantity: 1,
        unitPrice: usd(1_000_000),
        total: usd(1_000_000),
      },
      {
        kind: 'concept',
        id: id(11),
        name: 'Impresiones',
        quantity: 12,
        unitPrice: usd(100_000),
        total: usd(1_200_000),
      },
    ],
    payments: [
      {
        method: 'cash_ves',
        amount: { micros: 40_000_000, currency: 'VES' },
        usd: usd(1_000_000),
        vesRate: 40_000_000,
      },
      { method: 'cash_usd', amount: usd(1_200_000), usd: usd(1_200_000), vesRate: null },
    ],
    total: usd(2_200_000),
  }),
  'sale.voided': envelope('sale.voided', {
    saleId: id(12),
    shiftId: SHIFT,
    reason: 'error de cobro',
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

describe('inventario (REQ-005-02, REQ-005-10)', () => {
  it('el cambio de precio queda con el anterior y el nuevo', () => {
    const event = domainEventSchema.parse(examples['product.updated']);
    expect(event.type === 'product.updated' && event.payload.before.price.micros).toBe(1_500_000);
    expect(event.type === 'product.updated' && event.payload.after.price.micros).toBe(1_750_000);
  });

  it('la entrada sube, la merma baja y los dos con su signo; ajuste y merma llevan motivo', () => {
    const moved = examples['stock.moved'];
    const withPayload = (payload: object) => ({
      ...moved,
      payload: { ...moved.payload, ...payload },
    });
    expect(valid(withPayload({ quantity: -24 }))).toBe(false);
    expect(valid(withPayload({ kind: 'waste', quantity: -1, reason: 'Vencido' }))).toBe(true);
    expect(valid(withPayload({ kind: 'waste', quantity: 1, reason: 'Vencido' }))).toBe(false);
    expect(valid(withPayload({ kind: 'waste', quantity: -1, reason: null }))).toBe(false);
    expect(valid(withPayload({ kind: 'adjustment', quantity: -2, reason: 'Conteo' }))).toBe(true);
    expect(valid(withPayload({ kind: 'adjustment', quantity: 0, reason: 'Conteo' }))).toBe(false);
    expect(valid(withPayload({ kind: 'sale', quantity: -1, reason: null }))).toBe(false);
  });
});

describe('ventas (REQ-005-21, REQ-005-23)', () => {
  it('el pago con saldo lleva la cuenta del cliente', () => {
    const recorded = examples['sale.recorded'];
    const payload = {
      ...recorded.payload,
      customer: JUAN,
      payments: [{ method: 'balance', amount: usd(2_200_000), usd: usd(2_200_000), vesRate: null }],
    };
    expect(valid({ ...recorded, payload })).toBe(true);
  });

  it('sin líneas, sin pagos o con importes en 0 no vale', () => {
    const recorded = examples['sale.recorded'];
    const withPayload = (patch: object) => ({
      ...recorded,
      payload: { ...recorded.payload, ...patch },
    });
    expect(valid(withPayload({ lines: [] }))).toBe(false);
    expect(valid(withPayload({ payments: [] }))).toBe(false);
    expect(valid(withPayload({ total: usd(0) }))).toBe(false);
  });

  it('la anulación pide motivo', () => {
    const voided = examples['sale.voided'];
    expect(valid({ ...voided, payload: { ...voided.payload, reason: '' } })).toBe(false);
  });
});

describe('cobros en caja, versión 2 (REQ-005-22)', () => {
  const inBs = {
    method: 'mobile_payment',
    amount: { micros: 120_000_000, currency: 'VES' },
    usd: usd(3_000_000),
    vesRate: 40_000_000,
  };
  const inUsd = { method: 'cash_usd', amount: usd(3_000_000), usd: usd(3_000_000), vesRate: null };
  const recharged = (payment: object) => ({
    ...envelope('wallet.recharged', {
      customer: JUAN,
      amount: usd(3_000_000),
      payment,
      shiftId: SHIFT,
    }),
    version: 2,
  });

  it('la recarga lleva el pago en Bs con su tasa, o en USD sin ella', () => {
    expect(valid(recharged(inBs))).toBe(true);
    expect(valid(recharged(inUsd))).toBe(true);
    expect(valid(recharged({ ...inBs, vesRate: null }))).toBe(false);
    expect(valid(recharged({ ...inUsd, vesRate: 40_000_000 }))).toBe(false);
    expect(valid(recharged({ ...inUsd, method: 'balance' }))).toBe(false);
  });

  it('la versión 2 ya no lleva paymentMethod suelto', () => {
    const v1 = examples['wallet.recharged'];
    expect(valid({ ...v1, version: 2 })).toBe(false);
    expect(valid(v1)).toBe(true);
  });

  it('temporales, tiempo añadido y combos en caja llevan el pago completo', () => {
    const started = {
      ...envelope('session.started', {
        kind: 'temporary',
        sessionId: id(6),
        pc: PC05,
        name: 'Carlos',
        rate: usd(1_500_000),
        purchasedSeconds: 3600,
        amount: usd(1_500_000),
        payment: { ...inBs, amount: { micros: 60_000_000, currency: 'VES' }, usd: usd(1_500_000) },
        shiftId: SHIFT,
      }),
      version: 2,
    };
    const added = {
      ...envelope('session.time_added', {
        sessionId: id(6),
        pc: PC05,
        seconds: 1800,
        amount: usd(750_000),
        payment: { ...inUsd, amount: usd(750_000), usd: usd(750_000) },
        shiftId: SHIFT,
      }),
      version: 2,
    };
    const combo = {
      ...envelope('combo.purchased', {
        customer: JUAN,
        combo: { id: id(5), name: 'Combo 20 horas', price: usd(20_000_000), seconds: 72_000 },
        payment: {
          via: 'cash_desk',
          payment: { ...inUsd, amount: usd(20_000_000), usd: usd(20_000_000) },
          shiftId: SHIFT,
        },
        sessionId: null,
      }),
      version: 2,
    };
    for (const event of [started, added, combo]) {
      expect(domainEventSchema.parse(event)).toEqual(event);
    }
    expect(valid({ ...combo, payload: { ...combo.payload, payment: { via: 'balance' } } })).toBe(
      true,
    );
  });
});

describe('turno de caja, versión 2 (REQ-005-40, REQ-005-42)', () => {
  const opened = {
    ...envelope('shift.opened', {
      shiftId: SHIFT,
      openingCash: { usd: usd(20_000_000), ves: { micros: 500_000_000, currency: 'VES' } },
    }),
    version: 2,
  };
  const method = (expected: number, counted: number, currency = 'VES') => ({
    currency,
    expected,
    counted,
    difference: counted - expected,
  });
  const methods = {
    cash_usd: method(50_000_000, 45_000_000, 'USD'),
    cash_ves: method(580_000_000, 580_000_000),
    mobile_payment: method(160_000_000, 160_000_000),
    pos: method(0, 0),
  };
  const closed = { ...envelope('shift.closed', { shiftId: SHIFT, methods }), version: 2 };
  const withMethods = (patch: object) => ({
    ...closed,
    payload: { shiftId: SHIFT, methods: patch },
  });

  it('la apertura lleva el fondo en USD y en Bs', () => {
    expect(domainEventSchema.parse(opened)).toEqual(opened);
    expect(valid({ ...opened, payload: { shiftId: SHIFT } })).toBe(false);
  });

  it('CA-005-03: el cierre guarda la diferencia de −5 USD', () => {
    expect(valid(closed)).toBe(true);
    expect(shiftClosedV2EventSchema.parse(closed).payload.methods.cash_usd).toEqual({
      currency: 'USD',
      expected: 50_000_000,
      counted: 45_000_000,
      difference: -5_000_000,
    });
  });

  it('el cierre lleva los cuatro métodos, y nada más', () => {
    expect(valid(withMethods({ ...methods, pos: undefined }))).toBe(false);
    expect(valid(withMethods({ ...methods, balance: method(0, 0) }))).toBe(false);
    expect(valid(withMethods({ ...methods, pos: method(0, -1) }))).toBe(false);
  });

  it('la versión 1, sin fondo ni conteo, sigue siendo válida', () => {
    expect(valid(examples['shift.opened'])).toBe(true);
    expect(valid(examples['shift.closed'])).toBe(true);
    expect(valid({ ...examples['shift.closed'], version: 3 })).toBe(false);
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
