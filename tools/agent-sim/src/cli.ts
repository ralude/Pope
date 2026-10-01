// CLI del simulador de PCs de Pope. Subcomandos:
//   seed  Crea los clientes sim01…simNN con saldo, por la API del panel.
//   run   Enciende PCs simuladas y, si se pide, las hace entrar como simNN.
//   interactive  Consola para controlar las PCs a mano.
//   load  Prueba de carga con 40 PCs (T37).
import { parseArgs } from 'node:util';

import { parsePcRange, parsePositiveInt, parseUsdAmount, UsageError } from './args.js';
import { runInteractive } from './interactive.js';
import { renderReport, verdict } from './load-report.js';
import { runLoad } from './load.js';
import { ApiError, HttpPanelApi } from './panel-api.js';
import { runPcs } from './run.js';
import { seedCustomers } from './seed.js';

const HELP = `Simulador de PCs de Pope

Uso: pnpm --filter @pope/agent-sim start -- <subcomando> [opciones]

  seed --url http://127.0.0.1:3000 --user U --password P --customers N --money USD
      Crea sim01…simNN (contraseña sim1234) y los recarga hasta tener USD de saldo.
  run --url ws://127.0.0.1:3000/pc --pcs 1-5 [--login] [--duration SEGUNDOS]
      Enciende esas PCs. Con --login, la PC N entra como simNN.
  interactive --url ws://127.0.0.1:3000/pc --pcs 1-10
      Consola para controlar las PCs a mano (login, red, reinicio, apagon, luz, estado).
  load --url ws://127.0.0.1:3000/pc --pcs 1-40 [--stagger-ms 1500] [--hold-seconds 600]
       [--server-log ARCHIVO]
      Prueba de carga (T37): logins escalonados con las PCs conectadas, sesiones mantenidas y
      una ráfaga final. Con --server-log (log del servidor con POPE_MEMORY_LOG_MS) mide la
      memoria. Imprime la tabla para mediciones.md y sale con 1 si no pasa.
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
    case 'interactive': {
      const { values } = parseArgs({
        args: rest,
        options: { url: { type: 'string' }, pcs: { type: 'string' } },
      });
      if (!values.url || !values.pcs) {
        throw new UsageError('interactive necesita --url y --pcs');
      }
      await runInteractive({ url: values.url, pcs: parsePcRange(values.pcs) }, log);
      return;
    }
    case 'load': {
      const { values } = parseArgs({
        args: rest,
        options: {
          url: { type: 'string' },
          pcs: { type: 'string' },
          'stagger-ms': { type: 'string' },
          'hold-seconds': { type: 'string' },
          'server-log': { type: 'string' },
        },
      });
      if (!values.url || !values.pcs) {
        throw new UsageError('load necesita --url y --pcs');
      }
      const result = await runLoad(
        {
          url: values.url,
          pcs: parsePcRange(values.pcs),
          staggerMs: parsePositiveInt(values['stagger-ms'] ?? '1500', '--stagger-ms'),
          holdSeconds: parsePositiveInt(values['hold-seconds'] ?? '600', '--hold-seconds'),
          ...(values['server-log'] !== undefined && { serverLog: values['server-log'] }),
        },
        log,
      );
      console.log(`\n${renderReport(result)}`);
      // El código de salida dice si pasó: 0 sí, 1 no.
      process.exitCode = verdict(result).ok ? 0 : 1;
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
