import { createInterface } from 'node:readline';

import { HELP, executeCommand, parseCommand } from './commands.js';
import { clockTime, describeEvent } from './describe.js';
import { SimulatedPc } from './simulated-pc.js';

/**
 * Consola para probar el panel a mano: las PCs arrancan bloqueadas y se controlan con
 * órdenes escritas (login, red, reinicio, apagón…). Sigue mostrando lo que les pasa.
 */
export async function runInteractive(
  options: { url: string; pcs: number[] },
  log: (line: string) => void,
): Promise<void> {
  const pcs = new Map<number, SimulatedPc>();
  for (const n of options.pcs) {
    const pc = new SimulatedPc({
      number: n,
      url: options.url,
      onEvent: (event) => {
        const text = describeEvent(event);
        if (text !== null) {
          log(`${clockTime(new Date())} PC ${String(n).padStart(2, '0')} · ${text}`);
        }
      },
    });
    pcs.set(n, pc);
    pc.start();
  }
  log(`PCs encendidas: ${options.pcs.join(', ')}.\n${HELP}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'sim> ' });
  rl.prompt();
  // Las órdenes se ejecutan de una en una, en el orden en que se escribieron.
  let queue = Promise.resolve();
  const finished = new Promise<void>((resolve) => {
    rl.on('line', (line) => {
      queue = queue.then(async () => {
        const parsed = parseCommand(line);
        if (parsed === null) {
          rl.prompt();
          return;
        }
        if (!parsed.ok) {
          log(parsed.error);
        } else if (!(await executeCommand(parsed.command, pcs, log))) {
          rl.close();
          return;
        }
        rl.prompt();
      });
    });
    rl.on('close', () => {
      void queue.then(resolve);
    });
  });
  await finished;
  for (const pc of pcs.values()) {
    pc.stop();
  }
}
