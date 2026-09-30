import { formatMoney, type Micros } from '@pope/shared';

import { SIM_PASSWORD, simUsername } from './args.js';
import type { PanelApi } from './panel-api.js';

export interface SeedOptions {
  /** Cuántos clientes: `sim01` … `simNN`. */
  customers: number;
  /** Saldo en dinero al que se deja cada cliente. */
  moneyMicros: Micros;
}

/**
 * Deja los clientes `sim01` … `simNN` creados y con al menos `moneyMicros` de saldo, como lo
 * haría un encargado: con el turno abierto y recargas en efectivo. Si ya existen o ya tienen
 * ese saldo, no toca nada. El turno se abre solo si no había uno y se cierra al terminar.
 */
export async function seedCustomers(
  api: PanelApi,
  options: SeedOptions,
  log: (line: string) => void,
): Promise<void> {
  const hadShift = await api.hasOpenShift();
  if (!hadShift) {
    await api.openShift();
    log('Turno de caja abierto para la preparación.');
  }
  try {
    for (let n = 1; n <= options.customers; n++) {
      const username = simUsername(n);
      let customer = await api.findCustomer(username);
      const created = customer === null;
      customer ??= await api.createCustomer(username, SIM_PASSWORD);
      const missing = options.moneyMicros - customer.balances.moneyMicros;
      if (missing > 0) {
        customer = await api.recharge(customer.id, missing as Micros);
      }
      const balance = formatMoney(customer.balances.moneyMicros);
      log(
        `${username} · ${created ? 'creado' : 'ya existía'} · ${
          missing > 0 ? `recargado, saldo ${balance}` : `saldo ${balance}, sin recargar`
        }`,
      );
    }
  } finally {
    if (!hadShift) {
      await api.closeShift();
      log('Turno de caja cerrado.');
    }
  }
}
