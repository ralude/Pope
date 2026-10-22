# Guía de implementación T33–T42 (spec 003)

- **Fecha:** 2026-10-22. Preparada para que un agente (p. ej. Claude Sonnet con esfuerzo medio)
  implemente **una subtarea por commit** sin tener que diseñar nada.
- **Autorización:** T28–T42 autorizadas por el mantenedor (2026-10-21). Las decisiones de esta
  guía las tomó el mantenedor el 2026-10-22 o se derivan del [plan](plan.md) y de la
  [spec](spec.md). El diseño de T34 está en [diseno-t34.md](diseno-t34.md) (aprobado).
- Cada subtarea tiene su casilla en [tasks.md](tasks.md). Márcala `[x]` y actualiza
  `ESTADO.md` **en el mismo commit**.

## 0. Cómo trabajar con esta guía

1. Lee completos `AGENTS.md` y `ESTADO.md`. Después lee **solo** la sección de tu subtarea y la
   sección 1 (mapa del código).
2. Haz exactamente lo que dice la subtarea. Si algo no encaja con el código real (un nombre
   cambió, un test existente contradice la guía, falta una pieza), **para y pregunta** al
   mantenedor; anótalo antes en «Preguntas abiertas» de la spec. No improvises contratos.
3. Antes de cada commit, en los paquetes tocados:
   `pnpm --filter <paquete> lint`, `typecheck` y `test` (y `@pope/native` con
   `pnpm --filter @pope/native test` y `lint` si tocas C#). Si cambias `@pope/shared`, pasa
   también los tests de `@pope/server` y `@pope/panel`, que lo usan.
4. Al cerrar la **tarea principal** (todas sus subtareas), la batería completa desde la raíz:
   `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Anota el total de
   tests en la bitácora de `ESTADO.md`.
5. Commits en español, Conventional Commits, < 400 líneas, cuerpo con el porqué y
   `Spec: 003 · REQ-… (Txxy)`. Un commit = una subtarea.
6. Textos de interfaz y comentarios en español; identificadores en inglés.
7. Nunca registres contraseñas, códigos de instalación ni credenciales (ni en `console.log`, ni
   en el `Logger`, ni en eventos).

### Orden de ejecución

`T33 → T35 → T36 → T39 → T40 → T38 → T41 → T42 → T34`

- **T37 está bloqueada** hasta demostrar T10 (no la empieces).
- **T38 y T40** quedan abiertas tras sus subtareas: les falta la parte que depende del
  mecanismo de T37. Marca las subtareas, no la tarea principal.
- **T30b** se hace dentro de T39 (subtarea T39c).

## 1. Mapa del código (patrones que hay que copiar)

| Necesitas… | Mira / usa |
|---|---|
| Cambiar estado con evento | `EventsService.inTransaction(async (tx, emit) => …)` (`apps/server/src/events/events.service.ts`). Nunca insertes en `events` a mano |
| Bloquear la PC antes de decidir | `PcControlService.lockPc(tx, pcId)` y `contextIn(tx, pcId)` (`apps/server/src/sessions/pc-control.service.ts`) |
| Guardar/enviar una orden a la PC | `PcCommandsService.insertIn(...)` y, tras el commit, `dispatch(row)` (`pc-commands.service.ts`) |
| Peticiones del panel de órdenes | `PcCommandRequestsService.issue` (`pc-command-requests.service.ts`) y `PcCommandsController` |
| Mensajes que llegan de la PC | `PcProtocolService.dispatch` (`pc-protocol.service.ts`), `switch (message.type)` |
| Errores HTTP de órdenes | `PcCommandException(code, message, status)` con `pcCommandErrorSchema` |
| Roles | `@Roles('encargado', 'administrador')`; el dueño es `'dueno'` (sin tilde). Actor: `@CurrentStaff()` |
| Validar cuerpos | `new ZodValidationPipe(esquema)` con esquemas de `@pope/shared` |
| Eventos nuevos | `packages/shared/src/events.ts`: crea el esquema con `event(type, version, payload)` y añádelo a `domainEventSchema` (hacia la línea 912) |
| Migración | Cambia `apps/server/src/db/schema.ts` y ejecuta `pnpm --filter @pope/server db:generate`. Nunca edites una migración ya subida |
| Contrato exportado a C# | Si cambias esquemas del protocolo nativo, `pnpm --filter @pope/shared protocol:update` regenera `packages/shared/protocol/v2/` |
| Tests e2e con PCs | `PcWorld.start(MONDAY)`, `loginAsStaff(world.testApp, 'ana', 'encargado', 'Ana')`, `world.api('POST', ruta, cookie, cuerpo)`, `devPcId(n)`. Modelo: `apps/server/src/sessions/pc-messages.e2e.test.ts` y `pc-commands.e2e.test.ts` |
| Login con bloqueo por intentos | Copia el patrón de `apps/server/src/customers/customer-auth.service.ts` |
| Contraseñas | `PasswordService.verify(hash, password)`; con usuario inexistente se verifica igualmente un hash ficticio (ver `AuthService.getDummyHash`) |
| Canal en vivo del panel | `apps/server/src/sessions/panel-hub.ts` y `panelMessageSchema` en `packages/shared/src/pc-map.ts` |
| Mapa del panel | `PcMapService` (`pc-map.service.ts`), `pcMapItemSchema`; en el panel `apps/panel/src/map/model.ts` y `pages/MapPage.tsx` |
| Llamadas del panel | `ApiClient` (`apps/panel/src/api/client.ts`): `get/post/put` con esquema de respuesta. Tests con `fetch` falso (`client.test.ts`) |
| Diálogos del panel | `apps/panel/src/ui/Dialog.tsx` |
| Canal del Shell | `PcChannel` y `ShellRequest` (`apps/shell-ui/src/channel/channel.ts`) |
| Diario nativo protegido | `PowerJournal.cs`, `AgentPower.cs` y `AgentCustody.StorePowerJournal/ReadPowerJournal` (T31) |
| Órdenes en el agente | `AgentCommands.cs` (`HandleAsync`, `Answer`, `Failed`) y sus tests `AgentCommandsTests.cs` |

## 2. Decisiones ya tomadas (no las vuelvas a preguntar)

- **D1 · Aviso de Wake-on-LAN:** se queda hasta que la PC conecta o alguien vuelve a pulsar
  Encender (que reinicia los 2 min). Se guarda en el nodo. (Mantenedor, 2026-10-22.)
- **D2 · Códigos de instalación en el panel:** botón «Añadir PC» en la barra del mapa y
  «Volver a registrar» en el detalle de una PC libre. El código se ve en un diálogo con cuenta
  atrás y no se guarda. (Mantenedor, 2026-10-22.)
- **D3 · «Bloquear» pide confirmación siempre**, también con la PC libre. Reiniciar y apagar
  piden confirmación solo con sesión o mantenimiento, como dice REQ-003-20. (Mantenedor,
  2026-10-22.)
- **D4 · Aviso del bloqueo técnico:** se envía a los paneles conectados y a los que se conectan
  mientras dura el bloqueo (1 min). No hay bandeja de avisos guardada.
- **D5 · Inicio del mantenimiento:** el nodo lo registra cuando la PC confirma `applied`, con la
  hora del nodo (no la de la PC). Hasta T37, el agente real responde `invalid_action` y el
  Shell muestra «No se pudo preparar el mantenimiento».
- **D6 · Salida local:** el actor de una salida pulsada en la PC es quien abrió el
  mantenimiento (contrato T02a). Si la salida tiene el `exitId` de una orden `endMaintenance`
  del panel, la salida es del panel y su actor es el de esa orden.
- **D7 · Tras registrar una salida local** el nodo pide un bloqueo de sistema (como tras cerrar
  una sesión, T29), que reserva la PC hasta que el agente confirma.
- **D8 · Wake-on-LAN:** UDP al puerto 9 de `255.255.255.255` por defecto, configurable con
  `POPE_WOL_ADDRESS` y `POPE_WOL_PORT`. Se envían 3 copias separadas 100 ms. Los tests nunca
  envían broadcasts reales.
- **D9 · T34:** ver [diseno-t34.md](diseno-t34.md), aprobado: apps abiertas y audio sin tocar
  durante la retención; el uso sin red no se cobra; no se revoca con mantenimiento u orden en
  curso.

---

## T33 · Wake-on-LAN y aviso de dos minutos

Cubre REQ-003-22, CA-003-06. El nodo envía el paquete mágico; **no** es una orden a la PC.

### T33a · Contrato y migración del encendido

- **Archivos:** `packages/shared/src/pc-wake.ts` (nuevo), `packages/shared/src/index.ts`,
  `packages/shared/src/events.ts`, `apps/server/src/db/schema.ts`, migración generada, test de
  esquema `apps/server/src/pcs/pc-wake-schema.test.ts` (nuevo, modelo:
  `pc-control-schema.test.ts`).
- **Contrato** (`pc-wake.ts`):
  ```ts
  export const PC_WAKE_TIMEOUT_SECONDS = 120;
  export const pcWakeRequestSchema = z.strictObject({ id: idSchema });
  export const pcWakeSchema = z.strictObject({
    requestId: idSchema,
    requestedAt: utcInstantSchema,
    /** requestedAt + 120 s: a partir de aquí el panel avisa (REQ-003-22). */
    deadline: utcInstantSchema,
  });
  export const pcWakeResponseSchema = z.strictObject({ pcId: idSchema, wake: pcWakeSchema });
  export const pcWakeErrorSchema = z.strictObject({
    code: z.enum(['unknown_pc', 'pc_connected', 'mac_unknown', 'idempotency_conflict', 'wake_failed']),
    message: z.string().min(1),
  });
  ```
- **Evento:** `pc.wake_requested` v1, actor del personal (`.extend({ actor: actorSchema.options[1] })`),
  payload `{ requestId, pc: pcRefSchema, macAddress: pcMacAddressSchema, deadline }`. Añádelo a
  `domainEventSchema`.
- **Base de datos:** en `pcControlStates` dos columnas nulas `wakeRequestId: uuid('wake_request_id')`
  y `wakeRequestedAt: timestamp('wake_requested_at', { withTimezone: true })`, con un `check`
  «las dos nulas o las dos no nulas». Genera la migración.
- **Tests:** el esquema acepta/rechaza (MAC en el evento, `deadline`); el check de la tabla
  rechaza una columna sin la otra (PGlite).
- **Commit:** `feat(shared): define el encendido por Wake-on-LAN` (incluye la migración; si
  supera 400 líneas, separa `feat(server): guarda la petición de encendido`).
- **No hagas:** endpoint, envío UDP ni cambios del mapa (van en T33b/T33c).

### T33b · Envío del paquete mágico

- **Archivos:** `apps/server/src/config.ts`, `apps/server/src/sessions/wake-on-lan.ts` (nuevo),
  `wake-on-lan.test.ts` (nuevo), `sessions.module.ts`, `apps/server/src/testing/app.ts`,
  `apps/server/src/testing/wake.ts` (nuevo), `AGENTS.md` (sección Servidor, una línea con las
  dos variables).
- **Configuración:** `POPE_WOL_ADDRESS: z.ipv4().default('255.255.255.255')`,
  `POPE_WOL_PORT: z.coerce.number().int().min(1).max(65_535).default(9)`. En `AppConfig`:
  `wakeOnLan: { address: string; port: number }`.
- **Código:**
  ```ts
  /** 6 bytes 0xFF y la MAC 16 veces: 102 bytes (REQ-003-22). MAC canónica AA:BB:CC:DD:EE:FF. */
  export function magicPacket(mac: string): Buffer
  export const WAKE_PACKET_COPIES = 3;
  export const WAKE_PACKET_GAP_MS = 100;
  @Injectable()
  export class WakeOnLanSender {
    constructor(@Inject(APP_CONFIG) config: AppConfig) {}
    /** Envía las copias por UDP con broadcast y cierra el socket. Lanza si falla. */
    async send(mac: string): Promise<void>
  }
  ```
  Usa `node:dgram`: `createSocket('udp4')`, `bind()`, después `setBroadcast(true)`, tres
  `send` con 100 ms entre ellas y `close()`. Envuelve los callbacks en promesas.
  `magicPacket` valida con `pcMacAddressSchema` y lanza si la MAC no es canónica.
- **Tests sin red real:** `createTestApp` sustituye siempre `WakeOnLanSender` por
  `RecordingWakeSender` (`testing/wake.ts`), con `sent: string[]` y `fail: boolean`. Exponlo
  en `TestApp` como `wake`. Así ningún test envía broadcasts a la LAN.
- **Tests:** (1) `magicPacket('AA:BB:CC:DD:EE:FF')` mide 102 bytes, empieza por seis `0xff` y
  repite la MAC 16 veces; (2) MAC no canónica lanza; (3) **captura local**: un socket UDP
  receptor en `127.0.0.1:0`, un `WakeOnLanSender` configurado con `127.0.0.1` y ese puerto, y
  se reciben 3 paquetes idénticos al esperado. Nombres con `REQ-003-22`.
- **Commit:** `feat(server): envía el paquete mágico de Wake-on-LAN`.

### T33c · Endpoint, aviso y mapa

- **Archivos:** `apps/server/src/sessions/pc-wake.service.ts` (nuevo),
  `pc-commands.controller.ts`, `pc-protocol.service.ts` (`hello`), `pc-map.service.ts`,
  `packages/shared/src/pc-map.ts`, `pc-wake.e2e.test.ts` (nuevo), fixtures del panel que
  construyen `PcMapItem` (`apps/panel/src/map/*.test.ts`).
- **Ruta:** `POST /pcs/:pcId/wake`, `@HttpCode(200)`, `@Roles('encargado', 'administrador')`,
  cuerpo `pcWakeRequestSchema`, respuesta `pcWakeResponseSchema`. Errores con una
  `PcWakeException` como `PcCommandException`, usando `pcWakeErrorSchema`.
- **`PcWakeService.wake(pcId, request, actor)`**, todo en un `inTransaction`:
  1. `lockPc` → si no existe, `unknown_pc` 404. Llama a `contextIn` (crea la fila de control).
  2. Si la fila de control ya tiene `wakeRequestId === request.id` → devuelve esa petición sin
     reenviar (doble clic).
  3. Si otra PC tiene ese `wakeRequestId` → `idempotency_conflict` 409.
  4. Si `connections.isConnected(pcId)` → `pc_connected` 409: «La PC 07 ya está encendida y
     conectada».
  5. Si `pcs.macAddress` es nula → `mac_unknown` 409: «La PC 07 no tiene registrada su tarjeta
     de red».
  6. `await sender.send(mac)`; si lanza → `wake_failed` 500: «No se pudo enviar el paquete de
     encendido» (la transacción se deshace).
  7. Guarda `wakeRequestId`/`wakeRequestedAt = clock.now()`, emite `pc.wake_requested` y
     devuelve `{ pcId, wake: { requestId, requestedAt, deadline } }`.
- **`PcWakeService.connected(pcId)`:** pone las dos columnas a `null` si no lo estaban. Llámalo
  en `PcProtocolService.hello` justo después de `this.connections.register(...)`. No emite
  evento: la conexión de una PC no es un evento de dominio.
- **Mapa:** `pcMapItemSchema` gana `wake: pcWakeSchema.nullable()`. `PcMapService` lo rellena
  desde `pcControlStates` (`deadline = requestedAt + 120 s`). El panel calcula «Encendiendo…»
  o «No se conectó» con su propio reloj (no hay temporizador en el nodo). El `PanelHub` ya
  reenvía el mapa al llegar el evento y al conectar la PC.
- **Tests e2e (REQ-003-22, CA-003-06):** PC desconectada con MAC → 200, `testApp.wake.sent`
  tiene la MAC, evento con actor Ana, mapa con `wake`; mismo `id` otra vez → no reenvía; otro
  `id` → reenvía y cambia `requestedAt`; PC conectada → `pc_connected`; sin MAC →
  `mac_unknown`; dueño → 403; sin sesión → 401; `fail = true` → `wake_failed` y sin evento; al
  conectar la PC (`hello`) el mapa queda con `wake: null`; una PC que conecta pasados los 2 min
  también lo limpia (llegada tardía).
- **Commit:** `feat(server): enciende PCs por Wake-on-LAN`. Al terminar T33c, marca T33 y pasa
  la batería completa. El encendido físico queda para T58.
- **No hagas:** confirmar el arranque por haber enviado el UDP ni diagnosticar averías.

---

## T35 · Autorización técnica local y remota

Cubre REQ-003-40, REQ-003-41, REQ-003-43. Solo el **nodo**: la apertura real de Windows es T37.

### T35a · Validar al personal para el login técnico

- **Archivos:** `apps/server/src/auth/technical-auth.service.ts` (nuevo),
  `technical-auth.service.test.ts` (nuevo), `auth.module.ts` (provider y export).
- **Código:**
  ```ts
  export type TechnicalAuthResult =
    | { ok: true; staff: StaffProfile }
    | { ok: false; reason: 'invalid_credentials' | 'staff_inactive' | 'forbidden' };
  @Injectable()
  export class TechnicalAuthService {
    /** No crea sesión ni cookie del panel (REQ-003-40). */
    async verify(username: string, password: string): Promise<TechnicalAuthResult>
  }
  ```
  Orden: buscar con `sameUsername`; verificar la contraseña siempre (hash ficticio si no
  existe); si no existe o no coincide → `invalid_credentials`; si coincide pero
  `active = false` → `staff_inactive`; si coincide y el rol es `'dueno'` → `forbidden`; si no,
  `ok`.
- **Tests:** encargado y administrador `ok`; dueño `forbidden`; inactivo `staff_inactive`;
  contraseña mala e inexistente `invalid_credentials`; no crea filas en `staff_sessions`.
- **Commit:** `feat(server): valida el login técnico del personal`.

### T35b · Registrar el inicio del mantenimiento y abrirlo desde el panel

- **Archivos:** `apps/server/src/sessions/pc-maintenance.service.ts` (nuevo),
  `pc-commands.service.ts`, `pc-command-requests.service.ts`, `pc-protocol.service.ts`,
  `sessions.module.ts`, `pc-maintenance.e2e.test.ts` (nuevo).
- **`PcMaintenanceService`** (no depende de `PcCommandsService`, para no crear un ciclo):
  - `current(pcId, db)`: mantenimiento abierto como `PcMaintenance` o `null`.
  - `startIn(tx, emit, row: CommandRow, now: Date)`: inserta en `pcMaintenances`
    `{ id: action.maintenanceId, pcId, pcName, actor: row.actor, source: action.source, startedAt: now }`
    y emite `pc.maintenance_started` con actor `row.actor`.
  - `remember(commandId, requestId)` / `take(commandId)`: mapa en memoria de las entradas
    locales, para responder al Shell (T35c).
- **Panel (`PcCommandRequestsService.issue`):** deja de rechazar `startMaintenance`. Con la PC
  libre: `action = { kind: 'startMaintenance', maintenanceId: newId(), source: 'panel' }`,
  reserva la PC (como un bloqueo) y despacha. `endMaintenance` y el contexto `maintenance`
  siguen rechazados hasta T39.
- **Acuse (`PcCommandsService.acknowledge`, dentro de la misma transacción):** si el acuse es
  `applied` de un `startMaintenance`, llama a `maintenance.startIn(tx, emit, row, now)`.
  Devuelve, además del bloqueo actual, una lista de mensajes para enviar a la PC tras el commit:
  - `applied` → `{ type: 'maintenanceState', maintenance, requestId? }` (con el `requestId`
    de `take(row.id)` si lo hay);
  - `failed` de un `startMaintenance` con `requestId` recordado →
    `{ type: 'technicalError', requestId, code: 'maintenance_unavailable', message: 'No se pudo preparar el mantenimiento en esta PC' }`.
  En `expire` haz lo mismo para un `startMaintenance` vencido.
- **`hello`:** tras enviar `stateFor`, envía siempre `{ type: 'maintenanceState', maintenance: await maintenance.current(pc.id) }`.
- **Tests e2e (REQ-003-43, CA-003-07):** la orden del panel llega a la PC falsa con
  `maintenanceId` y `source: 'panel'`; `accepted` + `applied` → fila abierta, evento con actor
  Ana y `source: 'panel'`, `maintenanceState` en la PC, contexto `maintenance`, reserva libre,
  login de cliente rechazado (`pc_unavailable`), mensaje rechazado (`stale_context` o
  `invalid_command`); `failed` (`invalid_action`) → sin fila ni evento de inicio y reserva
  libre; vencida → igual; con sesión → `stale_context` (el esquema exige contexto libre);
  dueño → 403. `hello` envía `maintenanceState` nulo o abierto.
- **Commit:** `feat(server): autoriza el mantenimiento de PCs desde el panel`.

### T35c · Login técnico local desde la PC

- **Archivos:** `apps/server/src/sessions/technical-login.service.ts` (nuevo),
  `pc-protocol.service.ts`, `sessions.module.ts`, `technical-login.e2e.test.ts` (nuevo).
- **`TechnicalLoginService.login(pc, message): Promise<NodeToPcMessage | null>`:**
  1. Comprobación previa **antes de la contraseña** (así un intento en una PC ocupada no cuenta
     en T36): con `control.current(pc.id)` y la reserva. Si hay sesión →
     `technicalError pc_unavailable` «Cierra antes la sesión del cliente»; si hay mantenimiento
     → «La PC ya está en mantenimiento»; si hay una orden en curso → «La PC tiene una orden del
     encargado en curso».
  2. `technicalAuth.verify(username, password)`; si falla, `technicalError` con el código:
     `invalid_credentials` «Usuario o contraseña incorrectos», `staff_inactive` «Tu usuario
     está desactivado», `forbidden` «Solo el encargado o el administrador pueden entrar en
     mantenimiento».
  3. `inTransaction`: `lockPc`, `contextIn`, repite la comprobación 1 (carreras con un login de
     cliente) y guarda con `commands.insertIn` la orden
     `{ kind: 'startMaintenance', maintenanceId: newId(), source: 'local' }`, con actor
     `{ kind: 'staff', staffId, name: displayName }` y la petición sintética
     `{ id: newId(), kind: 'startMaintenance', expected: context }`.
  4. Tras el commit: `maintenance.remember(row.id, message.requestId)`, `commands.dispatch(row)`
     y devuelve `null` (la respuesta llega con el acuse, T35b).
- **`PcProtocolService.dispatch`:** `case 'technicalLogin'`: responde con lo que devuelva
  `login` si no es `null`. Nunca registres el mensaje.
- **Tests e2e (REQ-003-40):** login correcto → orden `startMaintenance` local en la PC falsa;
  `applied` → `maintenanceState` con el mismo `requestId` y evento con el técnico como actor;
  `failed` → `technicalError maintenance_unavailable` con ese `requestId` y sin mantenimiento;
  sesión activa y pausada → `pc_unavailable` sin verificar contraseña; dueño, inactivo y
  contraseña mala; dos logins técnicos simultáneos en la misma PC → solo una orden; login de
  cliente mientras la orden está en curso → `pc_unavailable`.
- **Commit:** `feat(server): autoriza el mantenimiento desde el login técnico`. Marca T35 y
  pasa la batería completa.

---

## T36 · Diez fallos técnicos y aviso al panel

Cubre REQ-003-45, CA-003-10.

### T36a · Contador por cuenta y bloqueo de 60 s

- **Archivos:** `technical-auth.service.ts` y su test, `technical-login.service.ts`,
  `technical-login.e2e.test.ts`.
- **Cambio de firma:** `verify(username, password, pc: PcIdentity)` y nuevo resultado
  `{ ok: false; reason: 'locked'; lockedUntil: Date }`.
- **Reglas** (en un `inTransaction`, copiando `customer-auth.service.ts`):
  1. Usuario inexistente → hash ficticio e `invalid_credentials`, sin contador.
  2. Asegura la fila: `insert … onConflictDoNothing()` en `staffTechnicalLoginAttempts` y
     después `select … for update` (serializa los intentos simultáneos).
  3. Bloqueo vigente (`lockedUntil > now`) → `locked` **sin verificar la contraseña**.
  4. Bloqueo vencido → pon `failedLogins = 0`, `lockedAt/lockedUntil = null` antes de seguir.
  5. Contraseña mala → `failedLogins + 1`. Si llega a 10: `lockedAt = now`,
     `lockedUntil = now + 60 s`, emite `staff.technical_login_locked`
     `{ staffId, username, pc, lockedUntil }` con actor `{ kind: 'system' }` y devuelve
     `locked`. Si no, `invalid_credentials`.
  6. Contraseña buena → reinicia a 0 si hacía falta y sigue con inactivo/dueño/`ok`.
  - Constantes: `TECHNICAL_LOGIN_MAX_FAILURES` y `TECHNICAL_LOGIN_LOCK_SECONDS` de shared.
- **Respuesta al Shell:** `technicalError` `technical_login_locked`, con `lockedUntil` y el
  mensaje «Demasiados intentos fallidos. Prueba de nuevo en 1 min».
- **Tests (REQ-003-45, CA-003-10):** 9 fallos + acierto → contador a 0; 10 fallos repartidos
  en dos PCs → bloqueo y **un** evento; bloqueado con la contraseña buena → `locked`; a los
  60 s (reloj de pruebas) vuelve a admitir y el contador empieza de 0; décimo fallo simultáneo
  (`Promise.all`) → un solo evento; el bloqueo sigue en la base de datos tras crear otra app
  con la misma base; el login del panel (`POST /auth/login`) sigue funcionando bloqueado.
- **Commit:** `feat(server): limita los intentos del login técnico`.

### T36b · Aviso al panel

- **Archivos:** `packages/shared/src/pc-map.ts` (`panelMessageSchema`), `panel-hub.ts`,
  `panel-hub.test.ts`.
- **Mensaje nuevo:**
  ```ts
  z.object({
    type: z.literal('technicalLoginLocked'),
    staffName: z.string(),
    username: z.string(),
    pc: pcRefSchema,
    lockedUntil: utcInstantSchema,
  })
  ```
- **`PanelHub`:** en la suscripción a eventos, por cada `staff.technical_login_locked`
  confirmado, envía el mensaje a todos los paneles (busca el `displayName` del personal). En
  `accept`, tras el mapa, envía los bloqueos aún vigentes: eventos de ese tipo con
  `payload.lockedUntil > now` (D4).
- **Tests:** un panel conectado recibe un aviso por bloqueo; uno que se conecta durante el
  minuto también lo recibe; pasado el minuto, no.
- **Commit:** `feat(server): avisa al panel de los bloqueos del login técnico`. Marca T36 y
  pasa la batería completa. La pantalla del aviso es T42b.

---

## T39 · Conciliación de la salida técnica en el nodo

Cubre REQ-003-41, REQ-003-43, REQ-003-44, CA-003-09. Requiere T35.

### T39a · Salida local durable (`maintenanceExit`)

- **Archivos:** `pc-maintenance.service.ts`, `pc-protocol.service.ts`,
  `pc-maintenance-exit.e2e.test.ts` (nuevo).
- **`PcMaintenanceService.endIn(tx, emit, { pcId, exit, now })`** devuelve
  `'recorded' | 'duplicate' | 'unknown'`:
  1. Busca el mantenimiento `exit.maintenanceId` **de esa PC** (`for update`). Si no existe →
     `unknown`.
  2. Si ya está cerrado → `duplicate` (con el mismo `exitId` o con otro: no se reabre ni se
     cambia).
  3. Si hay una orden `endMaintenance` con `action.exitId === exit.id` (busca en `pcCommands`),
     la salida es del panel: `exitSource = 'panel'`, `endedBy = orden.actor`. Si no,
     `exitSource = 'local'`, `endedBy = mantenimiento.actor` (D6).
  4. Plausibilidad: `durationSeconds = min(exit.durationSeconds, floor((now - startedAt) / 1000))`
     y `endedAt = exit.endedAt` acotado entre `startedAt` y `now`.
  5. Actualiza la fila y emite `pc.maintenance_ended` (actor `endedBy`, origen, inicio, fin,
     duración, `exitId`).
- **`dispatch`, `case 'maintenanceExit'`:** `inTransaction` con `lockPc`; `endIn`; si es
  `recorded` y fue local, `commands.insertAfterCloseIn(tx, emit, pc, { kind: 'system' })`
  (D7). Tras el commit: si no es `unknown`, envía
  `{ type: 'maintenanceExitAcknowledged', exitId, maintenanceId }` y despacha el bloqueo. Si
  es `unknown`, aviso en el log sin datos sensibles y sin respuesta.
- **Tests (CA-003-09):** salida local → ACK, fila cerrada, **un** evento con actor y duración,
  bloqueo de sistema pedido, contexto libre al aplicarse, mapa sin mantenimiento; repetida →
  ACK sin evento nuevo; dos iguales a la vez → un evento; mantenimiento de otra PC → sin cambios
  ni ACK; duración mayor que la real → acotada; reconexión: `hello` con
  `pendingMaintenanceExitId` y después la salida → registrada una vez.
- **Commit:** `feat(server): concilia la salida técnica pendiente`.

### T39b · Terminar el mantenimiento desde el panel

- **Archivos:** `pc-command-requests.service.ts`, `pc-commands.service.ts`, e2e.
- **Petición:** `endMaintenance` con contexto `maintenance` →
  `action = { kind: 'endMaintenance', maintenanceId: context.maintenanceId, exitId: newId() }`,
  reserva y despacha.
- **Acuse `applied`** con `effect.exit`: en la misma transacción `maintenance.endIn(...)` (la
  orden existe, así que el origen es `panel` y el actor el de la orden) y, tras el commit,
  `maintenanceExitAcknowledged` a la PC, para que el agente borre su diario (T40).
- **Tests:** orden → `applied` → evento con actor del panel y origen `panel`, reserva libre; el
  acuse se pierde (vence) y la PC envía después `maintenanceExit` con ese `exitId` → se
  registra como del panel; mensaje y bloqueo siguen rechazados en mantenimiento.
- **Commit:** `feat(server): termina el mantenimiento desde el panel`.

### T39c · Reiniciar o apagar durante el mantenimiento (T30b)

- **Archivos:** `pc-command-requests.service.ts`, `pc-commands.service.ts`, `pc-power.e2e.test.ts`.
- **Petición** `restart`/`powerOff` con contexto `maintenance` y `confirmed: true`: guarda una
  orden `endMaintenance` (como T39b) cuya `request` es la petición del panel (así el reintento
  con el mismo ID devuelve esa orden). Sin `confirmed` → `confirmation_required` (ya existe).
- **Acuse `applied` de esa orden:** tras registrar la salida, en la misma transacción guarda la
  orden de energía con la petición sintética `{ id: newId(), kind, expected: contextoLibre }`,
  el mismo actor y la despacha tras el commit. Si la orden de salida falla o vence, no se
  reinicia nada.
- **Tests:** salida + reinicio en orden, eventos de ambos; fallo de la salida → sin reinicio;
  reintento con el mismo ID → misma orden.
- **Commit:** `feat(server): reinicia o apaga tras terminar el mantenimiento`. Marca T30b, T30
  y T39, y pasa la batería completa.

---

## T40 · Salida técnica nativa durable

Cubre REQ-003-41, REQ-003-43, REQ-003-44, CA-003-09. Solo lo independiente de T37: el cierre
real de la sesión de Windows de mantenimiento queda como una función inyectada que T37
implementará. **T40 queda abierta** al terminar T40b.

### T40a · Diario protegido de salidas

- **Archivos:** `apps/native/Pope.Agent/MaintenanceExitJournal.cs` (nuevo), `AgentCustody.cs`,
  `Pope.Native.Tests/MaintenanceExitJournalTests.cs` (nuevo).
- Copia el patrón de `PowerJournal`: entradas `{ ExitId, MaintenanceId, EndedAt, DurationSeconds }`,
  `Serialize`/`Parse` estrictos, como mucho **16** entradas, y
  `AgentCustody.StoreExitJournal/ReadExitJournal` con la misma protección que el de energía.
- **Tests:** ida y vuelta; archivo corrupto rechazado (se registra un código, nunca el
  contenido); más de 16 → `Parse` lo rechaza y `Add` devuelve `false` sin borrar ninguna.
- **Commit:** `feat(native): guarda las salidas técnicas en un diario protegido`.

### T40b · Terminar y bloquear sin red

- **Archivos:** `Pope.Agent/AgentMaintenance.cs` (nuevo), `AgentRuntime.cs`,
  `AgentHostBridge.cs`, `AgentCommands.cs`, `AgentState.cs`, `AgentLog.cs`,
  `Pope.Native.Tests/AgentMaintenanceTests.cs` (nuevo).
- **`AgentMaintenance`** (constructor con el diario leído, la función de guardar, el `send` del
  canal y `Func<CancellationToken, Task<bool>> closeSession`, que hoy devuelve `true` con el
  comentario «T37 cierra aquí la sesión de Windows de mantenimiento»):
  - `maintenanceState` del nodo: guarda `{ id, startedAt }` y una marca monotónica
    (`Stopwatch.GetTimestamp()`); con `null`, lo olvida. Una desconexión **no** termina el
    mantenimiento ni bloquea (REQ-003-44).
  - **Terminar** (petición de puente `endMaintenance` del host, o la orden `endMaintenance` del
    nodo): (1) `closeSession`; (2) bloqueo local, por el mismo camino que la orden `lock` de
    `AgentCommands`; (3) crea la salida con `ExitId` nuevo (UUIDv7; en la orden se usa el
    `exitId` de la orden), `EndedAt` = hora del nodo estimada (`state.Control().NodeNow`, o la
    UTC de Windows si no la hay) y la duración monotónica; (4) **la guarda en el diario antes
    de enviarla**; (5) envía `maintenanceExit` (local) o el acuse `applied` con `effect.exit`
    (orden); (6) olvida el mantenimiento.
  - `maintenanceExitAcknowledged` → borra esa entrada del diario.
  - Tras conectar: `hello` lleva `pendingMaintenanceExitId` (la primera pendiente) y después
    se reenvían todas las pendientes, una por mensaje.
  - `startMaintenance` sigue respondiendo `invalid_action` hasta T37.
- **Tests (sin red real, con canal falso):** terminar sin conexión → bloqueo y salida en el
  diario; al conectar se envía y el ACK la borra; ACK perdido → se reenvía tras reconectar;
  ACK duplicado → nada; reinicio del agente con salida pendiente → se reenvía; diario lleno →
  no se pierde ninguna entrada; la desconexión no termina el mantenimiento; orden
  `endMaintenance` → acuse `applied` con el `exitId` de la orden.
- **Commit:** `feat(native): conserva la salida del mantenimiento sin red`. **No** marques T40.

---

## T38 · Formulario y pestaña técnica (Shell)

Cubre REQ-003-40, REQ-003-42, REQ-003-43. Diseño de referencia: lienzo «Shell Pope · Fase 9»
(si no tiene el artboard de una pieza, usa los estilos del login de `LockScreen.tsx` y
pregunta antes de inventar un diseño nuevo). **T38 queda abierta** hasta probar la pestaña en
la sesión de mantenimiento real (T37).

### T38a · Acceso «Usuario técnico» en la pantalla de bloqueo

- **Archivos:** `apps/shell-ui/src/channel/channel.ts` (`ShellRequest` admite
  `'technicalLogin' | 'endMaintenance'`), `src/lock/technical.ts` y `technical.test.ts`
  (nuevos), `src/lock/LockScreen.tsx`. Comprueba que `dev-socket.ts` y `webview.ts` no filtran
  esos tipos.
- **Lógica pura** (`technical.ts`): estados `closed | form | sending | preparing` y una función
  que traduce `technicalError` a texto:
  `invalid_credentials` «Usuario o contraseña incorrectos» · `technical_login_locked`
  «Demasiados intentos. Prueba de nuevo a las HH:MM» (hora local de la PC) · `staff_inactive`
  «Tu usuario está desactivado» · `forbidden` «Solo el encargado o el administrador pueden
  entrar» · `pc_unavailable` el mensaje del nodo · `maintenance_unavailable` «No se pudo
  preparar el mantenimiento en esta PC» · `internal_error` «Error del servidor. Inténtalo de
  nuevo». `maintenanceState` con el mismo `requestId` → «Mantenimiento autorizado. Preparando
  Windows…». Sin respuesta en 35 s → «La PC no respondió» y vuelve al formulario.
- **Pantalla:** enlace discreto «Usuario técnico» solo en `LockScreen` (no en pausa ni en
  sesión). Formulario usuario + contraseña, «Entrar» y «Cancelar». Vacía la contraseña al
  enviar; nunca la registres ni la guardes.
- **Tests:** solo de `technical.ts`.
- **Commit:** `feat(shell-ui): añade el acceso del usuario técnico`.

### T38b · Pestaña «Técnico» plegada

- **Archivos:** `src/maintenance/maintenance.ts`, `maintenance.test.ts` y `TechnicalTab.tsx`
  (nuevos), `src/App.tsx` (o donde se elige la pantalla).
- Se muestra mientras el último `maintenanceState` tenga mantenimiento. Pestaña pequeña
  centrada arriba con el texto «Técnico»; al pasar el ratón o con el foco se despliega con la
  PC, quién entró y el botón «Terminar y bloquear», que envía
  `{ type: 'endMaintenance', requestId: newId(), maintenanceId }`. **Sin tiempo transcurrido**
  (REQ-003-42). No tapa barras de título: alto plegado de unos 28 px.
- **Tests:** solo de `maintenance.ts` (cuándo se muestra y qué petición crea).
- **Commit:** `feat(shell-ui): muestra la pestaña del técnico`. **No** marques T38.

---

## T41 · Controles y mantenimiento en el mapa (panel)

Cubre REQ-003-20, REQ-003-21, REQ-003-22, REQ-003-43, CA-003-07. Requiere T33, T35 y T39.

### T41a · Datos del mapa y consulta de una orden

- **Archivos:** `packages/shared/src/pc-map.ts`, `pc-map.service.ts`, `pc-commands.controller.ts`,
  `pc-commands.service.ts`, e2e del mapa y de órdenes, fixtures del panel.
- `pcMapItemSchema` gana:
  - `maintenance: z.strictObject({ id, actorName: z.string(), source: maintenanceSourceSchema, startedAt }).nullable()`;
  - `canWake: z.boolean()` (MAC registrada);
  - `order: z.strictObject({ id, kind: pcCommandKindSchema, status: pcCommandStatusSchema }).nullable()`
    (la orden que reserva la PC, si sigue en curso).
- Ruta nueva `GET /pcs/:pcId/commands/:commandId` → `pcCommandResponseSchema` (cualquier
  personal; 404 `unknown_pc` si no es de esa PC).
- **Commit:** `feat(server): muestra mantenimientos y órdenes en el mapa`.

### T41b · Lógica de los controles

- **Archivos:** `apps/panel/src/map/controls.ts` y `controls.test.ts` (nuevos).
- `availableActions(item, role, now)` devuelve cada acción con `enabled` y, si no, el motivo:
  - dueño: todo desactivado, «Solo lectura»;
  - desconectada: solo «Encender» (desactivado sin MAC: «Sin tarjeta de red registrada»);
  - libre: Bloquear, Enviar mensaje, Reiniciar, Apagar, Iniciar como administrador;
  - con sesión (cuenta, temporal o pausa): Bloquear, Enviar mensaje, Reiniciar, Apagar;
  - en mantenimiento: Terminar mantenimiento, Reiniciar, Apagar;
  - con `order` en curso: todo desactivado salvo Enviar mensaje, «Orden en curso».
- `confirmation(action, item, now)`: Bloquear **siempre** (D3): libre «¿Bloquear la PC 04?»;
  con cuenta «Se cerrará la sesión de juan y la PC 04 quedará bloqueada»; temporal añade «Se
  perderán N min de la sesión temporal». Reiniciar/Apagar con sesión «Se cerrará la sesión de
  … y después se reiniciará/apagará»; en mantenimiento «Se terminará el mantenimiento de … y
  después …»; libre sin confirmación.
- `commandErrorMessage(code)` para `pcCommandErrorSchema` y `pcWakeErrorSchema`.
- `wakeStatus(item, now)`: `null`, `{ kind: 'starting', secondsLeft }` o `{ kind: 'overdue' }`.
- Funciones de `ApiClient`: `getControl`, `issueCommand`, `getCommand`, `wake`.
- **Tests:** todas las ramas anteriores y las llamadas con `fetch` falso.
- **Commit:** `feat(panel): prepara la lógica de los controles de PC`.

### T41c · Pantalla

- **Archivos:** `pages/MapPage.tsx` (sustituye `PcControls`), `map/model.ts` (nuevo
  `TileKind` `'maintenance'`, rojo `--red`, y fila en la leyenda «Mantenimiento»),
  `map/map.css`.
- Al pulsar: pide `getControl` para tener el `expected` vigente, confirma si toca, y envía
  con un `id = newId()` que se conserva para reintentos y doble clic. Sigue el resultado con
  `getCommand` cada segundo hasta `applied`/`failed`/`expired` (o `accepted` en reiniciar y
  apagar: «Windows aceptó reiniciar»; nunca «apagada»). Mensaje: diálogo con área de texto y
  contador hasta 1 000 caracteres; tras enviarlo, «Mensaje enviado».
- Baldosa roja «Mantenimiento · Luis»; detalle con «En mantenimiento por Luis desde HH:MM
  (panel/local)». Aviso de encendido en baldosa y detalle: «Encendiendo… (m:ss)» y, pasados 2
  min, «No se conectó en 2 min. Puede seguir arrancando o no tener Wake-on-LAN activo».
- **Comprobación manual** (anótala en `mediciones.md`): con el nodo y el simulador, cada botón
  según el estado, dueño en solo lectura, doble clic, cambio de estado entre abrir y confirmar
  (`stale_context`), PC desconectada. El simulador no acusa órdenes: verás `expired`, que es
  correcto.
- **Commit:** `feat(panel): controla las PCs y muestra el mantenimiento`. Marca T41 y pasa la
  batería completa.

---

## T42 · Registro de PCs y alertas técnicas (panel)

Cubre REQ-003-10, REQ-003-45, CA-003-11. Requiere T36.

### T42a · Códigos de instalación

- **Archivos:** `apps/panel/src/map/installation.ts` y `installation.test.ts` (nuevos),
  `map/InstallationCodeDialog.tsx` (nuevo), `pages/MapPage.tsx`.
- «Añadir PC» en la barra del mapa y «Volver a registrar» en el detalle de una PC libre y sin
  mantenimiento (D2); solo encargado y administrador. `POST /pcs/installation-codes` con `{}` o
  `{ pcId }` (`pcInstallationCodeRequestSchema`/`ResponseSchema`).
- Diálogo: código grande en monoespaciada, «Copiar», «Caduca en m:ss» y, al caducar, «El
  código caducó» con «Generar otro». Instrucción: «Escríbelo en el asistente de instalación de
  la PC». El código solo vive en el estado del diálogo: nada de `localStorage` ni registros.
- **Tests:** cuenta atrás y caducidad; llamada con y sin `pcId`.
- **Commit:** `feat(panel): genera códigos para registrar PCs`.

### T42b · Aviso de bloqueo técnico

- **Archivos:** `apps/panel/src/map/channel.ts` y su test, un componente de aviso nuevo en
  `src/ui/` (no hay ninguno de avisos), el marco donde se muestre (`ui/Frame.tsx`).
- Al recibir `technicalLoginLocked`: aviso visible hasta `lockedUntil` o hasta cerrarlo:
  «Login técnico bloqueado: Luis falló 10 veces en la PC 04. Podrá volver a intentarlo a las
  HH:MM».
- **Tests:** de la lógica del canal (añade, caduca, no duplica el mismo aviso).
- **Commit:** `feat(panel): avisa de los bloqueos del login técnico`. Marca T42 y pasa la
  batería completa.

---

## T34 · Revocación conservando la sesión

Diseño aprobado: [diseno-t34.md](diseno-t34.md). Léelo entero antes de T34a.

### T34a · Contratos

- `packages/shared/src/pc-revocation.ts` (nuevo): `pcRevokeRequestSchema` `{ id }`,
  `pcRevokeResponseSchema` `{ pc, revokedAt, heldSessionId: idSchema.nullable() }`,
  `pcContinueRequestSchema` `{ id, sessionId }`, `pcContinueResponseSchema`
  `{ sessionId, heldSeconds }`, `pcRevocationErrorSchema` con los códigos del diseño.
- Eventos `pc.credential_revoked` y `session.hold_ended` (diseño, sección Eventos).
- `stateMessageSchema` y `nativeStateMessageSchema`: variante
  `{ type: 'state', status: 'held', sessionId, reason: 'credential_revoked' }`. Ejecuta
  `pnpm --filter @pope/shared protocol:update` y revisa los fixtures C#
  (`ProtocolFixtureTests`).
- **Commit:** `feat(shared): define la revocación conservando la sesión`.

### T34b · Tabla `session_holds`

- Tabla y checks del diseño, migración generada y test de esquema.
- **Commit:** `feat(server): guarda las retenciones por revocación`.

### T34c · Revocar

- `POST /pcs/:pcId/revoke` (servicio nuevo `pc-revocation.service.ts`), regla 1 del diseño.
  `PcGateway` cierra la conexión viva al confirmarse `pc.credential_revoked` (copia lo que hace
  con `pc.registered` de recuperación). `SessionsService` deja de vigilar la sesión.
- **Tests:** libre, activa, pausada, temporal, sin red; idempotencia; mantenimiento u orden en
  curso → `pc_unavailable`; roles.
- **Commit:** `feat(server): revoca una PC conservando su sesión`.

### T34d · Sin cobro ni vencimientos durante la retención

- Regla 2 del diseño en `SessionsService` (`checkpoint`, `attend`, `closeStale`, `reconcile`,
  `stateFor`) y `PausesService` (vencimiento, pausar, reanudar, reanudar por el personal).
- **Tests:** avanzar el reloj 20 min con temporizadores y con el proceso de latidos sin que
  cambie el saldo ni se cierre; la pausa no vence; reinicio del nodo con retención abierta.
- **Commit:** `feat(server): detiene el cobro durante la retención`.

### T34e · Revincular con código de recuperación

- Regla 3: `POST /pcs/installation-codes` y `POST /pcs/register` aceptan una PC con retención
  abierta y conservan sesión y retención. Tras el `hello` con la credencial nueva, la PC recibe
  `state: held`. El mapa gana `hold: { since, byName, relinked } | null`.
- **Tests:** credencial anterior rechazada; nueva conecta y sigue retenida; código caducado o
  usado; PC libre sigue con la regla de T12.
- **Commit:** `feat(server): revincula una PC retenida`.

### T34f · Autorizar continuar y cerrar la sesión retenida

- Reglas 4 y 5. `POST /pcs/:pcId/continue`.
- **Tests:** CA-002-09 completo; continuar sin credencial nueva, sin conexión, dos veces; cerrar
  la sesión retenida cobra solo hasta el inicio; roles.
- **Commit:** `feat(server): autoriza continuar una sesión retenida`.

### T34g · Agente y host

- Al recibir `pc_credential_revoked`: detener la cuenta atrás local, guardar la marca
  «retenida» para mantener el bloqueo tras reiniciar, sin cerrar procesos ni silenciar.
  Reintentar la conexión cuando cambie la credencial. `state: held` → bloqueo sin limpieza.
- **Tests:** en `Pope.Native.Tests` (estado, autorización del escritorio, sin limpieza).
- **Commit:** `feat(native): conserva la sesión retenida en la PC`.

### T34h · Pantalla del Shell

- `src/session/HeldScreen.tsx` (nuevo): «PC bloqueada por el encargado. Tu sesión y tu tiempo
  están a salvo», sin botones. Test de la lógica que elige la pantalla.
- **Commit:** `feat(shell-ui): muestra la PC retenida`.

### T34i · Panel

- Detalle: «Revocar PC» (confirmación), estado «Retenida desde HH:MM por Ana», «Código de
  recuperación» (reutiliza el diálogo de T42a con `pcId`) y «Autorizar continuar» (activo
  cuando `relinked` y conectada). Baldosa con su color de sesión y una marca «Retenida».
- **Commit:** `feat(panel): revoca PCs y autoriza continuar`. Marca T34 y pasa la batería
  completa. El asistente que introduce el código en la PC es T51.

---

## T37 · Entrada administrativa nativa (bloqueada)

No empezar: depende de demostrar el mecanismo de T10 (ADR-0018/0029). Cuando se desbloquee,
completará `closeSession` de T40b, la respuesta `applied` a `startMaintenance` y la prueba de
la pestaña de T38b en la sesión real, y cerrará T37, T38 y T40.
