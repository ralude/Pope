# Tareas 001: Cuentas y sesiones

- **Estado:** Aprobado
- **Plan:** [plan.md](plan.md)

Reglas: una tarea = un commit. Marca `[x]` en el mismo commit que la implementa. Cada
commit deja el repo compilando y con `pnpm test` en verde. Los tests nombran el REQ que
prueban. Si una tarea resulta más grande de lo previsto (> 400 líneas), divídela aquí
antes de seguir.

## Fase 1: Monorepo

- [x] **T01: Crear el monorepo**
  - **Cubre:** ADR-0002
  - **Hacer:** `package.json` raíz, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` (`strict`), versión de Node LTS fijada (`engines` + `.nvmrc`), scripts `build`, `test`, `lint`, `typecheck`. Documentar los comandos en la sección "Comandos" de `AGENTS.md`.
  - **Verificar:** `pnpm install && pnpm typecheck` sin errores.
  - **Commit:** `build: crea el monorepo con pnpm y Turborepo`

- [x] **T02: Lint y formato**
  - **Cubre:** AGENTS.md (estilo)
  - **Hacer:** ESLint (configuración plana, TypeScript estricto) y Prettier. Script `pnpm lint`.
  - **Verificar:** `pnpm lint` pasa.
  - **Commit:** `build: añade ESLint y Prettier`

- [x] **T03: Paquete `shared` con Vitest**
  - **Cubre:** ADR-0002
  - **Hacer:** `packages/shared` con Vitest y un test de humo.
  - **Verificar:** `pnpm test` ejecuta y pasa el test.
  - **Commit:** `build(shared): crea el paquete compartido con Vitest`

## Fase 2: Dominio compartido (`packages/shared`)

- [x] **T04: Dinero y tiempo**
  - **Cubre:** ADR-0015, REQ-001-12, REQ-001-13
  - **Hacer:** tipos `Micros` y `Seconds` con validación de entero seguro, conversiones (`usd(1.5)` → `1 500 000`), `formatMoney` (USD con 2 decimales y Bs opcional) y `formatDuration` (`1:30:00`). Esquemas zod.
  - **Verificar:** tests de conversión, redondeo al mostrar y rechazo de no enteros.
  - **Commit:** `feat(shared): añade los tipos de dinero y tiempo`

- [x] **T05: Tarifa semanal**
  - **Cubre:** REQ-001-10, REQ-001-14
  - **Hacer:** `weekdayInCaracas(instante)` con `Intl`, `rateFor(tabla, instante)` y el esquema de la tabla de 7 días.
  - **Verificar:** tests en el cambio de día a las 00:00 de Caracas (04:00 UTC) y de miércoles a jueves.
  - **Commit:** `feat(shared): calcula la tarifa según el día de la semana`

- [x] **T06: Motor de cobro (checkpoint)**
  - **Cubre:** REQ-001-11, REQ-001-23, REQ-001-87, ADR-0015
  - **Hacer:** `applyCheckpoint(sesión, saldos, d)`: primero combo, luego dinero con recálculo acumulado `floor(money_seconds × rate / 3600)`, y saldos en vivo. `d` negativo → 0.
  - **Verificar:** tests de combo antes que dinero, paso de combo a dinero dentro de un mismo checkpoint, y test de propiedad: sumar N checkpoints parciales da lo mismo que uno total (sin deriva).
  - **Commit:** `feat(shared): añade el motor de cobro por segundo`

- [x] **T07: Agotamiento y avisos**
  - **Cubre:** REQ-001-24, REQ-001-25, REQ-001-62, REQ-001-63
  - **Hacer:** `secondsUntilExhausted`, `pendingWarnings` (5 y 1 min) y el restante de sesiones temporales.
  - **Verificar:** tests con combo + dinero, solo dinero y sesión temporal.
  - **Commit:** `feat(shared): calcula el agotamiento del saldo y los avisos`

- [x] **T08: Contrato del canal PC ↔ nodo**
  - **Cubre:** plan 001 (Contratos)
  - **Hacer:** esquemas zod de `hello`, `heartbeat`, `login`, `logout`, `buyCombo`, `state`, `warning`, `sessionEnded` y `error`. Exportar también a JSON Schema (para el agente C# de la spec 003).
  - **Verificar:** tests de mensajes válidos e inválidos.
  - **Commit:** `feat(shared): define el protocolo entre la PC y el nodo`

- [x] **T09: Esquemas de eventos (cuentas, combos, tarifas y turno)**
  - **Cubre:** REQ-001-30, ADR-0008
  - **Hacer:** eventos versionados del plan, con `actor` (cliente, personal o sistema): formato común, cuentas, saldo, combos, tarifas y turno.
  - **Verificar:** tests de validación de cada tipo de evento.
  - **Commit:** `feat(shared): define los eventos de auditoría y sincronización`
  - **Nota:** dividida en T09 y T09b porque superaba las 400 líneas.

- [x] **T09b: Esquemas de eventos de sesión**
  - **Cubre:** REQ-001-30, REQ-001-31, ADR-0008
  - **Hacer:** `session.started`, `session.ended`, `session.time_added` y `session.restored`, con la PC y el motivo de cierre.
  - **Verificar:** tests de validación de cada tipo de evento de sesión y de CA-001-04.
  - **Commit:** `feat(shared): define los eventos de sesión`

## Fase 3: Servidor base (`apps/server`)

- [x] **T10: Esqueleto NestJS + Fastify**
  - **Cubre:** ADR-0003
  - **Hacer:** app con `POPE_MODE`, configuración validada con zod y endpoint `/health`.
  - **Verificar:** test e2e de `/health`.
  - **Commit:** `feat(server): crea el servidor NestJS sobre Fastify`

- [x] **T11: Servicio de contraseñas**
  - **Cubre:** REQ-001-51
  - **Hacer:** `PasswordService` con `@node-rs/argon2` (argon2id, `m=19 MiB, t=2, p=1`) y script `bench:argon2` para medir en el hardware del local.
  - **Verificar:** tests de hash y verificación. **Ejecutar el benchmark en el i5 de 2ª gen** y apuntar el resultado en el cuerpo del commit.
  - **Commit:** `feat(server): añade el hash de contraseñas con argon2id`

- [x] **T12: Base de datos y pruebas con PGlite**
  - **Cubre:** ADR-0004
  - **Hacer:** Drizzle + `pg`, ejecutor de migraciones, utilidad de tests con PGlite y script `test:pg` contra PostgreSQL real (`DATABASE_URL`).
  - **Verificar:** un test crea la BD en PGlite y aplica las migraciones.
  - **Commit:** `feat(server): conecta PostgreSQL con Drizzle y migraciones`

- [x] **T13: Tabla de eventos y transacciones**
  - **Cubre:** REQ-001-30, ADR-0008
  - **Hacer:** tabla `events` (con `seq`) y un helper `inTransaction(tx => …, emit)` que escribe los eventos en la misma transacción.
  - **Verificar:** test de que un rollback no deja eventos.
  - **Commit:** `feat(server): registra los eventos en la misma transacción`

- [x] **T14: Personal**
  - **Cubre:** REQ-001-40, REQ-001-51
  - **Hacer:** roles y esquemas del personal y evento `staff.created` en `shared`; tabla `staff` y `StaffService.create`, con usuario único sin distinguir mayúsculas.
  - **Verificar:** tests de alta con contraseña en hash y evento, y de usuario repetido.
  - **Commit:** `feat(server): añade el personal del local`
  - **Nota:** la T14 original se dividió en T14, T14a, T14b y T14c porque superaba las 400 líneas.

- [x] **T14a: Sesiones del panel**
  - **Cubre:** REQ-001-40
  - **Hacer:** tabla `staff_sessions` (hash del token) y `AuthService`: login, validación con renovación de 7 días y logout, según las preguntas resueltas de la spec. Reloj inyectable (`Clock`) para probar la caducidad.
  - **Verificar:** tests de login correcto e incorrecto, personal desactivado, caducidad, renovación y logout.
  - **Commit:** `feat(server): añade las sesiones del personal`

- [x] **T14b: Login del personal y guard de roles**
  - **Cubre:** REQ-001-40
  - **Hacer:** `POST /auth/login`, `POST /auth/logout` y `GET /auth/me` con cookie httpOnly, y guard global (en modo local) con `@Public()` y `@Roles(...)`.
  - **Verificar:** tests e2e de login correcto e incorrecto, cookie, logout y acceso denegado por rol.
  - **Commit:** `feat(server): añade el login del personal con roles`

- [x] **T14c: CLI del primer administrador**
  - **Cubre:** REQ-001-40
  - **Hacer:** comando que crea el primer administrador pidiendo usuario, nombre y contraseña (sin mostrarla). Se niega si ya hay un administrador.
  - **Verificar:** tests de creación, evento `staff.created` y rechazo si ya existe un administrador.
  - **Commit:** `feat(server): añade la CLI para crear el primer administrador`

- [x] **T14d: Gestión del personal**
  - **Cubre:** REQ-001-40
  - **Hacer:** endpoints solo para `administrador`: alta de personal (usuario, nombre, rol y contraseña, con evento `staff.created`), lista y activar o desactivar. Al desactivar, sus sesiones del panel dejan de valer.
  - **Antes de empezar:** resolver la pregunta abierta de la spec sobre el evento al desactivar personal.
  - **Verificar:** tests de alta, usuario duplicado, desactivación (su cookie deja de valer) y acceso denegado a quien no es administrador.
  - **Commit:** `feat(server): gestiona el personal del local`
  - **Nota:** añadida al empezar T14; ninguna tarea permitía crear encargados.

## Fase 4: Clientes, saldos, tarifas y combos

- [x] **T15: Esquemas de clientes**
  - **Cubre:** REQ-001-02, REQ-001-04
  - **Hacer:** en `shared`, estados de la cuenta, formato del usuario, contraseña mínima, teléfono venezolano normalizado y esquemas de alta, cambio de estado y búsqueda, según las preguntas resueltas de la spec.
  - **Verificar:** tests de cada formato válido e inválido.
  - **Commit:** `feat(shared): define las cuentas de cliente`
  - **Nota:** la T15 original se dividió en T15 (`shared`) y T15a (servidor) porque superaba las 400 líneas.

- [x] **T15a: Clientes**
  - **Cubre:** REQ-001-01, REQ-001-02, REQ-001-04, REQ-001-30
  - **Hacer:** tabla `customers` y endpoints para crear, listar, buscar y cambiar estado, con eventos.
  - **Verificar:** tests de usuario duplicado (sin distinguir mayúsculas), bloqueo y eventos.
  - **Commit:** `feat(server): gestiona las cuentas de cliente`

- [x] **T16: Credenciales de cliente y bloqueo por intentos**
  - **Cubre:** REQ-001-51, REQ-001-52
  - **Hacer:** `CustomerAuthService.verify` con contador de fallos y `locked_until`.
  - **Verificar:** test de 5 fallos → bloqueado 5 min → desbloqueado después.
  - **Commit:** `feat(server): bloquea el login de clientes tras 5 intentos fallidos`

- [x] **T16a: Desbloqueo manual del login**
  - **Cubre:** REQ-001-52
  - **Hacer:** `POST /customers/:id/unlock` (encargado y administrador) que quita el bloqueo por intentos y emite `customer.login_unlocked`; el cliente del panel indica hasta cuándo está bloqueado.
  - **Verificar:** tests e2e de desbloqueo, del evento, de los roles y de que sin bloqueo no emite nada.
  - **Commit:** `feat(server): permite quitar el bloqueo por intentos desde el panel`
  - **Nota:** tarea añadida por la pregunta resuelta sobre el desbloqueo manual.

- [x] **T17: Turno de caja mínimo**
  - **Cubre:** REQ-001-03 (dependencia de la spec 005)
  - **Hacer:** tabla `cash_shifts`, abrir y cerrar turno, y guard "requiere turno abierto".
  - **Verificar:** tests de un solo turno abierto por encargado y de rechazo sin turno.
  - **Commit:** `feat(server): añade el turno de caja mínimo`

- [x] **T18: Ledger y saldos**
  - **Cubre:** REQ-001-83, REQ-001-89, ADR-0014
  - **Hacer:** tablas `ledger` y `customer_balances`, y un `WalletService.post()` que inserta en el ledger y actualiza la caché en la misma transacción. Helper de test `assertBalancesMatchLedger`.
  - **Verificar:** tests de los dos monederos y de la invariante.
  - **Commit:** `feat(server): añade el ledger con los dos saldos`

- [x] **T19: Recargas**
  - **Cubre:** REQ-001-03
  - **Hacer:** endpoint de recarga (importe y método) ligado al turno, con evento `wallet.recharged`.
  - **Verificar:** tests de recarga, rechazo sin turno e invariante.
  - **Commit:** `feat(server): permite recargar saldo desde el panel`

- [x] **T20: Tarifas semanales**
  - **Cubre:** REQ-001-10, REQ-001-15
  - **Hacer:** tabla `tariff_days` con los valores iniciales (lunes–miércoles 1,50; jueves–domingo 2,00), `GET` y `PUT` de varios días a la vez (solo administrador), y evento con los valores anteriores y los nuevos.
  - **Verificar:** test de CA-001-20.
  - **Commit:** `feat(server): permite editar la tarifa de cada día`

- [x] **T21: Combos**
  - **Cubre:** REQ-001-80, REQ-001-81
  - **Hacer:** tabla `combos` y CRUD (solo administrador); la respuesta incluye el precio por hora y el descuento frente a cada tarifa.
  - **Verificar:** test de CA-001-14.
  - **Commit:** `feat(server): gestiona los combos de horas`

- [x] **T22: Compra de combos**
  - **Cubre:** REQ-001-82, REQ-001-84, REQ-001-85
  - **Hacer:** compra en caja (turno + método) y compra con saldo, guardando la copia del combo. Evento `combo.purchased`.
  - **Verificar:** tests de CA-001-17, saldo insuficiente e invariante.
  - **Commit:** `feat(server): permite comprar combos en caja o con saldo`

## Fase 5: Sesiones con cuenta

- [x] **T23: Tablas de PCs y sesiones**
  - **Cubre:** REQ-001-21
  - **Hacer:** tablas `pcs` (con datos de ejemplo para desarrollo) y `sessions`, con índices únicos de sesión activa por cliente y por PC.
  - **Verificar:** test de que la BD rechaza una segunda sesión activa.
  - **Commit:** `feat(server): añade las tablas de PCs y sesiones`

- [x] **T24: Gateway WebSocket de PCs**
  - **Cubre:** plan 001 (Contratos)
  - **Hacer:** `requestId` opcional en `login`, `logout` y `buyCombo`, devuelto en `error` (protocolo en `shared`). Gateway con `ws` y despachador propio por `type`, `hello` (identidad de desarrollo; el registro real es la spec 003), registro de conexiones y envío de `state` bloqueado.
  - **Verificar:** test e2e: una PC se conecta y recibe `state` bloqueado; un mensaje no válido recibe `error` con su `requestId`.
  - **Commit:** `feat(server): conecta las PCs por WebSocket`
  - **Decidido (2026-09-30, ADR-0003):** `ws` sin Socket.IO, despachador propio por `type` (el socket se maneja directamente) y `requestId` opcional para saber a qué petición responde cada `error`.

- [x] **T25: Login desde la PC**
  - **Cubre:** REQ-001-20, REQ-001-21, REQ-001-14, REQ-001-16
  - **Hacer:** mensaje `login` → validar, comprobar saldo ≥ 1 min, crear la sesión copiando la tarifa del día y emitir `session.started`.
  - **Verificar:** tests de CA-001-01, CA-001-02, CA-001-13 y CA-001-21.
  - **Commit:** `feat(server): abre sesiones desde la PC`

- [x] **T26: Latidos y checkpoint**
  - **Cubre:** REQ-001-11, REQ-001-12, REQ-001-23, REQ-001-87, REQ-001-88
  - **Hacer:** en cada `heartbeat`, aplicar el motor con el reloj del nodo, guardar la sesión y enviar `state`.
  - **Verificar:** tests de CA-001-12, CA-001-16 y CA-001-19 con reloj simulado.
  - **Commit:** `feat(server): cobra la sesión en cada latido`

- [x] **T27: Avisos y agotamiento**
  - **Cubre:** REQ-001-24, REQ-001-25
  - **Hacer:** temporizador por sesión, envío de `warning` a 5 y 1 min, y cierre al agotarse.
  - **Verificar:** tests con reloj simulado.
  - **Commit:** `feat(server): avisa y cierra la sesión al agotarse el saldo`
  - **Orden (2026-09-30):** se hace después de T28: el cierre por agotamiento usa el cierre con liquidación del ledger que construye T28.

- [x] **T28: Cierre por el cliente o el encargado**
  - **Cubre:** REQ-001-26, REQ-001-31
  - **Hacer:** `logout` desde la PC y endpoint de cierre del personal. Al cerrar, se escriben las filas del ledger (combo y dinero) y el evento `session.ended` con el motivo.
  - **Verificar:** tests de ambos cierres, del motivo y de la invariante.
  - **Commit:** `feat(server): cierra sesiones y liquida el consumo`

- [x] **T28a: Ajustes del nodo**
  - **Cubre:** REQ-001-27, REQ-001-64
  - **Hacer:** tabla `settings` con el tiempo de gracia de los latidos (3 min) y las sesiones temporales conservadas por PC (3, mínimo 3); `GET` para el personal y `PUT` solo para el administrador, con evento `setting.changed`.
  - **Verificar:** tests de valores por defecto, cambio con evento, mínimo de 3 y acceso denegado a quien no es administrador.
  - **Commit:** `feat(server): añade los ajustes del nodo`
  - **Nota:** añadida por la pregunta resuelta sobre dónde se configura el respaldo.
  - **Límites elegidos (2026-09-30, por confirmar):** gracia de latidos entre 30 s y 30 min (menos cerraría sesiones por un corte de red breve); sesiones temporales conservadas entre 3 y 100. Sin fila en `settings` vale el valor por defecto de `DEFAULT_SETTINGS`; se escribe una fila solo al cambiar un ajuste.

- [x] **T29: Cierre sin latidos y recuperación al arrancar**
  - **Cubre:** REQ-001-27
  - **Hacer:** proceso periódico de cierre por falta de latidos (tiempo de gracia de T28a), revisión al arrancar el nodo y cierre inmediato si la PC dice "no tengo sesión". Si la PC reconecta con una sesión ya cerrada sin latidos, recibe `sessionEnded`; si era temporal, su restante pasa a ser el menor entre el del nodo y el de la PC (pregunta resuelta de la spec).
  - **Verificar:** test de CA-001-03 y de la reconexión tras un corte de red.
  - **Commit:** `feat(server): cierra las sesiones sin latidos cobrando hasta el último`
  - **Decidido al implementarla (2026-09-30):** "no tengo sesión" se entiende solo en el `hello` (un latido con `sessionId` nulo justo tras un login diría lo mismo y cerraría la sesión recién abierta). Los temporizadores de T27 solo cobran si la PC latió hace ≤ 15 s, para no cobrar el hueco. La corrección del restante de una temporal deja el evento `session.remaining_corrected` y no se aplica si ya se restauró.

- [x] **T30: Compra de combo desde el Shell**
  - **Cubre:** REQ-001-85
  - **Hacer:** mensaje `buyCombo` durante la sesión; el `state` se actualiza al momento.
  - **Verificar:** test de compra en plena sesión, con el checkpoint correcto.
  - **Commit:** `feat(server): permite comprar combos desde la PC`
  - **Decidido al implementarla (2026-09-30):** la compra con saldo (Shell y panel) descuenta también lo que la sesión en curso ya consumió y aún no está en el ledger; sin eso, el saldo podía quedar en negativo al cerrar. Las filas de ledger de una compra hecha en el Shell llevan el `session_id`.

## Fase 6: Sesiones temporales

- [x] **T31: Abrir sesión temporal**
  - **Cubre:** REQ-001-22, REQ-001-60, REQ-001-61, REQ-001-62, REQ-001-82
  - **Hacer:** endpoint con tiempo o importe, nombre opcional (con valor por defecto), método de pago y turno. Tabla `session_topups`.
  - **Verificar:** tests de CA-001-04, CA-001-05 y CA-001-18.
  - **Commit:** `feat(server): abre sesiones temporales sin cuenta`
  - **Decidido al implementarla (2026-09-30):** `POST /sessions/temporary` (encargado y administrador, con turno abierto) pide `minutes` o `amountMicros`, no las dos. La PC debe estar libre y **conectada** al nodo (si no, se cobraría por una PC que no puede desbloquearse). Cada cobro admite como máximo 24 h y al menos un céntimo. `session_topups` guarda solo los cobros (la restauración no cobra, no tiene fila).

- [x] **T32: Añadir tiempo a una sesión temporal**
  - **Cubre:** REQ-001-70
  - **Hacer:** endpoint que cobra con la tarifa de la sesión y registra un `session_topup` y un evento.
  - **Verificar:** test de CA-001-10.
  - **Commit:** `feat(server): permite añadir tiempo a una sesión temporal`
  - **Decidido al implementarla (2026-09-30):** `POST /sessions/:id/time` cobra primero lo ya usado y después suma el tiempo, así que se añade a lo que de verdad queda. Para que un cierre por agotamiento no pise a un cobro simultáneo, `close` admite `onlyIfExhausted` (también protege una recarga en el último segundo de una sesión con cuenta).

- [x] **T33: Cierre anticipado de sesión temporal**
  - **Cubre:** REQ-001-69
  - **Hacer:** cierre por el cliente o el encargado sin devolución. No aparece en interrumpidas.
  - **Verificar:** test de CA-001-09.
  - **Commit:** `feat(server): descarta el tiempo sobrante al cerrar una temporal`
  - **Hecho sin código nuevo (2026-09-30):** el cierre de T28 ya no devuelve nada en las temporales (no escribe en el ledger ni toca los cobros) y anota el sobrante en `session.ended`; solo faltaba demostrarlo, así que el commit es `test(server): comprueba que cerrar una temporal descarta el tiempo sobrante`. Que la sesión no salga en "interrumpidas" (solo entran las de motivo `no_heartbeat`) se comprueba en T34 y T35.

- [x] **T34: Respaldo y sesiones interrumpidas**
  - **Cubre:** REQ-001-63, REQ-001-64, REQ-001-65, REQ-001-66
  - **Hacer:** consultas de las últimas N por PC (N del ajuste de T28a, ≥ 3) y de las interrumpidas pendientes.
  - **Verificar:** test de CA-001-07; las pendientes siguen visibles aunque haya más de N sesiones nuevas.
  - **Commit:** `feat(server): conserva el respaldo de sesiones temporales`
  - **Decidido al implementarla (2026-09-30):** `GET /sessions/temporary/backup` y `GET /sessions/temporary/interrupted`, de solo lectura para todo el personal (también el dueño). Las sesiones nunca se borran; el respaldo solo decide cuáles se muestran: las últimas N por PC más las interrumpidas pendientes. Las 48 h de REQ-001-71 cuentan desde el **último latido** (el corte), no desde el cierre del nodo: así CA-001-11 (corte a las 18:00, caducada el miércoles a las 18:01) se cumple. Cada sesión lleva `interruption` (`pending`, `restored` o `expired`, con quién restauró y cuándo) o `null`.

- [x] **T35: Restaurar sesiones interrumpidas**
  - **Cubre:** REQ-001-67, REQ-001-68, REQ-001-71
  - **Hacer:** endpoint de restauración en cualquier PC libre, sin cobro, enlazada a la original. Solo una vez y dentro de 48 h.
  - **Verificar:** tests de CA-001-06, CA-001-08 y CA-001-11.
  - **Commit:** `feat(server): restaura sesiones temporales interrumpidas`
  - **Decidido al implementarla (2026-09-30):** `POST /sessions/:id/restore` con `{ pcId }` (encargado y administrador, sin exigir turno porque no cobra). La sesión nueva conserva el nombre y la tarifa de la original, tiene como tiempo el restante y no genera fila en `session_topups`. La PC de destino debe estar libre y conectada, como al abrir. Cada rechazo dice por qué: ya restaurada (con quién y a qué hora), caducada, no interrumpida por un corte, sin tiempo restante, en curso, con cuenta o PC no disponible. La decisión de si se puede restaurar sale de `interruptionOf` (la misma que usa el respaldo).

## Fase 7: Simulador y rendimiento

> **Decidido antes de empezar la fase (2026-09-30, mantenedor).** La fase se parte en
> tareas pequeñas. El simulador (`tools/agent-sim`, paquete `@pope/agent-sim`) imita el
> "Comportamiento del agente en el canal" del plan, **sin dependencias nuevas**: usa el
> `WebSocket` global de Node 24, `node:util` (`parseArgs`) y `node:readline`, y solo depende
> de `@pope/shared`. Los clientes de prueba se crean **por la API del panel**, como lo haría
> un encargado, para que queden todos sus eventos; las PCs, con `dev:seed-pcs`. La
> prueba de carga **no** entra en `pnpm test`, porque necesita el servidor compilado y
> PostgreSQL real. El ámbito de los commits de `tools/*` es `tools` (AGENTS.md).

- [x] **T35a: PCs de ejemplo configurables**
  - **Cubre:** plan 001 (Estrategia de pruebas: carga)
  - **Hacer:**
    - Mover `devPcId(n)` y `devPcName(n)` de `apps/server/src/pcs/dev-pcs.ts` a `packages/shared/src/dev-pcs.ts` (exportadas desde el `index.ts`) para que el simulador use los mismos ids. El servidor las importa de `@pope/shared`. Validar que `n` es un entero de 1 a 99 (lanza `RangeError` si no).
    - `seedDevPcs(db, count = 10)`: crea "PC 01" … "PC NN" que falten.
    - `dev:seed-pcs` admite `--count N` (con `parseArgs` de `node:util`; por defecto 10, de 1 a 99). El mensaje dice cuántas creó y cuántas ya existían.
  - **Verificar:** tests de `devPcId` y `devPcName` en `shared` (límites 1 y 99, rechaza 0, 100 y 1,5) y de `seedDevPcs` con 40 en el servidor (se puede ejecutar dos veces sin error y sin duplicar).
  - **Commit:** `feat(server): permite crear hasta 99 PCs de ejemplo`

- [x] **T36: PC simulada**
  - **Cubre:** plan 001 ("Comportamiento del agente en el canal")
  - **Hacer:** crear el paquete `tools/agent-sim` (`@pope/agent-sim`) copiando las convenciones de `packages/shared`: ESM, `tsconfig.json` y `tsconfig.build.json`, scripts `build`, `start` (`node dist/cli.js`), `typecheck`, `lint` y `test` (Vitest). Y la clase `SimulatedPc` en `src/simulated-pc.ts`:
    - Recibe el número de PC, la URL del canal (`ws://host:3000/pc`) y una fábrica de conexiones (por defecto, el `WebSocket` global), para poder probarla sin servidor.
    - Cumple la tabla del plan: `hello` al conectar (con `sessionId` y `localRemainingSeconds` si los tiene), `heartbeat` cada 10 s siempre, adopta el `state` activo, cuenta el restante en local cada segundo, olvida la sesión con `sessionEnded` o `state` bloqueado, y reconecta con espera 1, 2, 4, 8, 16 y 30 s (tope).
    - Métodos: `start()`, `login(usuario, contraseña)` (devuelve la respuesta del nodo y los milisegundos que tardó, medidos con `performance.now()` desde que envía hasta que recibe `state` o `error`), `logout()`, `networkCut(segundos)` (cierra la conexión, sigue contando y reconecta pasado ese tiempo con su sesión), `reboot()` (cierra, olvida la sesión y reconecta con `sessionId: null`), `powerCut()` (cierra y no reconecta ni late hasta `powerOn()`, que arranca como tras un reinicio), `stop()`.
    - Valida cada mensaje recibido con `nodeToPcMessageSchema`; uno inválido se registra y se ignora.
    - Emite eventos (`EventEmitter` o una función de aviso) para que la CLI los muestre: conectada, desconectada, `state`, `warning`, `sessionEnded` y `error`.
  - **Verificar:** tests unitarios con una conexión falsa y `vi.useFakeTimers()`: contenido del `hello` al principio (sin sesión) y tras adoptar una; latido cada 10 s con sesión y restante; restante que baja en local; `sessionEnded` borra la sesión; un corte de red reconecta con la sesión y su restante; `reboot` manda `sessionId: null`; `powerCut` deja de latir; secuencia de espera 1, 2, 4, 8, 16, 30, 30 s; un mensaje inválido no rompe nada; `login` devuelve la latencia.
  - **Commit:** `feat(tools): añade la PC simulada`

- [x] **T36a: CLI del simulador: datos de prueba y ejecución**
  - **Cubre:** plan 001 (Estrategia de pruebas)
  - **Hacer:** `src/cli.ts` con subcomandos (argumentos con `parseArgs`):
    - `seed --url http://127.0.0.1:3000 --user U --password P --customers N --money USD`: inicia sesión del personal con `POST /auth/login` (guarda la cookie), abre turno (`POST /shifts`; si ya hay uno abierto, usa ese) y, para `sim01`…`simNN` (contraseña fija `sim1234`), crea las cuentas que falten (`POST /customers`) y recarga en `cash_usd` hasta llegar a `--money` (lee el saldo con `GET /customers?…`; si ya tiene eso o más, no recarga). Al final cierra el turno que abrió. Imprime una línea por cliente.
    - `run --url ws://127.0.0.1:3000/pc --pcs 1-5 [--login] [--duration S]`: arranca esas PCs; con `--login`, la PC N inicia sesión como `simNN`. Una línea por evento con hora local, PC y lo que pasó, con `formatDuration` y `formatMoney` de `shared` (p. ej. `18:00:05 PC 05 · sim05 entra · 2:00:00 · 3,00 USD`). Con `--duration`, al terminar hace `logout` en todas y muestra, por PC, el saldo al entrar y al salir.
  - **Verificar:** tests unitarios del parseo de argumentos (`1-5`, `1,3,7`, errores claros en español). Y a mano, contra PostgreSQL real, con esta receta (anotar la salida en el commit):
    1. `pnpm build`.
    2. Si no hay administrador: `DATABASE_URL=… pnpm --filter @pope/server staff:create-admin`. Es interactivo; si no se puede contestar, pedírselo al mantenedor.
    3. En segundo plano: `POPE_MODE=local DATABASE_URL=… pnpm --filter @pope/server start`.
    4. `DATABASE_URL=… pnpm --filter @pope/server dev:seed-pcs -- --count 5`.
    5. `pnpm --filter @pope/agent-sim start -- seed --url http://127.0.0.1:3000 --user … --password … --customers 5 --money 3`.
    6. `pnpm --filter @pope/agent-sim start -- run --url ws://127.0.0.1:3000/pc --pcs 1-5 --login --duration 120`.
    - **Esperado:** las 5 PCs entran con el tiempo de la tarifa del día (2:00:00 de lunes a miércoles, 1:30:00 de jueves a domingo) y, al salir, cada una muestra unos 0,05 USD menos (2 min a 1,50 USD/h) o 0,07 USD (a 2,00 USD/h).
  - **Commit:** `feat(tools): permite preparar datos y lanzar PCs simuladas`

- [x] **T36b: Consola interactiva del simulador**
  - **Cubre:** plan 001; la usan T39, T43 y T44 para probar el panel a mano.
  - **Hacer:** subcomando `interactive --url … --pcs 1-10` que arranca las PCs bloqueadas y lee órdenes con `node:readline`: `login N usuario contraseña`, `logout N`, `red N segundos`, `reinicio N`, `apagon N`, `luz N`, `estado` (una línea por PC: bloqueada o en sesión, quién, restante) y `salir`. Sigue mostrando los eventos como `run`. Una orden mal escrita muestra la ayuda sin cerrar la consola.
  - **Verificar:** tests unitarios del intérprete de órdenes. A mano con la receta de T36a: una PC entra, `red N 20` y sigue en sesión al volver; `apagon N` y, pasada la gracia de latidos (3 min por defecto), el servidor la cierra como `no_heartbeat`, y `luz N` la deja bloqueada (como tras un reinicio, según el plan); `reinicio N` con una sesión ya nombrada la cierra al momento. Para no esperar 3 min se puede bajar la gracia con `PUT /settings` (mínimo 30 s; con 30 s un corte de 20 s ya cierra la sesión, así que para ese caso usar 60 s).
  - **Commit:** `feat(tools): añade la consola interactiva del simulador`

- [x] **T37a: Registro de memoria del servidor**
  - **Cubre:** ADR-0011
  - **Hacer:** variable de entorno opcional `POPE_MEMORY_LOG_MS` (validada con zod en la configuración; ausente = desactivado; mínimo 1000). Si está, el servidor registra cada ese tiempo una línea con `Logger` (`Memoria: rss=… MB heapUsed=… MB`, en MB con un decimal) a partir de `process.memoryUsage()`. El temporizador no impide cerrar el proceso (`unref`) y se cancela al cerrar la app.
  - **Verificar:** test de la configuración (valor válido, ausente, menor de 1000 rechazado) y test con reloj simulado de que registra una línea por intervalo. Documentar la variable en AGENTS.md (sección del servidor).
  - **Commit:** `feat(server): registra la memoria del proceso si se pide`

- [x] **T37: Prueba de carga**
  - **Cubre:** REQ-001-50, ADR-0011
  - **Hacer:** subcomando `load --url ws://…/pc --pcs 1-40` y `docs/specs/001-cuentas-y-sesiones/mediciones.md`.
    - **Fase 1, la que decide:** las 40 PCs conectadas y latiendo cada 10 s. La PC N inicia sesión a los `(N − 1) × 1,5 s` (una cada 1,5 s, como llegan los clientes). Después se mantienen las 40 sesiones **10 minutos** con latidos.
    - **Fase 2, informativa:** `logout` en todas y 40 logins **a la vez**. Se anota, pero no decide: cada login verifica argon2 (19 MiB) y Node solo calcula 4 a la vez (`UV_THREADPOOL_SIZE` por defecto), así que en ráfaga se ponen en cola.
    - **Latencia:** la que devuelve `SimulatedPc.login`. Se informa de p50, p95 y máximo de cada fase, con p95 por rango más cercano (la posición `ceil(0,95 × n)` de la lista ordenada). Cualquier `error` en un login hace fallar la prueba.
    - **Memoria:** el servidor se arranca con `POPE_MEMORY_LOG_MS=5000`. En `mediciones.md` se anota el `rss` máximo del registro durante toda la prueba y el del final de los 10 min.
    - Al terminar imprime una tabla en Markdown lista para pegar en `mediciones.md`.
    - `mediciones.md` lleva: equipo (CPU, RAM, sistema, versión de Node y de PostgreSQL, `UV_THREADPOOL_SIZE`), la tabla de T37 y un apartado de T11 (resultados de `bench:argon2`), con **dónde se midió**.
  - **Verificar:** p95 de la fase 1 < 2 s y `rss` máximo < 384 MB. Preparación: la receta de T36a con `--count 40` y `seed --customers 40 --money 20`. Si se mide en el equipo de desarrollo, `mediciones.md` lo dice y queda pendiente medirlo **en el i5 de 2ª gen** (sigue en "Pendientes del mantenedor" de `ESTADO.md`).
  - **Commit:** `feat(tools): mide la carga con 40 PCs simuladas`
  - **Hecho (2026-10-01):** subcomando `load` (con `--stagger-ms`, `--hold-seconds` y `--server-log`) y `mediciones.md`. Medido en el equipo de desarrollo (cumple con holgura); **falta repetirlo en el i5 de 2ª gen**. La memoria se lee del log del servidor: el desplazamiento del archivo al empezar y al terminar las sesiones separa el pico de arranque, el de la prueba y el del final.

## Fase 8: Panel (`apps/panel`)

> **Decidido antes de empezar la fase (2026-10-01, mantenedor).** El diseño de referencia
> es el lienzo "Panel Pope · Fase 8 (estilo SENET)" (plan, "Panel"), para la pantalla de
> 1920×1080 del servidor. Fuente Nunito incluida con `@fontsource/nunito`. El equivalente
> en Bs queda oculto hasta la spec 005 y se escribe «Bs». Organizar el mapa arrastrando
> (REQ-001-45) lleva tareas propias con `@dnd-kit/core`. El panel compilado lo sirve el nodo
> (T45a). Las pantallas solo tienen tests de su lógica (cliente de API, cálculos), no de
> DOM; se verifican a mano contra el servidor y el simulador.

- [x] **T38: Esqueleto del panel y login**
  - **Cubre:** REQ-001-40
  - **Hacer:** `apps/panel` (`@pope/panel`) con Vite + React + wouter, con las convenciones de paquete de AGENTS.md. Cliente de API tipado que valida las respuestas con los esquemas de `shared` y convierte los errores del nodo en mensajes en español. Tema del diseño (colores, Nunito, raíl de iconos y barra superior con el personal y "Salir") y pantalla de login. Las rutas sin sesión llevan al login; al entrar se va al mapa (de momento, vacío). En desarrollo, Vite hace de proxy de `/auth`, `/customers`… y de los WebSocket al nodo, para que la cookie sea del mismo origen.
  - **Verificar:** tests del cliente de API (respuesta válida, 401, error con mensaje del nodo, respuesta que no cumple el esquema). A mano: login correcto e incorrecto, recargar la página sigue dentro, "Salir" vuelve al login.
  - **Commit:** `feat(panel): crea el panel con el login del personal`

- [x] **T38a: Estado de las PCs para el panel**
  - **Cubre:** REQ-001-31
  - **Hacer:** en `shared`, el esquema del estado de cada PC para el mapa: id, nombre, posición, conectada, y su sesión activa resumida (tipo, quién, abierta por, restante, saldo o cobrado, tarifa, si quedan menos de 5 min). En el servidor, `GET /pcs/map` (todo el personal) y el canal WebSocket `/panel`, autenticado con la cookie del personal (sin ella, se cierra), que envía el estado completo de las PCs al conectar y cada vez que algo cambia (sesión abierta o cerrada, latido, PC conectada o desconectada), como mucho una vez por segundo.
  - **Verificar:** tests e2e: el mapa refleja PCs libres, con cuenta, temporales y desconectadas; un login desde la PC llega por el canal; sin cookie el canal se cierra.
  - **Commit:** `feat(server): envía el estado de las PCs al panel`
  - **Decidido al implementarla (2026-10-01):** el canal se refresca con los eventos confirmados (`EventsService.subscribe`) y con las conexiones y desconexiones de las PCs; los latidos no emiten eventos, así que cada sesión lleva su restante y `billedUntil` para que el panel cuente en vivo. La sesión del personal se comprueba al abrir el canal (si luego desactivan a alguien, su canal sigue abierto hasta que recargue).

- [x] **T39: Mapa de PCs en vivo**
  - **Cubre:** REQ-001-31
  - **Hacer:** mapa como en el diseño: baldosas en su posición guardada (o por número), con color de sesión con cuenta, temporal, libre o sin conexión, raya roja si quedan menos de 5 min, tiempo restante debajo, leyenda con recuentos, ocupación y panel de detalle de la PC elegida (cliente o nombre temporal, quién la abrió, restante, saldo o cobrado, tarifa y botones de acción). Se actualiza con el canal `/panel` de T38a.
  - **Verificar:** con la consola del simulador (T36b), el mapa cambia en < 1 s.
  - **Commit:** `feat(panel): muestra el mapa de PCs en vivo`
  - **Decidido al implementarla:** de los botones de acción, T39 trae «Cerrar sesión» (REQ-001-26, con confirmación; el dueño no lo ve). «Recargar saldo» y «Vender combo» se añaden al detalle en T41 (necesitará el id del cliente en `pcMapSessionSchema`), y «Sesión temporal», «Abrir sesión temporal» y «Añadir tiempo», en T44. El mapa usa 14 columnas, como el diseño. Una PC con sesión pero desconectada conserva su color con borde discontinuo y cuenta en su tipo de sesión, no en «Sin conexión». Entre envíos, el restante y el saldo se cuentan en el panel con el reloj del nodo (`at` del mapa) y el motor de cobro de `shared`; el siguiente envío corrige cualquier diferencia. Medido con la consola del simulador: 17–36 ms del cambio al mensaje en el canal (hasta 1 s si llegan varios cambios seguidos, por el límite de T38a).

- [x] **T39a: Guardar la distribución del mapa**
  - **Cubre:** REQ-001-45
  - **Hacer:** columnas `map_row` y `map_col` en `pcs` (únicas juntas cuando no son nulas), evento `pc.map_changed` (las PCs que cambian, con su posición anterior y la nueva) y `PUT /pcs/map` solo para el administrador, que guarda la distribución completa en una transacción.
  - **Verificar:** tests e2e: guardar, intercambiar dos PCs, evento solo con las que cambian, dos PCs en la misma casilla rechazado y acceso denegado a quien no es administrador.
  - **Commit:** `feat(server): guarda la distribución del mapa de PCs`
  - **Decidido al implementarla:** el cuerpo es `{ positions: [{ pcId, row, col }] }` (`pcMapLayoutRequestSchema` en `shared`); las PCs que no vienen se quedan sin posición. El mapa tiene 14 columnas (`PC_MAP_COLUMNS`) y hasta 30 filas (`PC_MAP_MAX_ROWS`). Responde 204; el panel recibe el mapa nuevo por el canal `/panel`. Una PC que no existe da 404 y no se toca nada. Las PCs se bloquean (`FOR UPDATE`) mientras se guarda, por si dos administradores guardan a la vez. Probado también contra PostgreSQL real.

- [x] **T39b: Organizar el mapa arrastrando**
  - **Cubre:** REQ-001-45
  - **Hacer:** pestaña "Organizar" del mapa (solo para el administrador) con `@dnd-kit/core`: arrastrar una PC a una casilla, intercambiar si está ocupada, guardar o descartar. También con teclado.
  - **Verificar:** a mano: reorganizar, guardar, recargar la página y ver la misma distribución en otro navegador.
  - **Commit:** `feat(panel): permite organizar el mapa arrastrando las PCs`
  - **Decidido al implementarla:** con el ratón, la PC cae en la casilla bajo el puntero; con el teclado (Espacio o Intro, flechas, Espacio o Intro, Escape), cada flecha la lleva a la casilla vecina, y los avisos para lectores de pantalla van en español. Al organizar se ve una fila vacía de sobra para poder bajar PCs (7 filas como mínimo, 30 como máximo). Guardar envía la distribución de todas las PCs; la edición se mantiene hasta que el canal trae el mapa ya guardado. `@dnd-kit/core` suma 14 KB comprimidos al panel. Verificado a mano: ratón, teclado e intercambio; tras guardar, la misma distribución al recargar y desde otra sesión.

- [x] **T40: Clientes**
  - **Cubre:** REQ-001-01, REQ-001-02, REQ-001-04
  - **Hacer:** lista con buscador, alta de cliente, bloqueo o desactivación, y botón para quitar el bloqueo por intentos (T16a).
  - **Verificar:** manual contra el servidor local.
  - **Commit:** `feat(panel): gestiona los clientes`
  - **Decidido al implementarla:** pantalla `/clientes` según el lienzo, sin el equivalente en Bs y sin «Recargar saldo» ni «Vender combo», que llegan con T41. La búsqueda se lanza 250 ms después de la última tecla, de 50 en 50 con «Ver más». La columna Estado muestra «Bloqueo por intentos» solo en cuentas activas. El panel lateral ofrece pasar a cualquiera de los otros dos estados, sin confirmación porque se puede deshacer. El alta marca bajo cada campo el error del nodo y permite mostrar la contraseña. El dueño solo consulta. Verificado a mano contra PostgreSQL real: búsqueda por nombre con tilde, por cifras del teléfono y por usuario; quitar el bloqueo, bloquear, desactivar y activar (con sus eventos); alta con teléfono incorrecto y correcto, y la vista del dueño sin botones.

- [x] **T41: Turno, recargas y venta de combos**
  - **Cubre:** REQ-001-03, REQ-001-84, REQ-001-85
  - **Hacer:** control para abrir y cerrar turno, diálogo de recarga y diálogo de compra de combo (en caja o con saldo).
  - **Verificar:** manual; los saldos del cliente cambian al momento.
  - **Commit:** `feat(panel): permite recargar y vender combos`
  - **Decidido al implementarla:** recargar y vender solo se ofrecen a cuentas activas. La recarga trae importes rápidos (1, 2, 5 y 10 USD) y muestra el saldo tras recargar; la venta de combo ofrece «Con su saldo» (si alcanza) o «Cobrar en caja» con método de pago. Sin turno, los diálogos lo piden y lo abren ahí mismo. En el mapa, el saldo que se muestra es el de la sesión en vivo. Verificado a mano contra PostgreSQL real con el simulador: abrir turno desde la recarga, recargar por pago móvil a una PC con sesión (saldo y tiempo cambian al momento), vender un combo con saldo y otro en caja, y cerrar el turno; eventos `shift.opened`, `wallet.recharged`, `combo.purchased` y `shift.closed` con Ana como actor.
  - **Decidido por el mantenedor (2026-10-02):** el turno se abre y se cierra desde una píldora de la barra superior («Sin turno · Abrir turno» o «Turno abierto · 14:02»), sin entrada en el raíl hasta la spec 005. «Recargar saldo» y «Vender combo» están en Clientes y también en el detalle de una PC con sesión de cuenta; para eso la sesión del mapa trae el id del cliente (commit de `server`/`shared` aparte).

- [x] **T42: Tabla de tarifas**
  - **Cubre:** REQ-001-10, REQ-001-15
  - **Hacer:** tabla de 7 días con selección múltiple (solo administrador).
  - **Verificar:** CA-001-20 a mano.
  - **Commit:** `feat(panel): permite editar las tarifas por día`
  - **Decidido al implementarla:** pantalla `/tarifas` según el lienzo, sin el equivalente en Bs: una tarjeta por día que el administrador marca (también «Todos» y «Ninguno») y un precio en céntimos para los días marcados. Tras guardar se limpia la selección y se dice qué se guardó. Verificado a mano (CA-001-20): lunes a jueves a 1,50 y después el domingo a 3,00 dejan la tabla lunes–jueves 1,50, viernes–sábado 2,00 y domingo 3,00, con dos eventos `tariff.changed`.
  - **Decidido por el mantenedor (2026-10-02):** el encargado y el dueño ven la tabla sin poder cambiarla.

- [x] **T43: Administración de combos**
  - **Cubre:** REQ-001-80, REQ-001-81
  - **Hacer:** lista, alta y edición, mostrando el precio por hora y el descuento en vivo mientras se escribe.
  - **Verificar:** CA-001-14 a mano.
  - **Commit:** `feat(panel): administra los combos`
  - **Decidido al implementarla:** la pantalla está en `/combo-horas` (decidido por el mantenedor), porque `/combos` es la ruta de la API y el proxy y el nodo la reservan. Lista de combos con su estado y, para el administrador, un panel lateral de alta o edición: nombre, precio en céntimos, horas (admite «1,5») y, al editar, «A la venta». Lo que sale la hora y el descuento por tramos se calculan en el panel con `comboRatePerHour` y `comboDiscounts` de `shared` y la tarifa actual. Guardar se desactiva si no hay cambios. Verificado a mano (CA-001-14): «Combo 20 horas» a 20 USD por 20 h muestra «1,00 USD/h», «33 % menos que de lunes a miércoles (1,50 USD/h)» y «50 % menos que de jueves a domingo (2,00 USD/h)»; desactivar otro combo lo deja «Desactivado».
  - **Decidido por el mantenedor (2026-10-02):** el encargado y el dueño ven la lista sin poder cambiarla. El descuento se agrupa por tramos de días seguidos con el mismo precio («de lunes a miércoles», «viernes y sábado», «el domingo»).

- [x] **T43b: Administración del personal**
  - **Cubre:** REQ-001-40
  - **Hacer:** lista del personal, alta (usuario, nombre, rol y contraseña) y activar o desactivar (solo administrador).
  - **Verificar:** a mano: crear un encargado, iniciar sesión con él y desactivarlo.
  - **Commit:** `feat(panel): administra el personal`
  - **Decidido al implementarla:** pantalla `/personal`, que solo existe para el administrador (raíl y ruta). Tabla con usuario, nombre, rol y estado, y alta en el panel lateral (usuario, nombre para mostrar, rol y contraseña). En la fila de quien ha entrado no hay botón: nadie se desactiva a sí mismo desde el panel (decidido por el mantenedor). Verificado a mano: crear el encargado `carlos`, entrar con él, desactivarlo (su sesión pasa a dar 401 y ya no puede entrar) y un encargado recibe 403 en `GET /staff`.
  - **Nota:** añadida junto con T14d.
  - **Decidido por el mantenedor (2026-10-02):** la sección solo le aparece al administrador.

- [x] **T44: Sesiones temporales en el panel**
  - **Cubre:** REQ-001-60, REQ-001-61, REQ-001-70, REQ-001-69
  - **Hacer:** diálogos de abrir temporal (tiempo o importe, nombre, método), añadir tiempo y cerrar.
  - **Verificar:** CA-001-05 y CA-001-10 a mano con la consola del simulador (T36b).
  - **Commit:** `feat(panel): gestiona las sesiones temporales`
  - **Decidido al implementarla:** «Abrir sesión temporal» sale en una PC libre y conectada; «Añadir tiempo», en una con temporal. El diálogo cobra por tiempo (minutos, con 30 min, 1 h, 2 h y 3 h) o por importe y muestra el otro valor con los mismos cálculos de `shared` que el nodo (tarifa de hoy al abrir, la de la sesión al añadir). El nombre por defecto se ve de ejemplo. Cerrar una temporal avisa «Cerrar y perder 25 min» (REQ-001-69). Verificado a mano con el simulador y el viernes a 1,50 USD/h de forma provisional: CA-001-05 («Carlos», PC 05, 1 h, abierta por Ana, cobro en su turno y la PC desbloqueada) y CA-001-10 con una temporal de 10 min a la que 0,75 USD suman 30 min; cerrarla avisa de lo que se pierde.
  - **Decidido por el mantenedor (2026-10-02):** sin pantalla propia ni icono en el raíl: se abren, se amplían y se cierran desde el detalle de la PC en el mapa, como en el diseño.

- [x] **T45: Interrumpidas y restauración**
  - **Cubre:** REQ-001-64, REQ-001-66, REQ-001-67, REQ-001-68, REQ-001-71
  - **Hacer:** vista de sesiones interrumpidas y del respaldo por PC, con el botón Restaurar y la elección de PC.
  - **Verificar:** simular un apagón con la consola del simulador (`apagon N`, T36b) y restaurar (CA-001-06).
  - **Commit:** `feat(panel): muestra y restaura sesiones interrumpidas`
  - **Decidido al implementarla:** pantalla `/interrumpidas` con dos pestañas. «Pendientes»: cada sesión con su PC, la hora del corte, quién la abrió, lo que le quedaba y hasta cuándo se puede restaurar; «Restaurar» propone la PC original si está libre y deja elegir entre las conectadas y sin sesión. «Respaldo por PC»: tabla de REQ-001-64 con el motivo de cierre y el estado de la restauración. El dueño solo consulta. El canal `/panel` pasa a ser una sola conexión para todas las pantallas y lleva el número de pendientes (punto ámbar del raíl); el nodo lo revisa también cada minuto, porque una interrumpida caduca sin evento. Verificado a mano con el simulador: al reiniciar la PC 05 con «Carlos» abierta queda interrumpida con 49 min; restaurarla en la PC 03 la desbloquea con ese tiempo sin cobro (CA-001-06); restaurarla otra vez da «Esta sesión ya fue restaurada por Ana a las 02:02» (CA-001-08); con `apagon 3` la sesión restaurada vuelve a quedar pendiente y el punto reaparece sin recargar.
  - **Decidido por el mantenedor (2026-10-02):** el icono de Interrumpidas lleva un punto ámbar si hay pendientes; el nodo envía cuántas hay por el canal `/panel` al conectar y cuando cambia (commit de `server`/`shared` aparte). La pantalla de ajustes (gracia de latidos y sesiones conservadas) queda fuera de la fase 8.

- [x] **T45a: Servir el panel desde el nodo**
  - **Cubre:** ADR-0011, REQ-001-53
  - **Hacer:** el servidor sirve `apps/panel/dist` con `@fastify/static` en modo `local` (las rutas de la API y los WebSocket tienen prioridad; cualquier otra ruta devuelve `index.html` para que funcione wouter). Documentar en AGENTS.md cómo compilar y abrir el panel.
  - **Verificar:** test e2e de que `/` devuelve el panel y `/clientes` también; a mano, el panel en `http://127.0.0.1:3000` sin el servidor de Vite.
  - **Commit:** `feat(server): sirve el panel compilado`
  - **Decidido al implementarla:** `@fastify/static` solo da `reply.sendFile`; una ruta comodín de Fastify devuelve el archivo si existe dentro de la carpeta (sin salir de ella) y, si no, `index.html` sin caché a las peticiones de navegador; a las demás, un 404 en JSON como el resto de la API. Lo de `assets/` (con hash) va con caché de un año. `main.ts` busca `apps/panel/dist` junto al paquete del servidor solo en modo `local`; si falta, arranca igual y lo avisa. Verificado: 7 tests e2e y, a mano, el panel en `http://127.0.0.1:3000/clientes` sin Vite, con la sesión, el turno, el mapa en vivo y el aviso de interrumpidas.

## Fase 9: Shell (`apps/shell-ui`)

- [x] **T46: Esqueleto del Shell y pantalla de login**
  - **Cubre:** REQ-001-20, REQ-001-52
  - **Hacer:** Vite + React y cliente del canal PC (en desarrollo, WebSocket directo; con la spec 003 pasará por el host). Pantalla de bloqueo con login y mensajes de error en español.
  - **Verificar:** login en el navegador contra el servidor local.
  - **Commit:** `feat(shell-ui): crea el Shell con la pantalla de login`
  - **Nota de diseño:** el cliente del canal va detrás de una interfaz con dos implementaciones: WebSocket directo al nodo (desarrollo) y puente de WebView2 (`chrome.webview.postMessage`, spec 003). Así el paso a la spec 003 no toca las pantallas. En producción, la conexión con el nodo la mantiene el agente, no el Shell (REQ-003-63).
  - **Decidido al implementarla:** interfaz `PcChannel` (`start`, `stop`, `send` de `login`, `logout` y `buyCombo`); de momento solo existe la implementación de desarrollo, `DevSocketChannel`, que hace de agente (`hello`, latido cada 10 s con el restante local, reintentos de 1 a 30 s). La PC de ejemplo se elige con `?pc=N`. El login lleva `requestId`: entra con el primer `state` activo y falla con el `error` de ese `requestId`, sin respuesta en 15 s o si se corta la conexión. Los motivos del rechazo son los textos del nodo; el Shell solo pone los suyos para fallos del canal. Sin router (dos pantallas según el `state`). La tarjeta de la tarifa y el enlace "Usuario técnico" del diseño quedan fuera: el protocolo no manda la tarifa con la PC bloqueada y el modo técnico es la spec 003. Hasta T47, la sesión abierta solo muestra quién la usa. Verificado a mano en Chrome contra PostgreSQL real: contraseña equivocada (mensaje del nodo, se vacía la contraseña), login correcto (pasa a la sesión), recarga como reinicio de la PC (el nodo cierra la sesión y vuelve el bloqueo) y nodo parado (aviso, campos desactivados y reconexión sola al volver).

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
