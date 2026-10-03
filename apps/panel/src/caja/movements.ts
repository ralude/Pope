// La tabla de movimientos de la caja (REQ-005-24, REQ-005-26), como la de SENET: cada fila con
// hora, cliente, estado, descripción, método y total con signo, y su detalle al tocarla. Las
// anulaciones (REQ-005-23) son otra fila, que resta, y la venta queda tachada. La última fila
// es la apertura de la caja.
import {
  type CashMovement,
  formatMoney,
  formatVes,
  LOCAL_TIME_ZONE,
  type Micros,
  micros,
  type OpeningCash,
} from '@pope/shared';

import { CASH_METHOD_LABEL } from './payment.js';

const time = new Intl.DateTimeFormat('es-VE', {
  timeZone: LOCAL_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export type MovementState = 'Cobrado' | 'Con saldo' | 'Anulada' | 'Anulación' | 'Apertura';

export interface MovementRow {
  time: string;
  /** La cuenta del cobro, o «—». */
  customer: string;
  state: MovementState;
  description: string;
  methods: string;
  /** Con signo: «+4,00 USD», «−2,00 USD»; «—» en la apertura. */
  total: string;
  /** Lo cobrado en Bs, si se cobró en Bs. */
  totalBs: string | null;
  /** Resta (una anulación): se pinta en rojo. */
  negative: boolean;
  voided: boolean;
  /** Solo las ventas sin anular, y solo el administrador, pueden anularse (REQ-005-23). */
  canVoid: boolean;
  /** Lo que se ve al tocar la fila: las líneas, el pago y quién. */
  details: string[];
}

/** «+4,00 USD» o «−2,00 USD», como en la caja de SENET. */
export function signedMoney(amount: Micros): string {
  return `${amount < 0 ? '−' : '+'}${formatMoney(micros(Math.abs(amount)))}`;
}

function stateOf(movement: CashMovement): MovementState {
  if (movement.source === 'void') return 'Anulación';
  if (movement.voided) return 'Anulada';
  if (movement.payments.every((payment) => payment.method === 'balance')) return 'Con saldo';
  return 'Cobrado';
}

/** Cada pago con su importe en su moneda y, en Bs, la tasa: «Pago móvil 160,00 Bs a 40,00…». */
function paymentText(payment: CashMovement['payments'][number]): string {
  const label = CASH_METHOD_LABEL[payment.method];
  const amount = micros(Math.abs(payment.amountMicros));
  if (payment.currency === 'VES') {
    const rate = payment.vesRate === null ? '' : ` a ${formatVes(micros(payment.vesRate))} por USD`;
    return `${label} ${formatVes(amount)}${rate}`;
  }
  return `${label} ${formatMoney(amount)}`;
}

export function movementRow(movement: CashMovement, isAdmin: boolean): MovementRow {
  // Por la moneda guardada, no por el método: los cobros de antes de la spec 005 en un método
  // de Bs se guardaron en USD, sin tasa.
  const bs = movement.payments.filter((payment) => payment.currency === 'VES');
  const bsTotal = Math.abs(bs.reduce((sum, payment) => sum + payment.amountMicros, 0));
  const state = stateOf(movement);
  const lines = movement.lines.map((line) =>
    line.kind === 'other'
      ? `${line.name} · ${formatMoney(line.usdMicros)}`
      : `${line.name} × ${String(line.quantity)} · ${formatMoney(line.usdMicros)}`,
  );
  const who =
    movement.source === 'void'
      ? `Anuló ${movement.actorName} · motivo: ${movement.reason ?? '—'}`
      : `Cobró ${movement.actorName}`;
  const balance =
    state === 'Con saldo' && movement.customerName !== null
      ? [`Pagado con el saldo de ${movement.customerName}: no entra en la caja`]
      : [];
  return {
    time: time.format(new Date(movement.at)),
    customer: movement.customerName ?? '—',
    state,
    description: movement.description,
    methods: movement.payments.map((payment) => CASH_METHOD_LABEL[payment.method]).join(' + '),
    total: signedMoney(movement.usdMicros),
    totalBs: bs.length > 0 ? formatVes(micros(bsTotal)) : null,
    negative: movement.usdMicros < 0,
    voided: movement.voided,
    canVoid: isAdmin && movement.source === 'sale' && !movement.voided,
    details: [...lines, movement.payments.map(paymentText).join(' + '), ...balance, who],
  };
}

/** La última fila: la apertura de la caja, con su hora, quién y el fondo (REQ-005-40). */
export function openingRow(openedAt: string, staffName: string, opening: OpeningCash): MovementRow {
  const fund = `${formatMoney(opening.cashUsdMicros)} y ${formatVes(opening.cashVesMicros)}`;
  return {
    time: time.format(new Date(openedAt)),
    customer: '—',
    state: 'Apertura',
    description: `Apertura de caja · fondo ${fund}`,
    methods: '—',
    total: '—',
    totalBs: null,
    negative: false,
    voided: false,
    canVoid: false,
    details: [`Abrió ${staffName} con ${fund} en efectivo`],
  };
}
