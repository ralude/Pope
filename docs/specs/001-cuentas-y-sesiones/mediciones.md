# Mediciones de la spec 001

> **Estado:** medido solo en el **equipo de desarrollo**, que es mucho más potente que el
> servidor del local. Los números cumplen con holgura, pero **no valen como aprobación**:
> hay que repetirlas en el **i3-2120 con 8 GB** del local (ADR-0016). Sigue en "Pendientes
> del mantenedor" de [`ESTADO.md`](../../../ESTADO.md).

## Equipo donde se midió

| | |
|---|---|
| CPU | AMD Ryzen 5 5500 (6 núcleos, 12 hilos) |
| RAM | 31,8 GB |
| Sistema | Windows 11 Pro 10.0.26200 |
| Node | v24.21.0 (`UV_THREADPOOL_SIZE` sin definir: 4 hilos para argon2) |
| PostgreSQL | 18.6 (un clúster aparte en el puerto 5433, también en esta máquina) |
| Fecha | 2026-10-01 |

El servidor, PostgreSQL y las 40 PCs simuladas corrían en la misma máquina, así que el
reparto de CPU no es el del local.

## T37 · Prueba de carga (REQ-001-50, ADR-0011)

Cómo repetirla (la receta de T36a con 40 PCs):

1. `pnpm build`, y un administrador creado con `staff:create-admin`.
2. `DATABASE_URL=… pnpm --filter @pope/server dev:seed-pcs -- --count 40`.
3. Servidor con la memoria registrada y su salida en un archivo:
   `POPE_MODE=local DATABASE_URL=… POPE_MEMORY_LOG_MS=5000 node dist/main.js > server.log`
   (desde `apps/server`).
4. `pnpm --filter @pope/agent-sim start -- seed --url http://127.0.0.1:3000 --user … --password … --customers 40 --money 20`.
5. `pnpm --filter @pope/agent-sim start -- load --url ws://127.0.0.1:3000/pc --pcs 1-40 --server-log server.log`.
   Sale con código 1 si no pasa.

Resultado (el informe tal como lo imprime la herramienta):

| Fase | Logins | p50 | p95 | máx | errores |
|---|---|---|---|---|---|
| 1. 40 PCs conectadas, un login cada 1.5 s (decide) | 40 | 20 ms | 69 ms | 73 ms | 0 |
| 2. ráfaga de 40 logins a la vez (informativa) | 40 | 193 ms | 334 ms | 336 ms | 0 |

Sesiones mantenidas 600 s con latidos cada 10 s.

Memoria del servidor (rss): pico desde el arranque 221.8 MB · pico durante la prueba 221.8 MB ·
al final de las sesiones 161.1 MB.

- ✓ p95 del login (fase 1) < 2000 ms
- ✓ rss máximo < 384 MB
- ✓ sin errores

Lo que significa cada cosa:

- **Qué decide.** REQ-001-50 pide login en < 2 s "con 40 PCs conectadas", no 40 logins a la
  vez. Por eso decide la fase 1 (las 40 PCs conectadas y latiendo, un login cada 1,5 s). La
  ráfaga se mide pero no decide: cada login verifica argon2 (19 MiB) y Node solo calcula 4 a
  la vez, así que en ráfaga se ponen en cola.
- **Memoria.** `rss` de Node según el registro del servidor (`POPE_MEMORY_LOG_MS`). El pico
  coincide con la ráfaga de logins (argon2). En reposo el proceso queda en unos 82 MB.
- **PostgreSQL** no se mide aquí: el presupuesto de ADR-0011 es aparte (≤ 512 MB).

## T11 · argon2id con los parámetros de Pope

`pnpm --filter @pope/server build && pnpm --filter @pope/server bench:argon2`:

| | |
|---|---|
| Parámetros | m = 19 456 KiB, t = 2, p = 1 |
| `hash` (20 veces) | media 13 ms · p95 15 ms |
| `verify` | 12 ms |
| 40 hashes a la vez | 261 ms en total |
| Memoria del proceso (RSS) | 188 MB |

## Pendiente: repetir en el i3-2120 del local

El i3-2120 (ADR-0016) no tiene AVX2, solo tiene 2 núcleos y es varias veces más lento por
núcleo, así que lo
esperable es que `hash` tarde bastante más de 13 ms y que la ráfaga se alargue. Hay que
repetir T11 (`bench:argon2`) y T37 (los 5 pasos de arriba) **en ese equipo** y anotar aquí
los resultados, con su CPU, RAM, sistema y versiones. Si el p95 de la fase 1 llegara a 2 s
o el `rss` a 384 MB, se revisan los parámetros de argon2 (plan 001, "Riesgos") o ADR-0003.

## T51 · Criterios de aceptación

