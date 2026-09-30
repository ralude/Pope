import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type Actor,
  type ComboSnapshot,
  type Customer,
  micros,
  type PaymentMethod,
  seconds,
} from '@pope/shared';
import { eq } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { requireCustomer } from '../customers/customers.service.js';
import { combos, customers } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { inactiveAccountMessage, WalletService } from '../wallet/wallet.service.js';

/** Cómo se paga un combo: en caja, ligado al turno (REQ-001-84), o con el saldo (REQ-001-85). */
export type ComboPayment =
  { via: 'cash_desk'; paymentMethod: PaymentMethod; shiftId: string } | { via: 'balance' };

/**
 * Venta de combos a clientes con cuenta (REQ-001-82): suma las horas al saldo de combo y,
 * si se paga con saldo, descuenta el precio del saldo en dinero. Guarda una copia del combo
 * vendido, así una edición posterior no cambia lo ya vendido (REQ-001-81, ADR-0014).
 */
@Injectable()
export class ComboSalesService {
  constructor(
    private readonly events: EventsService,
    private readonly wallet: WalletService,
    private readonly clock: Clock,
  ) {}

  /**
   * Compra un combo y emite `combo.purchased`. `sessionId` indica que la compra se hizo
   * desde el Shell durante esa sesión (T30).
   */
  async purchase(
    customerId: string,
    comboId: string,
    payment: ComboPayment,
    actor: Actor,
    sessionId: string | null = null,
  ): Promise<Customer> {
    return this.events.inTransaction(async (tx, emit) => {
      const [customer] = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .for('update');
      if (!customer) {
        throw new NotFoundException('No existe ese cliente');
      }
      if (customer.status !== 'active') {
        throw new ConflictException(inactiveAccountMessage(customer.status));
      }
      const [combo] = await tx.select().from(combos).where(eq(combos.id, comboId));
      if (!combo) {
        throw new NotFoundException('No existe ese combo');
      }
      if (!combo.active) {
        throw new ConflictException('Ese combo ya no está a la venta');
      }

      const snapshot: ComboSnapshot = {
        id: combo.id,
        name: combo.name,
        priceMicros: micros(combo.priceMicros),
        seconds: combo.seconds,
      };
      const common = {
        customerId,
        kind: 'combo_purchase' as const,
        actor,
        comboSnapshot: snapshot,
      };
      if (payment.via === 'balance') {
        // Lanza InsufficientBalanceError (409) si el saldo no alcanza.
        await this.wallet.post(tx, { ...common, wallet: 'money', amount: -combo.priceMicros });
      }
      await this.wallet.post(tx, {
        ...common,
        wallet: 'combo',
        amount: combo.seconds,
        ...(payment.via === 'cash_desk' && {
          shiftId: payment.shiftId,
          paymentMethod: payment.paymentMethod,
        }),
      });

      emit({
        type: 'combo.purchased',
        version: 1,
        actor,
        payload: {
          customer: { id: customer.id, username: customer.username },
          combo: {
            id: combo.id,
            name: combo.name,
            price: { micros: snapshot.priceMicros, currency: 'USD' },
            seconds: seconds(snapshot.seconds),
          },
          payment:
            payment.via === 'cash_desk'
              ? { via: 'cash_desk', paymentMethod: payment.paymentMethod, shiftId: payment.shiftId }
              : { via: 'balance' },
          sessionId,
        },
      });
      return requireCustomer(tx, customerId, this.clock.now());
    });
  }
}
