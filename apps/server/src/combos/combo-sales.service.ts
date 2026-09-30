import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type Actor,
  type ComboSnapshot,
  type Customer,
  micros,
  type PaymentMethod,
  seconds,
} from '@pope/shared';
import { and, eq } from 'drizzle-orm';

import { Clock } from '../common/clock.js';
import { requireCustomer } from '../customers/customers.service.js';
import { combos, customers, sessions } from '../db/schema.js';
import { type Emit, EventsService, type Transaction } from '../events/events.service.js';
import {
  inactiveAccountMessage,
  InsufficientBalanceError,
  WalletService,
} from '../wallet/wallet.service.js';

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
    return this.events.inTransaction((tx, emit) =>
      this.purchaseIn(tx, emit, customerId, comboId, payment, actor, sessionId),
    );
  }

  /**
   * Igual que `purchase`, dentro de una transacción ya abierta: la compra desde el Shell la
   * hace junto al cobro de la sesión, para que el saldo sea el correcto al instante.
   */
  async purchaseIn(
    tx: Transaction,
    emit: Emit,
    customerId: string,
    comboId: string,
    payment: ComboPayment,
    actor: Actor,
    sessionId: string | null = null,
  ): Promise<Customer> {
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
      // Una compra hecha desde el Shell queda ligada a la sesión en la que se hizo.
      ...(sessionId !== null && { sessionId }),
    };
    if (payment.via === 'balance') {
      // Lo que la sesión en curso ya consumió aún no está en el ledger (se liquida al
      // cerrar): el saldo en vivo es el de la cuenta menos eso. Sin esta comprobación,
      // podría gastarse en el combo dinero que ya se usó en la sesión.
      const [active] = await tx
        .select({ charged: sessions.moneyChargedMicros })
        .from(sessions)
        .where(and(eq(sessions.customerId, customerId), eq(sessions.status, 'active')));
      const { moneyMicros } = await this.wallet.balances(customerId, tx);
      if (moneyMicros - (active?.charged ?? 0) < combo.priceMicros) {
        throw new InsufficientBalanceError();
      }
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
  }
}
