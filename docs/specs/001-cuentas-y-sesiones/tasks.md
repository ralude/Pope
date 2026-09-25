# Tareas 001: Cuentas y sesiones

- **Estado:** Aprobado
- **Plan:** [plan.md](plan.md)

Reglas: una tarea = un commit. Marca `[x]` en el mismo commit que la implementa. Cada
commit deja el repo compilando y con `pnpm test` en verde. Los tests nombran el REQ que
prueban. Si una tarea resulta más grande de lo previsto (> 400 líneas), divídela aquí
antes de seguir.

## Fase 1: Monorepo

- [ ] **T01: Crear el monorepo**
  - **Cubre:** ADR-0002
  - **Hacer:** `package.json` raíz, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` (`strict`), versión de Node LTS fijada (`engines` + `.nvmrc`), scripts `build`, `test`, `lint`, `typecheck`. Documentar los comandos en la sección "Comandos" de `AGENTS.md`.
  - **Verificar:** `pnpm install && pnpm typecheck` sin errores.
  - **Commit:** `build: crea el monorepo con pnpm y Turborepo`

- [ ] **T02: Lint y formato**
  - **Cubre:** AGENTS.md (estilo)
  - **Hacer:** ESLint (configuración plana, TypeScript estricto) y Prettier. Script `pnpm lint`.
  - **Verificar:** `pnpm lint` pasa.
  - **Commit:** `build: añade ESLint y Prettier`

- [ ] **T03: Paquete `shared` con Vitest**
  - **Cubre:** ADR-0002
  - **Hacer:** `packages/shared` con Vitest y un test de humo.
  - **Verificar:** `pnpm test` ejecuta y pasa el test.
  - **Commit:** `build(shared): crea el paquete compartido con Vitest`

## Fase 2: Dominio compartido (`packages/shared`)

- [ ] **T04: Dinero y tiempo**
  - **Cubre:** ADR-0015, REQ-001-12, REQ-001-13
  - **Hacer:** tipos `Micros` y `Seconds` con validación de entero seguro, conversiones (`usd(1.5)` → `1 500 000`), `formatMoney` (USD con 2 decimales y Bs opcional) y `formatDuration` (`1:30:00`). Esquemas zod.
  - **Verificar:** tests de conversión, redondeo al mostrar y rechazo de no enteros.
  - **Commit:** `feat(shared): añade los tipos de dinero y tiempo`

- [ ] **T05: Tarifa semanal**
  - **Cubre:** REQ-001-10, REQ-001-14
  - **Hacer:** `weekdayInCaracas(instante)` con `Intl`, `rateFor(tabla, instante)` y el esquema de la tabla de 7 días.
  - **Verificar:** tests en el cambio de día a las 00:00 de Caracas (04:00 UTC) y de miércoles a jueves.
  - **Commit:** `feat(shared): calcula la tarifa según el día de la semana`

- [ ] **T06: Motor de cobro (checkpoint)**
  - **Cubre:** REQ-001-11, REQ-001-23, REQ-001-87, ADR-0015
  - **Hacer:** `applyCheckpoint(sesión, saldos, d)`: primero combo, luego dinero con recálculo acumulado `floor(money_seconds × rate / 3600)`, y saldos en vivo. `d` negativo → 0.
  - **Verificar:** tests de combo antes que dinero, paso de combo a dinero dentro de un mismo checkpoint, y test de propiedad: sumar N checkpoints parciales da lo mismo que uno total (sin deriva).
  - **Commit:** `feat(shared): añade el motor de cobro por segundo`

- [ ] **T07: Agotamiento y avisos**
  - **Cubre:** REQ-001-24, REQ-001-25, REQ-001-62, REQ-001-63
  - **Hacer:** `secondsUntilExhausted`, `pendingWarnings` (5 y 1 min) y el restante de sesiones temporales.
  - **Verificar:** tests con combo + dinero, solo dinero y sesión temporal.
  - **Commit:** `feat(shared): calcula el agotamiento del saldo y los avisos`

- [ ] **T08: Contrato del canal PC ↔ nodo**
  - **Cubre:** plan 001 (Contratos)
  - **Hacer:** esquemas zod de `hello`, `heartbeat`, `login`, `logout`, `buyCombo`, `state`, `warning`, `sessionEnded` y `error`. Exportar también a JSON Schema (para el agente C# de la spec 003).
  - **Verificar:** tests de mensajes válidos e inválidos.
  - **Commit:** `feat(shared): define el protocolo entre la PC y el nodo`

- [ ] **T09: Esquemas de eventos**
  - **Cubre:** REQ-001-30, ADR-0008
  - **Hacer:** eventos versionados del plan, con `actor` (cliente, personal o sistema).
  - **Verificar:** tests de validación de cada tipo de evento.
  - **Commit:** `feat(shared): define los eventos de auditoría y sincronización`

## Fase 3: Servidor base (`apps/server`)

- [ ] **T10: Esqueleto NestJS + Fastify**
  - **Cubre:** ADR-0003
  - **Hacer:** app con `POPE_MODE`, configuración validada con zod y endpoint `/health`.
  - **Verificar:** test e2e de `/health`.
  - **Commit:** `feat(server): crea el servidor NestJS sobre Fastify`

- [ ] **T11: Servicio de contraseñas**
  - **Cubre:** REQ-001-51
  - **Hacer:** `PasswordService` con `@node-rs/argon2` (argon2id, `m=19 MiB, t=2, p=1`) y script `bench:argon2` para medir en el hardware del local.
  - **Verificar:** tests de hash y verificación. **Ejecutar el benchmark en el i5 de 2ª gen** y apuntar el resultado en el cuerpo del commit.
  - **Commit:** `feat(server): añade el hash de contraseñas con argon2id`

- [ ] **T12: Base de datos y pruebas con PGlite**
  - **Cubre:** ADR-0004
  - **Hacer:** Drizzle + `pg`, ejecutor de migraciones, utilidad de tests con PGlite y script `test:pg` contra PostgreSQL real (`DATABASE_URL`).
  - **Verificar:** un test crea la BD en PGlite y aplica las migraciones.
  - **Commit:** `feat(server): conecta PostgreSQL con Drizzle y migraciones`

- [ ] **T13: Tabla de eventos y transacciones**
  - **Cubre:** REQ-001-30, ADR-0008
  - **Hacer:** tabla `events` (con `seq`) y un helper `inTransaction(tx => …, emit)` que escribe los eventos en la misma transacción.
  - **Verificar:** test de que un rollback no deja eventos.
  - **Commit:** `feat(server): registra los eventos en la misma transacción`

- [ ] **T14: Personal y autenticación**
  - **Cubre:** REQ-001-40
  - **Hacer:** tabla `staff`, login y logout con cookie httpOnly, guard de roles y comando CLI para crear el primer administrador.
  - **Verificar:** tests de login correcto e incorrecto y de acceso denegado por rol.
  - **Commit:** `feat(server): añade el login del personal con roles`

## Fase 4: Clientes, saldos, tarifas y combos

- [ ] **T15: Clientes**
  - **Cubre:** REQ-001-01, REQ-001-02, REQ-001-04, REQ-001-30
  - **Hacer:** tabla `customers` y endpoints para crear, listar, buscar y cambiar estado, con eventos.
  - **Verificar:** tests de usuario duplicado (sin distinguir mayúsculas), bloqueo y eventos.
  - **Commit:** `feat(server): gestiona las cuentas de cliente`

- [ ] **T16: Credenciales de cliente y bloqueo por intentos**
  - **Cubre:** REQ-001-51, REQ-001-52
  - **Hacer:** `CustomerAuthService.verify` con contador de fallos y `locked_until`.
  - **Verificar:** test de 5 fallos → bloqueado 5 min → desbloqueado después.
  - **Commit:** `feat(server): bloquea el login de clientes tras 5 intentos fallidos`

- [ ] **T17: Turno de caja mínimo**
  - **Cubre:** REQ-001-03 (dependencia de la spec 005)
  - **Hacer:** tabla `cash_shifts`, abrir y cerrar turno, y guard "requiere turno abierto".
  - **Verificar:** tests de un solo turno abierto por encargado y de rechazo sin turno.
  - **Commit:** `feat(server): añade el turno de caja mínimo`

- [ ] **T18: Ledger y saldos**
  - **Cubre:** REQ-001-83, REQ-001-89, ADR-0014
  - **Hacer:** tablas `ledger` y `customer_balances`, y un `WalletService.post()` que inserta en el ledger y actualiza la caché en la misma transacción. Helper de test `assertBalancesMatchLedger`.
  - **Verificar:** tests de los dos monederos y de la invariante.
  - **Commit:** `feat(server): añade el ledger con los dos saldos`

- [ ] **T19: Recargas**
  - **Cubre:** REQ-001-03
  - **Hacer:** endpoint de recarga (importe y método) ligado al turno, con evento `wallet.recharged`.
  - **Verificar:** tests de recarga, rechazo sin turno e invariante.
  - **Commit:** `feat(server): permite recargar saldo desde el panel`

- [ ] **T20: Tarifas semanales**
  - **Cubre:** REQ-001-10, REQ-001-15
  - **Hacer:** tabla `tariff_days` con los valores iniciales (lunes–miércoles 1,50; jueves–domingo 2,00), `GET` y `PUT` de varios días a la vez (solo administrador), y evento con los valores anteriores y los nuevos.
  - **Verificar:** test de CA-001-20.
  - **Commit:** `feat(server): permite editar la tarifa de cada día`

- [ ] **T21: Combos**
  - **Cubre:** REQ-001-80, REQ-001-81
  - **Hacer:** tabla `combos` y CRUD (solo administrador); la respuesta incluye el precio por hora y el descuento frente a cada tarifa.
  - **Verificar:** test de CA-001-14.
  - **Commit:** `feat(server): gestiona los combos de horas`

- [ ] **T22: Compra de combos**
  - **Cubre:** REQ-001-82, REQ-001-84, REQ-001-85
  - **Hacer:** compra en caja (turno + método) y compra con saldo, guardando la copia del combo. Evento `combo.purchased`.
  - **Verificar:** tests de CA-001-17, saldo insuficiente e invariante.
  - **Commit:** `feat(server): permite comprar combos en caja o con saldo`

## Fase 5: Sesiones con cuenta

- [ ] **T23: Tablas de PCs y sesiones**
  - **Cubre:** REQ-001-21
  - **Hacer:** tablas `pcs` (con datos de ejemplo para desarrollo) y `sessions`, con índices únicos de sesión activa por cliente y por PC.
  - **Verificar:** test de que la BD rechaza una segunda sesión activa.
  - **Commit:** `feat(server): añade las tablas de PCs y sesiones`

- [ ] **T24: Gateway WebSocket de PCs**
  - **Cubre:** plan 001 (Contratos)
  - **Hacer:** gateway con `hello` (identidad de desarrollo; el registro real es la spec 003), registro de conexiones y envío de `state` bloqueado.
  - **Verificar:** test e2e: una PC se conecta y recibe `state` bloqueado.
  - **Commit:** `feat(server): conecta las PCs por WebSocket`

- [ ] **T25: Login desde la PC**
  - **Cubre:** REQ-001-20, REQ-001-21, REQ-001-14, REQ-001-16
  - **Hacer:** mensaje `login` → validar, comprobar saldo ≥ 1 min, crear la sesión copiando la tarifa del día y emitir `session.started`.
  - **Verificar:** tests de CA-001-01, CA-001-02, CA-001-13 y CA-001-21.
  - **Commit:** `feat(server): abre sesiones desde la PC`

- [ ] **T26: Latidos y checkpoint**
  - **Cubre:** REQ-001-11, REQ-001-12, REQ-001-23, REQ-001-87, REQ-001-88
  - **Hacer:** en cada `heartbeat`, aplicar el motor con el reloj del nodo, guardar la sesión y enviar `state`.
  - **Verificar:** tests de CA-001-12, CA-001-16 y CA-001-19 con reloj simulado.
  - **Commit:** `feat(server): cobra la sesión en cada latido`

- [ ] **T27: Avisos y agotamiento**
  - **Cubre:** REQ-001-24, REQ-001-25
  - **Hacer:** temporizador por sesión, envío de `warning` a 5 y 1 min, y cierre al agotarse.
  - **Verificar:** tests con reloj simulado.
  - **Commit:** `feat(server): avisa y cierra la sesión al agotarse el saldo`

- [ ] **T28: Cierre por el cliente o el encargado**
  - **Cubre:** REQ-001-26, REQ-001-31
  - **Hacer:** `logout` desde la PC y endpoint de cierre del personal. Al cerrar, se escriben las filas del ledger (combo y dinero) y el evento `session.ended` con el motivo.
  - **Verificar:** tests de ambos cierres, del motivo y de la invariante.
  - **Commit:** `feat(server): cierra sesiones y liquida el consumo`

- [ ] **T29: Cierre sin latidos y recuperación al arrancar**
  - **Cubre:** REQ-001-27
  - **Hacer:** proceso periódico de cierre por falta de latidos, revisión al arrancar el nodo y cierre inmediato si la PC dice "no tengo sesión".
  - **Verificar:** test de CA-001-03.
  - **Commit:** `feat(server): cierra las sesiones sin latidos cobrando hasta el último`

- [ ] **T30: Compra de combo desde el Shell**
  - **Cubre:** REQ-001-85
  - **Hacer:** mensaje `buyCombo` durante la sesión; el `state` se actualiza al momento.
  - **Verificar:** test de compra en plena sesión, con el checkpoint correcto.
  - **Commit:** `feat(server): permite comprar combos desde la PC`

## Fase 6: Sesiones temporales

- [ ] **T31: Abrir sesión temporal**
  - **Cubre:** REQ-001-22, REQ-001-60, REQ-001-61, REQ-001-62, REQ-001-82
  - **Hacer:** endpoint con tiempo o importe, nombre opcional (con valor por defecto), método de pago y turno. Tabla `session_topups`.
  - **Verificar:** tests de CA-001-04, CA-001-05 y CA-001-18.
  - **Commit:** `feat(server): abre sesiones temporales sin cuenta`

- [ ] **T32: Añadir tiempo a una sesión temporal**
  - **Cubre:** REQ-001-70
  - **Hacer:** endpoint que cobra con la tarifa de la sesión y registra un `session_topup` y un evento.
  - **Verificar:** test de CA-001-10.
  - **Commit:** `feat(server): permite añadir tiempo a una sesión temporal`

- [ ] **T33: Cierre anticipado de sesión temporal**
  - **Cubre:** REQ-001-69
  - **Hacer:** cierre por el cliente o el encargado sin devolución. No aparece en interrumpidas.
  - **Verificar:** test de CA-001-09.
  - **Commit:** `feat(server): descarta el tiempo sobrante al cerrar una temporal`

- [ ] **T34: Respaldo y sesiones interrumpidas**
  - **Cubre:** REQ-001-63, REQ-001-64, REQ-001-65, REQ-001-66
  - **Hacer:** consultas de las últimas N por PC (N configurable, ≥ 3) y de las interrumpidas pendientes.
  - **Verificar:** test de CA-001-07; las pendientes siguen visibles aunque haya más de N sesiones nuevas.
  - **Commit:** `feat(server): conserva el respaldo de sesiones temporales`

- [ ] **T35: Restaurar sesiones interrumpidas**
  - **Cubre:** REQ-001-67, REQ-001-68, REQ-001-71
  - **Hacer:** endpoint de restauración en cualquier PC libre, sin cobro, enlazada a la original. Solo una vez y dentro de 48 h.
  - **Verificar:** tests de CA-001-06, CA-001-08 y CA-001-11.
  - **Commit:** `feat(server): restaura sesiones temporales interrumpidas`

## Fase 7: Simulador y rendimiento

- [ ] **T36: Simulador de agentes**
  - **Cubre:** plan 001
  - **Hacer:** `tools/agent-sim`: CLI que simula N PCs (`hello`, `login`, `heartbeat` cada 10 s, desconexiones).
  - **Verificar:** 5 PCs simuladas abren sesión y descuentan saldo contra el servidor local.
  - **Commit:** `feat(tools): añade el simulador de PCs`

- [ ] **T37: Prueba de carga**
  - **Cubre:** REQ-001-50, ADR-0011
  - **Hacer:** escenario de 40 PCs que mide el p95 del login y la memoria del proceso. Resultados en `docs/specs/001-cuentas-y-sesiones/mediciones.md`.
  - **Verificar:** p95 < 2 s y memoria < 384 MB, **medido en el i5 de 2ª gen** (o apuntar que falta hacerlo en el hardware real).
  - **Commit:** `test(server): mide la carga con 40 PCs simuladas`

## Fase 8: Panel (`apps/panel`)

- [ ] **T38: Esqueleto del panel y login**
  - **Cubre:** REQ-001-40
  - **Hacer:** Vite + React + wouter, cliente de API tipado con `shared` y pantalla de login del personal.
  - **Verificar:** login contra el servidor local en el navegador.
  - **Commit:** `feat(panel): crea el panel con el login del personal`

- [ ] **T39: Mapa de PCs en vivo**
  - **Cubre:** REQ-001-31
  - **Hacer:** cuadrícula de PCs (libre, en uso) con cliente o nombre temporal, quién la abrió y tiempo restante, actualizada por WebSocket.
  - **Verificar:** con el simulador, el mapa cambia en < 1 s.
  - **Commit:** `feat(panel): muestra el mapa de PCs en vivo`

- [ ] **T40: Clientes**
  - **Cubre:** REQ-001-01, REQ-001-02, REQ-001-04
  - **Hacer:** lista con buscador, alta de cliente y bloqueo o desactivación.
  - **Verificar:** manual contra el servidor local.
  - **Commit:** `feat(panel): gestiona los clientes`

- [ ] **T41: Turno, recargas y venta de combos**
  - **Cubre:** REQ-001-03, REQ-001-84, REQ-001-85
  - **Hacer:** control para abrir y cerrar turno, diálogo de recarga y diálogo de compra de combo (en caja o con saldo).
  - **Verificar:** manual; los saldos del cliente cambian al momento.
  - **Commit:** `feat(panel): permite recargar y vender combos`

- [ ] **T42: Tabla de tarifas**
  - **Cubre:** REQ-001-10, REQ-001-15
  - **Hacer:** tabla de 7 días con selección múltiple (solo administrador).
  - **Verificar:** CA-001-20 a mano.
  - **Commit:** `feat(panel): permite editar las tarifas por día`

- [ ] **T43: Administración de combos**
  - **Cubre:** REQ-001-80, REQ-001-81
  - **Hacer:** lista, alta y edición, mostrando el precio por hora y el descuento en vivo mientras se escribe.
  - **Verificar:** CA-001-14 a mano.
  - **Commit:** `feat(panel): administra los combos`

- [ ] **T44: Sesiones temporales en el panel**
  - **Cubre:** REQ-001-60, REQ-001-61, REQ-001-70, REQ-001-69
  - **Hacer:** diálogos de abrir temporal (tiempo o importe, nombre, método), añadir tiempo y cerrar.
  - **Verificar:** CA-001-05 y CA-001-10 a mano con el simulador.
  - **Commit:** `feat(panel): gestiona las sesiones temporales`

- [ ] **T45: Interrumpidas y restauración**
  - **Cubre:** REQ-001-64, REQ-001-66, REQ-001-67, REQ-001-68, REQ-001-71
  - **Hacer:** vista de sesiones interrumpidas y del respaldo por PC, con el botón Restaurar y la elección de PC.
  - **Verificar:** simular un apagón con el simulador y restaurar (CA-001-06).
  - **Commit:** `feat(panel): muestra y restaura sesiones interrumpidas`

## Fase 9: Shell (`apps/shell-ui`)

- [ ] **T46: Esqueleto del Shell y pantalla de login**
  - **Cubre:** REQ-001-20, REQ-001-52
  - **Hacer:** Vite + React y cliente del canal PC (en desarrollo, WebSocket directo; con la spec 003 pasará por el host). Pantalla de bloqueo con login y mensajes de error en español.
  - **Verificar:** login en el navegador contra el servidor local.
  - **Commit:** `feat(shell-ui): crea el Shell con la pantalla de login`

- [ ] **T47: Estado de la sesión**
  - **Cubre:** REQ-001-12, REQ-001-13, REQ-001-88
  - **Hacer:** horas de combo, saldo con su tiempo equivalente, tiempo total y cuenta atrás local entre cada `state`. El equivalente en Bs se muestra solo si existe una tasa (spec 005).
  - **Verificar:** CA-001-12 y CA-001-16 a mano.
  - **Commit:** `feat(shell-ui): muestra el tiempo y los saldos de la sesión`

- [ ] **T48: Avisos y fin de sesión**
  - **Cubre:** REQ-001-24, REQ-001-25
  - **Hacer:** avisos visibles a 5 y 1 min, y pantalla de "sesión terminada" que vuelve al bloqueo.
  - **Verificar:** manual con saldo bajo.
  - **Commit:** `feat(shell-ui): avisa del fin del tiempo`

- [ ] **T49: Comprar combo desde el Shell**
  - **Cubre:** REQ-001-85
  - **Hacer:** lista de combos activos y confirmación con el saldo resultante.
  - **Verificar:** CA-001-17 a mano.
  - **Commit:** `feat(shell-ui): permite comprar combos con el saldo`

- [ ] **T50: Cerrar sesión**
  - **Cubre:** REQ-001-26, REQ-001-69
  - **Hacer:** botón de cerrar sesión con confirmación; en temporales, con el aviso "Perderás X min".
  - **Verificar:** CA-001-09 a mano.
  - **Commit:** `feat(shell-ui): permite cerrar la sesión con confirmación`

## Cierre

- [ ] **T51: Verificación de aceptación**
  - **Cubre:** todos los CA-001-*
  - **Hacer:** tabla en `mediciones.md` con cada CA y el test o la prueba manual que lo cubre. Marcar la spec como **Implementada** (salvo REQ-001-13, pendiente de la spec 005).
  - **Verificar:** revisión del mantenedor.
  - **Commit:** `docs(specs): verifica los criterios de aceptación de la spec 001`
