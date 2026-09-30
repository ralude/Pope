/**
 * Reloj del nodo. Todo lo que dependa de la hora la pide aquí, para poder probarlo con un
 * reloj simulado. El nodo local es la fuente de verdad del tiempo (ADR-0007).
 */
export abstract class Clock {
  abstract now(): Date;

  /**
   * Ejecuta `callback` cuando pasen `delayMs` milisegundos. Devuelve la función que lo
   * cancela. El reloj simulado de los tests lo dispara al avanzar su hora, sin esperar.
   */
  abstract schedule(delayMs: number, callback: () => Promise<void>): () => void;
}

/** Reloj real del sistema. */
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }

  schedule(delayMs: number, callback: () => Promise<void>): () => void {
    const timer = setTimeout(() => void callback(), delayMs);
    // Un temporizador pendiente no debe impedir que el proceso termine.
    timer.unref();
    return () => {
      clearTimeout(timer);
    };
  }
}
