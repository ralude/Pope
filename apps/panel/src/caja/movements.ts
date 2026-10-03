// La lista de movimientos de la caja (REQ-005-24): cómo se lee cada fila, como en el diseño.
// Las anulaciones (REQ-005-23) aparecen como otra fila, con su motivo, y la venta queda tachada.
import { type CashMovement, formatMoney, formatVes, LOCAL_TIME_ZONE, micros } from '@pope/shared';

import { CASH_METHOD_LABEL } from './payment.js';

const time = new Intl.DateTimeFormat('es-VE', {
  timeZone: LOCAL_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface MovementRow {
  time: string;
  what: string;
  detail: string;
  methods: string;
  amount: string;
  /** Lo cobrado en Bs, si se cobró en Bs. */
  amountBs: string | null;
  /** Se pagó (en parte) con el saldo de la cuenta: no es dinero de la caja (REQ-005-25). */
  withBalance: boolean;
  voided: boolean;
  /** Solo las ventas sin anular, y solo el administrador, pueden anularse (REQ-005-23). */
  canVoid: boolean;
}

export function movementRow(movement: CashMovement, isAdmin: boolean): MovementRow {
  // Por la moneda guardada, no por el método: los cobros de antes de la spec 005 en un método
  // de Bs se guardaron en USD, sin tasa.
  const bs = movement.payments.filter((payment) => payment.currency === 'VES');
  const bsTotal = bs.reduce((sum, payment) => sum + payment.amountMicros, 0);
  const withBalance = movement.payments.some((payment) => payment.method === 'balance');
  const detail =
    movement.source === 'void'
      ? `${movement.actorName} · motivo: ${movement.reason ?? '—'}`
      : withBalance
        ? `${movement.actorName} · con saldo`
        : movement.actorName;
  return {
    time: time.format(new Date(movement.at)),
    what: movement.voided ? `${movement.description} · anulada` : movement.description,
    detail,
    methods: movement.payments.map((payment) => CASH_METHOD_LABEL[payment.method]).join(' + '),
    amount: formatMoney(movement.usdMicros),
    amountBs: bs.length > 0 ? formatVes(micros(bsTotal)) : null,
    withBalance,
    voided: movement.voided,
    canVoid: isAdmin && movement.source === 'sale' && !movement.voided,
  };
}
