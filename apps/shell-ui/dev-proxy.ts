// REQ-003-63: helper exclusivo de Vite; ningún secreto se define en import.meta.env/bundle.
import { Agent } from 'node:https';

import type { Plugin, ProxyOptions } from 'vite';

import {
  nodeUrl,
  readProfile,
  readTrustedCa,
  simulatorIdentity,
} from '../../tools/agent-sim/src/registration.js';

export async function devProxy(
  profilePath: string | undefined,
  selected: string | undefined,
): Promise<{
  plugin: Plugin;
  proxy: Record<string, ProxyOptions>;
}> {
  const profile = profilePath ? await readProfile(profilePath) : null;
  const identity = profile ? simulatorIdentity(profile, Number(selected ?? '1')) : null;
  const ca = profile ? await readTrustedCa(profile.caFile) : undefined;
  const agent = profile?.nodeUrl.startsWith('https:')
    ? new Agent({ ca, minVersion: 'TLSv1.2', rejectUnauthorized: true })
    : undefined;
  return {
    plugin: {
      name: 'pope-registered-development',
      configureServer(server) {
        server.middlewares.use('/__pope-dev-identity', (request, response) => {
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('Content-Type', 'application/json');
          if (request.method !== 'GET' || !identity) {
            response.statusCode = 503;
            response.end('{"error":"Configura POPE_SIM_PROFILE y POPE_SIM_PC para desarrollar."}');
          } else response.end(JSON.stringify(identity.pc));
        });
        server.httpServer?.once('close', () => agent?.destroy());
      },
    },
    proxy:
      profile && identity
        ? {
            '^/pc$': {
              target: nodeUrl(profile.nodeUrl).origin,
              ws: true,
              agent,
              secure: true,
              configure(proxy) {
                proxy.on('proxyReqWs', (outgoing, request) => {
                  // Un sitio ajeno no puede usar el proxy local como agente de la PC registrada.
                  if (
                    !['http://127.0.0.1:5174', 'http://localhost:5174'].includes(
                      request.headers.origin ?? '',
                    )
                  ) {
                    outgoing.destroy(new Error('Origen de desarrollo rechazado.'));
                    return;
                  }
                  outgoing.setHeader('Authorization', `Bearer ${identity.credential}`);
                });
              },
            },
          }
        : {},
  };
}
