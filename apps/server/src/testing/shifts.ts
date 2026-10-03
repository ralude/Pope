// Cuerpos de abrir y cerrar la caja para los tests a los que no les importan los importes
// (REQ-005-40, REQ-005-42): fondo 0 y nada contado.
import { micros, type OpeningCash, type ShiftCloseRequest } from '@pope/shared';

export const NO_OPENING_CASH: OpeningCash = { cashUsdMicros: micros(0), cashVesMicros: micros(0) };

export const NOTHING_COUNTED: ShiftCloseRequest = {
  counted: {
    cash_usd: micros(0),
    cash_ves: micros(0),
    mobile_payment: micros(0),
    pos: micros(0),
  },
};
