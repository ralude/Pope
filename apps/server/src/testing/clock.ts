import { Clock } from '../common/clock.js';

interface ScheduledTask {
  dueAt: number;
  callback: () => Promise<void>;
}

/** Reloj simulado para los tests: marca la hora que se le indique y avanza a mano. */
export class FakeClock extends Clock {
  private current: Date;
  private tasks: ScheduledTask[] = [];

  constructor(start: Date | string = '2026-09-25T14:00:00Z') {
    super();
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  schedule(delayMs: number, callback: () => Promise<void>): () => void {
    const task = { dueAt: this.current.getTime() + delayMs, callback };
    this.tasks.push(task);
    return () => {
      this.tasks = this.tasks.filter((t) => t !== task);
    };
  }

  /** Cambia la hora sin disparar los temporizadores: un salto del reloj del nodo. */
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  /**
   * Avanza la hora `ms` milisegundos y ejecuta, en su instante y en orden, los
   * temporizadores que vencen por el camino (también los que ellos programen).
   */
  async tick(ms: number): Promise<void> {
    const target = this.current.getTime() + ms;
    for (let due = this.nextDue(target); due; due = this.nextDue(target)) {
      const task = due;
      this.tasks = this.tasks.filter((t) => t !== task);
      this.current = new Date(Math.max(this.current.getTime(), task.dueAt));
      await task.callback();
    }
    this.current = new Date(target);
  }

  private nextDue(target: number): ScheduledTask | undefined {
    return this.tasks
      .filter((t) => t.dueAt <= target)
      .sort((a, b) => a.dueAt - b.dueAt)
      .at(0);
  }
}
