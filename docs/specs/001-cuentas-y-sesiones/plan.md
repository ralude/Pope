# Plan 001: Cuentas y sesiones

- **Estado:** Aprobado
- **Spec:** [spec.md](spec.md)
- **ADRs que aplican:** ADR-0001, ADR-0007, ADR-0011, ADR-0014, y los **propuestos**
  ADR-0002, ADR-0003, ADR-0004, ADR-0008 y ADR-0015. **Aprobar este plan implica
  aceptar esos cinco ADR.**
- **ADRs nuevos que propone:** ADR-0015 (importes en micro-unidades).

## Resumen

Es la primera spec que se construye, así que también **crea el monorepo**. Implementa en
el servidor (modo `local`) las cuentas, las tarifas semanales, los combos, los dos saldos
y el ciclo de vida de las sesiones, con cobro por segundo basado en latidos. Incluye las
pantallas del panel y del Shell necesarias. El agente nativo es la spec 003: mientras
tanto, las PCs se sustituyen por un **simulador de agentes** en TypeScript, que además
sirve para medir el rendimiento exigido por ADR-0011.

## Componentes afectados

| Componente | Cambio |
|---|---|
| raíz | Monorepo pnpm + Turborepo, TypeScript estricto, ESLint, Prettier, Vitest |
| `packages/shared` | Tipos de dinero y tiempo, motor de cobro (funciones puras), esquemas zod de API, WebSocket y eventos |
| `apps/server` | NestJS + Fastify: módulos `auth`, `customers`, `tariffs`, `combos`, `wallet`, `sessions`, `pc-gateway`, `shifts`, `events` |
| `apps/panel` | React + Vite: login de personal, mapa de PCs, clientes, recargas, combos, tarifas, sesiones temporales e interrumpidas, turno |
| `apps/shell-ui` | React + Vite: login, estado de la sesión, compra de combo, avisos y cierre de sesión |
| `tools/agent-sim` | Simulador de N PCs que hablan el protocolo del agente |

## Modelo de datos (PostgreSQL + Drizzle)

Convenciones: ids UUIDv7, fechas `timestamptz` en UTC, importes `bigint` en µ-unidades
(ADR-0015), tiempos en segundos `integer`.

| Tabla | Campos clave | Notas |
|---|---|---|
| `staff` | username, display_name, role (`encargado`/`administrador`/`dueno`), password_hash, active | REQ-001-40 |
| `customers` | username (único, sin distinguir mayúsculas), password_hash, name?, phone?, status (`active`/`blocked`/`disabled`), failed_logins, locked_until | REQ-001-01, 02, 04, 52 |
| `pcs` | name ("PC 05"), created_at | Mínima; la spec 003 añade el registro y las credenciales |
| `tariff_days` | weekday (1–7, PK), rate_micros_per_hour, updated_at, updated_by | REQ-001-10, 15. Siete filas fijas |
| `combos` | name, price_micros, seconds, active | REQ-001-80, 81 |
| `cash_shifts` | staff_id, opened_at, closed_at | **Mínima**: solo abrir y cerrar. La spec 005 añade fondos, conteo y diferencias |
| `ledger` | customer_id, wallet (`money`/`combo`), amount (µUSD o segundos, con signo), kind (`recharge`/`combo_purchase`/`consumption`/`adjustment`/`migration`), session_id?, shift_id?, payment_method?, combo_snapshot?, reason?, actor | Solo se inserta, nunca se modifica (REQ-001-89, ADR-0014) |
| `customer_balances` | customer_id, money_micros, combo_seconds | **Caché** del ledger, actualizada en la misma transacción que cada fila del ledger. Un test comprueba que siempre coincide |
| `sessions` | pc_id, kind (`account`/`temporary`), customer_id?, temp_name?, status (`active`/`ended`), rate_micros_per_hour (copia, REQ-001-14/16), started_at, last_heartbeat_at, ended_at?, end_reason?, opened_by (actor), restored_from?, combo_seconds_used, money_seconds, money_charged_micros, purchased_seconds? | Una fila por sesión |
| `session_topups` | session_id, seconds, amount_micros, payment_method, shift_id, actor | Cobros de sesiones temporales: apertura y "añadir tiempo" (REQ-001-60, 70) |
| `settings` | key, value (jsonb), updated_at, updated_by | Ajustes del nodo que cambia el administrador: sesiones temporales conservadas por PC (≥ 3, REQ-001-64) y tiempo de gracia de los latidos (REQ-001-27) |
| `events` | seq, id, type, version, actor, occurred_at, payload, sent_at? | Auditoría y outbox (ADR-0008). El envío a la nube es la spec 006 |

