import type { Customer } from '@pope/shared';

import { CustomersService } from '../customers/customers.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import type { TestApp } from './app.js';

const SYSTEM = { kind: 'system' } as const;

/**
 * Crea un cliente (contraseña `1234`) con los saldos indicados, en µUSD y en segundos de
 * combo. Los saldos se cargan con movimientos del ledger, como en la realidad.
 */
export async function createCustomerWithBalance(
  testApp: TestApp,
  username: string,
  balances: { moneyMicros?: number; comboSeconds?: number } = {},
): Promise<Customer> {
  const customer = await testApp.app
    .get(CustomersService)
    .create({ username, password: '1234', name: null, phone: null }, SYSTEM);
  const wallet = testApp.app.get(WalletService);
  await testApp.database.db.transaction(async (tx) => {
    if (balances.moneyMicros) {
      await wallet.post(tx, {
        customerId: customer.id,
        wallet: 'money',
        amount: balances.moneyMicros,
        kind: 'recharge',
        actor: SYSTEM,
      });
    }
    if (balances.comboSeconds) {
      await wallet.post(tx, {
        customerId: customer.id,
        wallet: 'combo',
        amount: balances.comboSeconds,
        kind: 'combo_purchase',
        actor: SYSTEM,
      });
    }
  });
  return customer;
}
