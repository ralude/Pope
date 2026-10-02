// Compra de combos desde el Shell (T49, REQ-001-85): respuestas del nodo y lo que muestra el
// diálogo. El nodo decide si alcanza el saldo; aquí solo se adelanta para no ofrecer lo que
// no se puede pagar.
import {
  comboRatePerHour,
  formatBolivares,
  formatMoney,
  type Micros,
  type NodeToPcMessage,
  type PcCombo,
  type VesRate,
} from '@pope/shared';

import { UNEXPECTED_MESSAGE, withPeriod } from '../lock/login.js';
import { formatTimeLeft } from './format.js';

export type CombosResult = { ok: true; combos: PcCombo[] } | { ok: false; message: string };
export type BuyResult = { ok: true } | { ok: false; message: string };

/** Respuesta del nodo a `listCombos` con ese `requestId`, o `null` si no lo es. */
export function combosReply(message: NodeToPcMessage, requestId: string): CombosResult | null {
  if (message.type === 'combos' && message.requestId === requestId) {
    return { ok: true, combos: message.combos };
  }
  if (message.type === 'error' && message.requestId === requestId) {
    return { ok: false, message: UNEXPECTED_MESSAGE };
  }
  return null;
}

/**
 * Respuesta del nodo a `buyCombo` con ese `requestId`: el `state` que la lleva si compró, o el
 * `error` con su motivo (saldo insuficiente, combo retirado…). `null` si no lo es.
 */
export function buyReply(message: NodeToPcMessage, requestId: string): BuyResult | null {
  if (message.type === 'state' && message.status === 'active' && message.requestId === requestId) {
    return { ok: true };
  }
  if (message.type === 'error' && message.requestId === requestId) {
    return message.code === 'internal_error' || message.code === 'invalid_message'
      ? { ok: false, message: UNEXPECTED_MESSAGE }
      : { ok: false, message: withPeriod(message.message) };
  }
  return null;
}

/** Un combo tal como se ofrece en el diálogo. */
export interface ComboOption {
  comboId: string;
  name: string;
  /** «20 h · 1,00 USD/h». */
  detail: string;
  price: string;
  priceBs: string | null;
  seconds: number;
  priceMicros: Micros;
  affordable: boolean;
}

export function comboOptions(
  combos: readonly PcCombo[],
  moneyMicros: Micros,
  vesRate: VesRate | null,
): ComboOption[] {
  return combos.map((combo) => {
    const price = combo.price.micros;
    const perHour = comboRatePerHour(price, combo.seconds);
    return {
      comboId: combo.comboId,
      name: combo.name,
      detail: `${formatTimeLeft(combo.seconds)} · ${formatMoney(perHour, { suffix: '/h' })}`,
      price: formatMoney(price),
      priceBs: vesRate === null ? null : formatBolivares(price, vesRate),
      seconds: combo.seconds,
      priceMicros: price,
      affordable: price <= moneyMicros,
    };
  });
}

/** Combo elegido al abrir: el de más horas que alcanza a pagar (vienen de menos a más). */
export function defaultChoice(options: readonly ComboOption[]): string | null {
  return options.findLast((option) => option.affordable)?.comboId ?? null;
}
