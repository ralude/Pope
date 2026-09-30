// CLI del simulador de PCs de Pope. Subcomandos:
//   seed  Crea los clientes sim01…simNN con saldo, por la API del panel.
//   run   Enciende PCs simuladas y, si se pide, las hace entrar como simNN.
// (`interactive` llega en T36b y `load` en T37.)
import { parseArgs } from 'node:util';

import { parsePcRange, parsePositiveInt, parseUsdAmount, UsageError } from './args.js';
import { ApiError, HttpPanelApi } from './panel-api.js';
import { runPcs } from './run.js';
import { seedCustomers } from './seed.js';

const HELP = `Simulador de PCs de Pope

Uso: pnpm --filter @pope/agent-sim start -- <subcomando> [opciones]

  seed --url http://127.0.0.1:3000 --user U --password P --customers N --money USD
      Crea sim01…simNN (contraseña sim1234) y los recarga hasta tener USD de saldo.
  run --url ws://127.0.0.1:3000/pc --pcs 1-5 [--login] [--duration SEGUNDOS]
      Enciende esas PCs. Con --login, la PC N entra como simNN.
`;

const log = (line: string) => {
  console.log(line);
};

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'seed': {
      const { values } = parseArgs({
        args: rest,
        options: {
          url: { type: 'string' },
          user: { type: 'string' },
          password: { type: 'string' },
          customers: { type: 'string' },
          money: { type: 'string' },
        },
      });
      const { url, user, password } = values;
      if (!url || !user || !password || !values.customers || !values.money) {
        throw new UsageError('seed necesita --url, --user, --password, --customers y --money');
      }
      const api = new HttpPanelApi(url);
      await api.login(user, password);
      await seedCustomers(
        api,
        {
          customers: parsePositiveInt(values.customers, '--customers'),
          moneyMicros: parseUsdAmount(values.money),
        },
        log,
      );
      return;
    }
    case 'run': {
      const { values } = parseArgs({
        args: rest,
        options: {
          url: { type: 'string' },
          pcs: { type: 'string' },
          login: { type: 'boolean', default: false },
          duration: { type: 'string' },
        },
      });
      if (!values.url || !values.pcs) {
        throw new UsageError('run necesita --url y --pcs');
      }
      const stop = new AbortController();
      process.once('SIGINT', () => {
        stop.abort();
      });
      await runPcs(
        {
          url: values.url,
          pcs: parsePcRange(values.pcs),
          login: values.login,
          ...(values.duration !== undefined && {
            durationSeconds: parsePositiveInt(values.duration, '--duration'),
          }),
        },
        log,
        stop.signal,
      );
      return;
    }
    default:
      console.log(HELP);
      if (command !== undefined && command !== 'help' && command !== '--help') {
        throw new UsageError(`Subcomando desconocido: "${command}"`);
      }
  }
}

main().catch((error: unknown) => {
  if (error instanceof UsageError || error instanceof ApiError) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
