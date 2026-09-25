/**
 * Reloj del nodo. Todo lo que dependa de la hora la pide aquí, para poder probarlo con un
 * reloj simulado. El nodo local es la fuente de verdad del tiempo (ADR-0007).
 */
export abstract class Clock {
  abstract now(): Date;
}

/** Reloj real del sistema. */
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
