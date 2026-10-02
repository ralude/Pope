import { type Customer, customerSchema } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import {
  customerBadge,
  formatPhone,
  isLoginLocked,
  lockNotice,
  PAGE_SIZE,
  replaceCustomer,
  searchPath,
  statusActions,
} from './model.js';

const NOW = new Date('2026-10-01T22:30:00.000Z'); // 18:30 en Caracas

function customer(overrides: Partial<Customer> = {}): Customer {
  return customerSchema.parse({
    id: '01926000-0000-7000-8000-000000000001',
    username: 'juan',
    name: 'Juan Pérez',
    phone: '+584141234567',
    status: 'active',
    loginLockedUntil: null,
    balances: { moneyMicros: 2_960_000, comboSeconds: 1800 },
    createdAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  });
}

describe('estado de la cuenta (REQ-001-04, REQ-001-52)', () => {
  it('muestra el estado guardado si no hay bloqueo por intentos', () => {
    expect(customerBadge(customer(), NOW)).toBe('active');
    expect(customerBadge(customer({ status: 'blocked' }), NOW)).toBe('blocked');
    expect(customerBadge(customer({ status: 'disabled' }), NOW)).toBe('disabled');
  });

  it('muestra el bloqueo por intentos solo en una cuenta activa y mientras dura', () => {
    const lockedUntil = '2026-10-01T22:35:00.000Z';
    expect(customerBadge(customer({ loginLockedUntil: lockedUntil }), NOW)).toBe('locked');
    expect(customerBadge(customer({ status: 'blocked', loginLockedUntil: lockedUntil }), NOW)).toBe(
      'blocked',
    );
    const later = new Date('2026-10-01T22:35:00.000Z');
    expect(isLoginLocked(customer({ loginLockedUntil: lockedUntil }), later)).toBe(false);
    expect(customerBadge(customer({ loginLockedUntil: lockedUntil }), later)).toBe('active');
  });

  it('avisa hasta qué hora del local dura el bloqueo por intentos', () => {
    expect(lockNotice(customer())).toBeNull();
    expect(lockNotice(customer({ loginLockedUntil: '2026-10-01T22:40:00.000Z' }))).toBe(
      'Bloqueada por 5 intentos fallidos hasta las 18:40.',
    );
  });

  it('ofrece pasar a cualquiera de los otros dos estados', () => {
    expect(statusActions('active').map((a) => a.label)).toEqual(['Bloquear', 'Desactivar']);
    expect(statusActions('blocked').map((a) => a.status)).toEqual(['active', 'disabled']);
    expect(statusActions('disabled').map((a) => a.status)).toEqual(['active', 'blocked']);
  });
});

describe('formatPhone', () => {
  it('escribe el teléfono guardado como se usa en Venezuela', () => {
    expect(formatPhone('+584141234567')).toBe('0414-1234567');
    expect(formatPhone('+582125551234')).toBe('0212-5551234');
  });

  it('deja tal cual lo que no reconoce', () => {
    expect(formatPhone('12345')).toBe('12345');
  });
});

describe('searchPath', () => {
  it('pide la página sin texto si la búsqueda está vacía', () => {
    expect(searchPath('  ', 0)).toBe(`/customers?limit=${String(PAGE_SIZE)}&offset=0`);
  });

  it('codifica el texto de búsqueda', () => {
    expect(searchPath(' maría g ', 50)).toBe(
      `/customers?q=mar%C3%ADa+g&limit=${String(PAGE_SIZE)}&offset=50`,
    );
  });
});

describe('replaceCustomer', () => {
  it('sustituye solo el cliente cambiado', () => {
    const other = customer({ id: '01926000-0000-7000-8000-000000000002', username: 'maria' });
    const list = [customer(), other];
    const updated = customer({ status: 'blocked' });
    expect(replaceCustomer(list, updated)).toEqual([updated, other]);
  });
});