Cada criterio de la spec 001 con lo que lo comprueba. Los tests se ejecutan con `pnpm test`
(PGlite) y los del servidor también contra PostgreSQL real (`test:pg`). Las rutas son
relativas a `apps/server/src` (servidor), `apps/shell-ui/src` (Shell), `apps/panel/src`
(panel) y `packages/shared/src` (shared). "A mano" remite a la tarea de `tasks.md` donde se
anotó la prueba.

| CA | Requisitos | Tests | A mano |
|---|---|---|---|
| CA-001-01 | REQ-001-20, 11, 12 | servidor `sessions/login.e2e.test.ts`; shared `billing.test.ts` | T46 (login en Chrome) |
| CA-001-02 | REQ-001-21 | servidor `sessions/login.e2e.test.ts` (mensaje "Ya tienes una sesión abierta en la PC 03"); shared `protocol.test.ts` | — |
| CA-001-03 | REQ-001-27 | servidor `sessions/no-heartbeat.e2e.test.ts` | — |
| CA-001-04 | REQ-001-22, 31 | servidor `sessions/temporary-open.e2e.test.ts`; shared `events.test.ts` | T44 |
| CA-001-05 | REQ-001-60, 61 | servidor `sessions/temporary-open.e2e.test.ts` | T44 (simulador: «Carlos», PC 05, abierta por Ana, cobro en su turno) |
| CA-001-06 | REQ-001-63, 66, 67 | servidor `sessions/temporary-restore.e2e.test.ts` | T45 (interrumpida con 49 min, restaurada en otra PC) |
| CA-001-07 | REQ-001-64 | servidor `sessions/temporary-backup.e2e.test.ts` | T45 (respaldo por PC) |
| CA-001-08 | REQ-001-68 | servidor `sessions/temporary-restore.e2e.test.ts` | T45 |
| CA-001-09 | REQ-001-69 | servidor `sessions/temporary-close.e2e.test.ts`, `sessions/temporary-backup.e2e.test.ts` | T50 (temporal de 25 min: «Perderás 25 min», bloqueo, no queda interrumpida) |
| CA-001-10 | REQ-001-70 | servidor `sessions/temporary-add-time.e2e.test.ts`; panel `temporary/model.test.ts`; shared `exhaustion.test.ts` | T44 |
| CA-001-11 | REQ-001-71 | servidor `sessions/temporary-restore.e2e.test.ts`, `sessions/temporary-backup.e2e.test.ts`; shared `temporary.test.ts` | — |
| CA-001-12 | REQ-001-12 | servidor `sessions/heartbeat.e2e.test.ts`; Shell `session/live.test.ts`; shared `billing.test.ts` | T47 (el Shell coincide con el nodo en cada latido) |
| CA-001-13 | REQ-001-10, 11 | servidor `sessions/login.e2e.test.ts`; shared `billing.test.ts` | — |
| CA-001-14 | REQ-001-80 | servidor `combos/combos.e2e.test.ts`; panel `combos/model.test.ts`; shared `combo.test.ts` | T43 (texto de descuentos en el panel) |
| CA-001-15 | REQ-001-86 | servidor `sessions/buy-combo.e2e.test.ts` (180 días después, un sábado, siguen las 18 h; añadido en T51); shared `time.test.ts` (más de 24 h) | — |
| CA-001-16 | REQ-001-87, 88 | servidor `sessions/login.e2e.test.ts`, `sessions/heartbeat.e2e.test.ts`; Shell `session/live.test.ts`; shared `billing.test.ts`, `exhaustion.test.ts`, `protocol.test.ts` | T47 (combo «En uso» y saldo en el Shell) |
| CA-001-17 | REQ-001-85 | servidor `sessions/buy-combo.e2e.test.ts`, `combos/combo-sales.e2e.test.ts`; Shell `session/combos.test.ts` | T49 (compra en el Shell con recargas reales desde el panel) |
| CA-001-18 | REQ-001-82 | servidor `sessions/temporary-open.e2e.test.ts` | T48 (la temporal de 6 min no ofrece combos en el Shell) |
| CA-001-19 | REQ-001-14 | servidor `sessions/heartbeat.e2e.test.ts`; shared `tariff.test.ts` | — |
| CA-001-20 | REQ-001-15 | servidor `tariffs/tariffs.e2e.test.ts` | T42 (tabla del ejemplo y dos eventos) |
| CA-001-21 | REQ-001-16 | servidor `sessions/login.e2e.test.ts` | — |

Todos los criterios quedan cubiertos por al menos un test automático. **Fuera:** REQ-001-13
(equivalente en Bs) espera a la tasa de la spec 005; el Shell y el panel ya lo muestran en
cuanto el nodo mande una tasa, pero hoy siempre llega `null`.