Índices clave: sesión activa única por cliente (`unique (customer_id) where status='active'`,
REQ-001-21), sesión activa única por PC, `ledger (customer_id, created_at)` y `events (seq)`.

## Motor de cobro (`packages/shared/billing`)

Funciones puras con tests exhaustivos. Es la pieza más crítica.

**Checkpoint.** Con cada latido, el nodo calcula con **su propio reloj** los segundos
transcurridos desde el anterior, `d = ahora − last_heartbeat_at` (acotado a ≥ 0 por si
corrige la hora). Luego:

1. Se consumen primero las horas de combo: `c = min(d, combo_disponible)` → `combo_seconds_used += c` (REQ-001-87).
2. El resto va al saldo en dinero: `money_seconds += d − c`.
3. `money_charged_micros = floor(money_seconds × rate / 3600)`, **recalculado siempre sobre el total** (ADR-0015).
4. Saldo en vivo = `customer_balances` − lo consumido en la sesión en curso.
5. Se calcula cuándo se agotará el saldo y se programa el cierre exacto y los avisos de 5 y 1 min (REQ-001-24, 25).

**Al cerrar la sesión** se escriben como mucho **dos filas de ledger** (consumo de combo y
consumo de dinero), en vez de una por latido. Durante la sesión solo se actualiza la fila de
`sessions`, así el ledger no crece sin control en un disco lento.

**Sesiones temporales:** el mismo checkpoint descuenta del tiempo comprado
(`purchased_seconds`), sin ledger de cliente. El tiempo restante se guarda en cada latido
(REQ-001-63).

## Latidos, cortes de luz y reinicios

| Situación | Comportamiento |
|---|---|
| Latido normal | El agente lo envía cada **10 s** y el nodo guarda el checkpoint en cada uno. Un corte pierde ≤ 10 s (cumple REQ-001-63, que pide ≤ 30 s) |
| Sin latidos durante el tiempo de gracia (3 min) | Se cierra con `end_reason = no_heartbeat` y se cobra hasta `last_heartbeat_at` (REQ-001-27) |
| La PC vuelve a conectar con una sesión ya cerrada por falta de latidos (corte de red) | Sigue cerrada: el nodo envía `sessionEnded` y la PC se bloquea. Con cuenta, el hueco sin red no se cobra. Si era temporal, su restante pasa a ser el menor entre el del nodo y el que informa la PC (pregunta resuelta de la spec) |
| El nodo arranca tras un apagón | Cierra como `no_heartbeat` las sesiones cuyo último latido supere el tiempo de gracia. Si un agente reconecta antes, la sesión sigue |
| La PC se reinicia y el agente dice "no tengo sesión" | Se cierra al momento como `no_heartbeat`. Si es temporal, queda en "Sesiones interrumpidas" |
| Restaurar (REQ-001-67, 68, 71) | Se crea una sesión nueva con `restored_from`, `purchased_seconds` = restante de la original y sin cobro. Se rechaza si ya se restauró o si pasaron > 48 h |
| Respaldo (REQ-001-64, 65) | Las sesiones temporales nunca se borran; el panel muestra las últimas N por PC (N ≥ 3). Las pendientes de restaurar se muestran siempre hasta que caduquen |

## Contratos (`packages/shared`, zod)

**Canal PC ↔ nodo (WebSocket).** Lo usan el simulador y, más adelante, el agente (spec 003):

| Dirección | Mensajes |
|---|---|
| PC → nodo | `hello` (identidad de la PC), `heartbeat` (session_id?, restante local), `login` (usuario, contraseña), `logout`, `buyCombo` (combo_id). Los tres últimos admiten un `requestId` opcional |
| nodo → PC | `state` (bloqueada o en sesión: saldos, tarifa, tiempo total), `warning` (5 o 1 min), `sessionEnded` (motivo), `error` (código, mensaje en español y el `requestId` de la petición que falló, si lo traía) |

**API del panel (REST + WebSocket para el mapa en vivo):**
- `auth`: login y logout del personal (cookie httpOnly).
- `customers`: listar, buscar, crear, bloquear, recargar, comprar combo.
- `combos`: CRUD con precio por hora y descuento calculados.
- `tariffs`: leer y guardar la tabla semanal.
- `sessions`: activas, abrir temporal, añadir tiempo, cerrar, interrumpidas, restaurar.
- `shifts`: abrir y cerrar turno.

