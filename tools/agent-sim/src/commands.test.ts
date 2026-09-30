import { describe, expect, it } from 'vitest';

import {
  type Command,
  type ControlledPc,
  describeSnapshot,
  executeCommand,
  parseCommand,
} from './commands.js';
import type { LoginResult, PcSnapshot } from './simulated-pc.js';

const ok = (command: Command) => ({ ok: true, command });

describe('intérprete de órdenes', () => {
  it('entiende cada orden', () => {
    expect(parseCommand('login 5 sim05 sim1234')).toEqual(
      ok({ name: 'login', pc: 5, username: 'sim05', password: 'sim1234' }),
    );
    expect(parseCommand('logout 5')).toEqual(ok({ name: 'logout', pc: 5 }));
    expect(parseCommand('red 3 20')).toEqual(ok({ name: 'red', pc: 3, seconds: 20 }));
    expect(parseCommand('reinicio 2')).toEqual(ok({ name: 'reinicio', pc: 2 }));
    expect(parseCommand('apagon 4')).toEqual(ok({ name: 'apagon', pc: 4 }));
    expect(parseCommand('luz 4')).toEqual(ok({ name: 'luz', pc: 4 }));
    expect(parseCommand('estado')).toEqual(ok({ name: 'estado' }));
    expect(parseCommand('  AYUDA ')).toEqual(ok({ name: 'ayuda' }));
    expect(parseCommand('salir')).toEqual(ok({ name: 'salir' }));
  });

  it('una línea vacía no es una orden', () => {
    expect(parseCommand('')).toBeNull();
    expect(parseCommand('   ')).toBeNull();
  });

  it('explica en español lo que está mal escrito', () => {
    const error = (line: string) => {
      const parsed = parseCommand(line);
      return parsed && !parsed.ok ? parsed.error : null;
    };
    expect(error('bailar 3')).toContain('Orden desconocida: "bailar"');
    expect(error('logout')).toContain('número de PC');
    expect(error('logout 0')).toContain('de 1 a 99');
    expect(error('logout abc')).toContain('número de PC');
    expect(error('red 3')).toContain('red N segundos');
    expect(error('red 3 -5')).toContain('red N segundos');
    expect(error('login 5 sim05')).toContain('usuario y contraseña');
  });
});

class FakePc implements ControlledPc {
  calls: string[] = [];
  state: PcSnapshot;
  loginResult: LoginResult | Error = {
    ok: true,
    ms: 10,
    message: { type: 'state', status: 'locked' },
  };

  constructor(
    readonly number: number,
    overrides: Partial<PcSnapshot> = {},
  ) {
    this.state = {
      number,
      name: `PC 0${String(number)}`,
      connected: true,
      poweredOff: false,
      sessionId: null,
      who: null,
      localRemainingSeconds: null,
      ...overrides,
    };
  }
  get name(): string {
    return this.state.name;
  }
  snapshot(): PcSnapshot {
    return this.state;
  }
  login(username: string, password: string): Promise<LoginResult> {
    this.calls.push(`login ${username}/${password}`);
    return this.loginResult instanceof Error
      ? Promise.reject(this.loginResult)
      : Promise.resolve(this.loginResult);
  }
  logout(): void {
    this.calls.push('logout');
  }
  networkCut(seconds: number): void {
    this.calls.push(`red ${String(seconds)}`);
  }
  reboot(): void {
    this.calls.push('reinicio');
  }
  powerCut(): void {
    this.calls.push('apagon');
  }
  powerOn(): void {
    this.calls.push('luz');
  }
}

describe('ejecución de órdenes', () => {
  const setup = () => {
    const pc3 = new FakePc(3);
    const pcs = new Map<number, ControlledPc>([[3, pc3]]);
    const lines: string[] = [];
    return { pc3, pcs, lines, log: (l: string) => lines.push(l) };
  };
  const run = (line: string, ctx: ReturnType<typeof setup>) => {
    const parsed = parseCommand(line);
    if (!parsed?.ok) {
      throw new Error('orden no válida en el test');
    }
    return executeCommand(parsed.command, ctx.pcs, ctx.log);
  };

  it('cada orden llega a la PC indicada', async () => {
    const ctx = setup();
    for (const line of [
      'login 3 sim03 sim1234',
      'logout 3',
      'red 3 20',
      'reinicio 3',
      'apagon 3',
      'luz 3',
    ]) {
      expect(await run(line, ctx)).toBe(true);
    }
    expect(ctx.pc3.calls).toEqual([
      'login sim03/sim1234',
      'logout',
      'red 20',
      'reinicio',
      'apagon',
      'luz',
    ]);
  });

  it('salir devuelve false y una PC que no está en la consola no cierra nada', async () => {
    const ctx = setup();
    expect(await run('salir', ctx)).toBe(false);
    expect(await run('logout 7', ctx)).toBe(true);
    expect(ctx.lines).toEqual(['La PC 7 no está en esta consola (PCs: 3).']);
    expect(ctx.pc3.calls).toEqual([]);
  });

  it('un login que falla o que el nodo rechaza se muestra y la consola sigue', async () => {
    const ctx = setup();
    ctx.pc3.loginResult = new Error('La PC no está conectada');
    expect(await run('login 3 a b', ctx)).toBe(true);
    ctx.pc3.loginResult = {
      ok: false,
      ms: 41.6,
      message: { type: 'error', code: 'invalid_credentials', message: 'x' },
    };
    expect(await run('login 3 a b', ctx)).toBe(true);
    expect(ctx.lines).toEqual([
      'PC 03 · login fallido: La PC no está conectada',
      'PC 03 · el nodo rechazó el login (42 ms)',
    ]);
  });

  it('estado muestra una línea por PC según esté bloqueada, en sesión, sin red o sin luz', async () => {
    const snap = (o: Partial<PcSnapshot>) => describeSnapshot({ ...new FakePc(5).state, ...o });
    expect(snap({})).toBe('PC 05 · bloqueada');
    expect(snap({ sessionId: 's', who: 'sim05', localRemainingSeconds: 7080 })).toBe(
      'PC 05 · en sesión de sim05 · restante local 1:58:00',
    );
    expect(snap({ connected: false })).toBe('PC 05 · desconectada');
    expect(
      snap({ connected: false, sessionId: 's', who: 'sim05', localRemainingSeconds: 60 }),
    ).toBe('PC 05 · desconectada, con sesión de sim05 (restante local 0:01:00)');
    expect(snap({ poweredOff: true, connected: false })).toBe('PC 05 · sin luz');

    const ctx = setup();
    await run('estado', ctx);
    expect(ctx.lines).toEqual(['PC 03 · bloqueada']);
  });
});
