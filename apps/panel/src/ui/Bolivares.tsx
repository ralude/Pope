// Equivalente en bolívares de un importe en USD (REQ-005-30, REQ-001-13): una línea discreta
// debajo del importe, como en el diseño, con la tasa vigente que trae el canal del panel. Sin
// tasa no se muestra nada.
import { formatBolivares, type Micros } from '@pope/shared';

import { usePcMapFeed } from '../map/channel.js';

export function Bolivares({
  amount,
  suffix = '',
  size = 12,
}: {
  amount: Micros;
  /** Detrás de «Bs», p. ej. «/h» en una tarifa. */
  suffix?: string;
  size?: number;
}) {
  const rate = usePcMapFeed().rate?.rate?.vesPerUsd;
  if (rate === undefined) return null;
  return (
    <span className="muted num bolivares" style={{ fontSize: size }}>
      {formatBolivares(amount, rate, suffix)}
    </span>
  );
}
