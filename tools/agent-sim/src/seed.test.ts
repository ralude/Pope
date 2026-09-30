import { type Customer, usd } from '@pope/shared';
import { describe, expect, it } from 'vitest';

import type { PanelApi } from './panel-api.js';
import { seedCustomers } from './seed.js';

/** Panel falso en memoria que apunta lo que se le pide. */
class FakePanel implements PanelApi {
  calls: string[] = [];
  customers = new Map<string, Customer>();
  shiftOpen = false;
  private counter = 0;

  login(): Promise<void> {
    return Promise.resolve();
  }
  hasOpenShift(): Promise<boolean> {
    return Promise.resolve(this.shiftOpen);
  }
  openShift(): Promise<void> {
    this.calls.push('abre turno');
    this.shiftOpen = true;
    return Promise.resolve();
  }
  closeShift(): Promise<void> {
    this.calls.push('cierra turno');
    this.shiftOpen = false;
    return Promise.resolve();
  }
  findCustomer(username: string): Promise<Customer | null> {
    return Promise.resolve(this.customers.get(username) ?? null);
  }
  createCustomer(username: string, password: string): Promise<Customer> {
    this.calls.push(`crea ${username}/${password}`);
    return Promise.resolve(this.add(username, 0));
  }
  recharge(customerId: string, amountMicros: number): Promise<Customer> {
    const customer = [...this.customers.values()].find((c) => c.id === customerId);
    if (!customer) {
      throw new Error('cliente desconocido');
    }
    this.calls.push(`recarga ${customer.username} ${String(amountMicros)}`);
    return Promise.resolve(
      this.add(customer.username, customer.balances.moneyMicros + amountMicros),
    );
  }
  add(username: string, money: number): Customer {
    this.counter += 1;
    const customer = {
      id: `id-${String(this.counter)}`,
      username,
      name: null,
      phone: null,
      status: 'active',
      loginLockedUntil: null,
      balances: { moneyMicros: money, comboSeconds: 0 },
      createdAt: '2026-09-28T22:00:00.000Z',
    } as unknown as Customer;
    this.customers.set(username, customer);
    return customer;
  }
}

describe('preparar los clientes de prueba', () => {
  it('crea los que faltan con la contraseña fija, los recarga y abre y cierra su turno', async () => {
    const panel = new FakePanel();
    const lines: string[] = [];

    await seedCustomers(panel, { customers: 2, moneyMicros: usd(3) }, (l) => lines.push(l));

    expect(panel.calls).toEqual([
      'abre turno',
      'crea sim01/sim1234',
      `recarga sim01 ${String(usd(3))}`,
      'crea sim02/sim1234',
      `recarga sim02 ${String(usd(3))}`,
      'cierra turno',
    ]);
    expect(lines.filter((l) => l.startsWith('sim0'))).toEqual([
      'sim01 · creado · recargado, saldo 3,00 USD',
      'sim02 · creado · recargado, saldo 3,00 USD',
    ]);
  });

  it('solo recarga lo que falta y no toca a quien ya tiene el saldo', async () => {
    const panel = new FakePanel();
    panel.add('sim01', usd(1));
    panel.add('sim02', usd(5));

    await seedCustomers(panel, { customers: 2, moneyMicros: usd(3) }, () => undefined);

    expect(panel.calls).toEqual(['abre turno', `recarga sim01 ${String(usd(2))}`, 'cierra turno']);
  });

  it('si ya había un turno abierto, lo usa y lo deja abierto', async () => {
    const panel = new FakePanel();
    panel.shiftOpen = true;
    await seedCustomers(panel, { customers: 1, moneyMicros: usd(1) }, () => undefined);
    expect(panel.calls).not.toContain('abre turno');
    expect(panel.calls).not.toContain('cierra turno');
    expect(panel.shiftOpen).toBe(true);
  });

  it('cierra el turno que abrió aunque algo falle', async () => {
    const panel = new FakePanel();
    panel.createCustomer = () => Promise.reject(new Error('el nodo se cayó'));
    await expect(
      seedCustomers(panel, { customers: 1, moneyMicros: usd(1) }, () => undefined),
    ).rejects.toThrow('el nodo se cayó');
    expect(panel.calls).toEqual(['abre turno', 'cierra turno']);
  });
});