**Eventos** (versionados): `customer.created`, `customer.status_changed`, `customer.login_locked`,
`customer.login_unlocked`, `wallet.recharged`,
`combo.created`, `combo.updated`, `combo.purchased`, `tariff.changed`, `session.started`,
`session.ended`, `session.time_added`, `session.restored`, `shift.opened`, `shift.closed`, `setting.changed`.

## Seguridad

- Contraseñas con argon2id mediante `@node-rs/argon2` (binario precompilado, sin
  compilar en el nodo), parámetros OWASP (`m=19 MiB, t=2, p=1`).
- 5 intentos fallidos → bloqueo de 5 min por cuenta (REQ-001-52).
- Roles comprobados en cada endpoint: `encargado` opera, `administrador` además configura
  tarifas, combos y personal, y `dueno` solo lee.
- Nada de contraseñas ni PINs en logs ni en eventos.

## Dependencias de otras specs

- **Spec 005 (caja):** REQ-001-03 y 60 exigen un turno. Aquí se crea `cash_shifts`
  mínima; la spec 005 la amplía sin romperla.
- **Spec 005 (tasa BCV):** REQ-001-13 muestra el equivalente en Bs. El Shell y el panel lo
  muestran **si existe una tasa**; la tasa llega con la spec 005. Hasta entonces solo se ve
  USD, y CA de REQ-001-13 se verificará al terminar la 005.
- **Spec 002 (pausa):** `sessions.status` tendrá `paused`. El checkpoint ya ignora el
  tiempo en pausa, pero la funcionalidad se hace en la 002.
- **Spec 003 (agente):** el simulador reemplaza al agente real.

## Impacto en recursos (ADR-0011)

| Dependencia | Dónde | Motivo |
|---|---|---|
| `@nestjs/*` + `fastify` | server | ADR-0003 |
| `drizzle-orm` + `pg` | server | ADR-0004; sin motor binario |
| `ws` | server | Canal WebSocket de las PCs (ADR-0003): sin dependencias propias, más ligero que Socket.IO y compatible con `ClientWebSocket` de .NET |
| `@node-rs/argon2` | server | Hash seguro sin compilación. **Verificar en el i5 de 2ª gen** |
| `zod`, `uuid` | shared | Validación e ids v7 |
| `react`, `react-dom`, `wouter` | panel, shell-ui | Router de ~2 KB; **sin librería de componentes** para mantener el panel ligero |
| `vitest`, `@electric-sql/pglite` | solo desarrollo | Tests con PostgreSQL en WASM, sin Docker en Windows |

Carga estimada: 40 PCs × 1 latido/10 s = 4 escrituras/s, trivial para PostgreSQL incluso
con disco mecánico.

## Estrategia de pruebas

| Nivel | Qué | REQ |
|---|---|---|
| Unitarias (shared) | Motor de cobro: combo antes que dinero, recálculo sin deriva, tarifa copiada al empezar, medianoche, agotamiento y avisos | 11, 12, 14, 16, 23, 24, 87 |
| Integración (server + PGlite) | Login y bloqueos, sesión única, recarga y ledger, compra de combo, temporales, añadir tiempo, cierre sin latidos, restauración y caducidad, eventos | 01–04, 20–27, 60–71, 80–89, 30–31 |
| Invariante | Tras cada test, `customer_balances` = suma del ledger | 89 |
| Carga (agent-sim) | 40 PCs a la vez, p95 de login < 2 s y memoria del proceso < 384 MB | 50, ADR-0011 |
| Manual | Panel y Shell en el navegador contra el simulador | CA-001-* |

## Orden de implementación (detalle en `tasks.md`)

1. Esqueleto del monorepo y herramientas.
2. `shared`: dinero, tiempo y motor de cobro, con tests.
3. `server`: base de datos, migraciones, `events` y personal/auth.
4. Clientes, ledger y recargas; tarifas; combos.
5. Sesiones con cuenta: canal PC, checkpoint, cierre, avisos.
6. Sesiones temporales, respaldo y restauración.
7. Simulador de agentes y prueba de carga.
8. Pantallas del panel.
9. Pantallas del Shell.

## Riesgos

- **PGlite no es idéntico a PostgreSQL:** se ejecutará además una batería de tests contra
  PostgreSQL real antes de cada entrega al local.
- **Hora del nodo:** si el reloj se corrige hacia atrás, el `d` negativo se descarta y se
  registra un aviso. Conviene activar NTP cuando haya internet.
- **Memoria de NestJS:** se mide con el simulador al final del paso 7. Si supera el
  presupuesto, se revisa ADR-0003.
- **`@node-rs/argon2` en una CPU antigua:** se prueba en el hardware real al principio del
  paso 3. Plan B: el paquete `argon2`, compilado fuera del nodo.
