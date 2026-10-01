# Mediciones de la spec 001

> **Estado:** medido solo en el **equipo de desarrollo**, que es mucho más potente que el
> servidor del local. Los números cumplen con holgura, pero **no valen como aprobación**:
> hay que repetirlas en el **i5 de 2ª generación con 8 GB** (ADR-0011). Sigue en "Pendientes
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

## Pendiente: repetir en el i5 de 2ª generación

El i5 de 2ª generación no tiene AVX2 y es varias veces más lento por núcleo, así que lo
esperable es que `hash` tarde bastante más de 13 ms y que la ráfaga se alargue. Hay que
repetir T11 (`bench:argon2`) y T37 (los 5 pasos de arriba) **en ese equipo** y anotar aquí
los resultados, con su CPU, RAM, sistema y versiones. Si el p95 de la fase 1 llegara a 2 s
o el `rss` a 384 MB, se revisan los parámetros de argon2 (plan 001, "Riesgos") o ADR-0003.
