import { Clock } from '../common/clock.js';

/** Reloj simulado para los tests: marca la hora que se le indique y avanza a mano. */
export class FakeClock extends Clock {
  private current: Date;

  constructor(start: Date | string = '2026-09-25T14:00:00Z') {
    super();
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
