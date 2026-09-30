import { formatMoney, type Micros } from '@pope/shared';

import { SIM_PASSWORD, simUsername } from './args.js';
import { clockTime, describeEvent } from './describe.js';
import { SimulatedPc } from './simulated-pc.js';

export interface RunOptions {
  url: string;
  pcs: number[];
  /** La PC N inicia sesión como `simNN`. */
  login: boolean;
  /** Segundos que dura la prueba; sin él, hasta que se pare con Ctrl+C. */
  durationSeconds?: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const limit = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > limit) {
      return false;
    }
    await sleep(50);
  }
  return true;
}

/** Enciende las PCs, opcionalmente las hace entrar, y las deja latiendo hasta que acabe. */
export async function runPcs(
  options: RunOptions,
  log: (line: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const balances = new Map<number, { entered: Micros | null; last: Micros | null }>();
  const pcs = options.pcs.map((n) => {
    balances.set(n, { entered: null, last: null });
    const pc = new SimulatedPc({
      number: n,
      url: options.url,
      onEvent: (event) => {
        const text = describeEvent(event);
        if (text !== null) {
          log(`${clockTime(new Date())} PC ${String(n).padStart(2, '0')} · ${text}`);
        }
        if (
          event.kind === 'message' &&
          event.message.type === 'state' &&
          event.message.status === 'active' &&
          event.message.session.kind === 'account'
        ) {
          const entry = balances.get(n);
          if (entry) {
            entry.entered ??= event.message.session.money.micros;
            entry.last = event.message.session.money.micros;
          }
        }
      },
    });
    return pc;
  });

  for (const pc of pcs) {
    pc.start();
  }
  try {
    if (options.login) {
      for (const pc of pcs) {
        if (!(await waitUntil(() => pc.snapshot().connected, 10_000))) {
          log(`${pc.name} · no pudo conectar con ${options.url}`);
          continue;
        }
        const result = await pc
          .login(simUsername(pc.number), SIM_PASSWORD)
          .catch((error: unknown) => {
            log(`${pc.name} · login fallido: ${(error as Error).message}`);
            return null;
          });
        if (result && !result.ok) {
          log(`${pc.name} · el nodo rechazó el login`);
        }
      }
    }
    if (options.durationSeconds === undefined) {
      await new Promise<void>((resolve) => {
        signal?.addEventListener('abort', () => {
          resolve();
        });
      });
    } else {
      await Promise.race([
        sleep(options.durationSeconds * 1000),
        new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => {
            resolve();
          });
        }),
      ]);
    }
    // Al terminar, todas cierran su sesión y se muestra cómo salió el saldo de cada una.
    for (const pc of pcs) {
      if (pc.snapshot().sessionId !== null) {
        pc.logout();
      }
    }
    await waitUntil(() => pcs.every((pc) => pc.snapshot().sessionId === null), 5000);
    for (const pc of pcs) {
      const entry = balances.get(pc.number);
      if (entry?.entered != null && entry.last != null) {
        log(
          `${pc.name} · ${simUsername(pc.number)} entró con ${formatMoney(entry.entered)} y salió con ${formatMoney(entry.last)}`,
        );
      }
    }
  } finally {
    for (const pc of pcs) {
      pc.stop();
    }
  }
}
