# Plan 003: Arranque y bloqueo de la PC cliente

- **Estado:** Aprobado para T01–T20: T01–T07 (2026-10-04), continuación autónoma T08–T20 (mantenedor, 2026-10-07). T21–T59 y mecanismos aún abiertos siguen pendientes.
- **Spec:** [spec.md](spec.md), aprobada para este bloque; resto pendiente.
- **ADRs que aplican:** ADR-0001, ADR-0002, ADR-0005, ADR-0006, ADR-0007, ADR-0008,
  ADR-0009, ADR-0015 y ADR-0016. ADR-0010 sigue Propuesto y pertenece a la spec 004.
- **ADRs nuevos que propone:** [ADR-0017](../../adr/0017-comunicacion-segura-del-cliente-windows.md),
  comunicación segura, aceptado el 2026-10-04, y [ADR-0018](../../adr/0018-mantenimiento-con-cuenta-windows-existente.md),
  mantenimiento con una cuenta Windows existente. La instalación se documentará en
  ADR antes de construirla si requiere decisiones nuevas.

## Resumen

El servicio `Pope.Agent` mantiene la conexión con el nodo y supervisa al host; el
proceso `Pope.ShellHost` aloja React en WebView2 y usa C# para las APIs de Windows.
El bloqueo y la pausa usan un escritorio Win32 separado, con las aplicaciones del
cliente en el escritorio de uso. El nodo conserva toda decisión de sesión y cobro.

El mantenedor confirmó C#, WebView2, el escritorio separado y la inclusión de la
**fase 2 de la spec 002** el 2026-10-04. Después autorizó Contratos y datos (T01–T07)
y aceptó ADR-0017. Esa aprobación parcial permite preparar contratos y migraciones;
el resto del diseño y ADR-0018 siguen pendientes, con aprobación siguiendo ADR-0013.

**Decidido:** «Bloquear» cierra la sesión; mantenimiento
remoto solo con la PC libre; login técnico local para encargado y administrador,
validado por el nodo; cerrar procesos del cliente sin reiniciar Windows al terminar;
Evergreen con instalador completo sin conexión. Hay 13 PCs (normalmente 12 para clientes)
y se dispone de una PC de pruebas y una VM. **Inventario confirmado por el mantenedor
(2026-10-07):** 12 PCs con Windows 10 Pro 22H2 y una con Windows 11 Pro 25H2, ninguna
con congelador. Compatibilidad, persistencia ante cortes y preguntas técnicas siguen
pendientes de diseño/prueba; no se declara aprobado el resto del plan.

El nodo tendrá IP fija o reserva DHCP, configurada en la instalación. Un mantenimiento
ya autorizado continúa sin red y permite terminar/bloquear localmente; se registra la
salida al reconectar. El mantenedor eligió reutilizar una cuenta administradora Windows
existente; ADR-0018 aceptado el 2026-10-08, pendiente de demostrar el mecanismo en T10.

## Componentes afectados

| Componente | Cambio y requisitos |
|---|---|
| `apps/native/Pope.Agent` | Servicio LocalSystem sin UI: registro, credencial, WebSocket, latidos, copia del estado y supervisión del host (003-02, 10, 11, 32, 63) |
| `apps/native/Pope.ShellHost` | Host sin elevación: WebView2, puente limitado, escritorio de bloqueo, hook, pantalla técnica y audio de pausa (003-01, 03, 30, 33, 42; 002-04, 05, 07) |
| `apps/native` | Solución .NET, tests, publicación autocontenida, instalador reversible y guía Win32 en español (003-50, 51, 60, 62) |
| `packages/shared` | Contratos de registro, órdenes, mantenimiento, fondo y eventos; JSON Schema para C# |
| `apps/server` | Autenticación de PCs, registro/revocación, órdenes con resultado, mantenimiento, Wake-on-LAN y fondo (003-10 a 22, 40, 41, 43, 70 a 75) |
| `apps/panel` | Activar los controles existentes, registro de PCs, mantenimiento rojo, resultados de órdenes y gestión del fondo |
| `apps/shell-ui` | Implementar `PcChannel` mediante WebView2; conservar las pantallas y el canal de desarrollo; login técnico, fondo y mensajes del encargado |
| `tools/agent-sim` | Adaptar autenticación y nuevas órdenes para verificar el nodo sin instalar Pope en Windows |

La gestión del catálogo, la vigilancia general de procesos y la restauración de perfiles
siguen en la **spec 004**. La 003 incluye cerrar los procesos del cliente al terminar
(003-34); limpieza de perfiles y vías de escape deben coordinarse antes de presentar
la instalación como apta para clientes del local. No se inventa una lista
blanca en este plan ni se considera aceptado ADR-0010.

## Modelo de datos

**Propuesta inicial, pendiente de aprobar el plan:** extender el esquema existente,
sin duplicar cuentas, saldo, sesiones, pausas ni las cookies del personal.

| Datos | Diseño propuesto |
|---|---|
| `pcs` | Conservar identidad, nombre y posición; añadir MAC e información necesaria de instalación (003-22, 50) |
| Códigos de instalación | Hash, actor, creación, caducidad de 10 min y consumo atómico de un solo uso; encargado/administrador generan, formato pendiente |
| Credenciales de PC | Hash, PC asociada, creación y revocación; el secreto solo se entrega al registro y lo guarda el agente |
| Órdenes de PC | UUIDv7, PC, tipo, actor, datos, resultado y tiempos; transición y evento en la misma transacción |
| Mantenimiento | PC, actor que lo autorizó, inicio, fin y duración; una entrada abierta por PC |
| Intentos técnicos | Contador de fallos consecutivos y bloqueo por cuenta, independientes del login del panel; 10 fallos → 1 min y un aviso; reset tras login válido o fin del bloqueo |
| Fondo del local | Metadatos y huella del archivo actual en disco bajo `POPE_DATA_DIR`; histórico mediante eventos |

Índices por credencial y código; unicidad de código consumido y mantenimiento abierto.
Fechas UTC, duración en segundos enteros. Las migraciones se generan con Drizzle y se
verifican con PGlite y PostgreSQL real. Cada mutación pasa por
`EventsService.inTransaction`; nunca se escribe directamente en `events`.

El estado físico del escritorio se confirma desde la PC: pedir una orden no demuestra
que Windows la haya aplicado. Separar orden solicitada, confirmada y fallida; conservar
el actor del personal al registrar el resultado.

## Contratos

### T04: persistencia del registro

`pcs.mac_address` nullable preserva PCs previas sin darles autenticación; MAC canónica
unicast no nula, sin unicidad porque no es identidad. Códigos: UUIDv7, SHA-256 único,
personal emisor, UTC de emisión/fin (exactamente 600 s), PC objetivo opcional y pareja
consumo UTC/PC. Consumo antes de caducar, posterior a emisión y ligado al objetivo
si existe. Credenciales: UUIDv7, PC, código consumido único, SHA-256 único, creación
y revocación UTC con personal revocador opcional (el reemplazo también puede revocar).
Una sola credencial vigente por PC; FK compuesta código/PC impide emitirla desde un
código sin consumir o consumido para otra PC. Ningún secreto en claro ni credencial
de respaldo para registros antiguos. Disponibilidad, roles y eventos quedan en T12/T13.
La nueva migración se prueba sobre datos anteriores y con consumo concurrente en
PGlite/PostgreSQL. Un helper de tests permite migrar hasta el estado previo y después
aplicar pendientes en el mismo motor; no modifica migraciones ya subidas.

### T05a: órdenes y reserva persistidas

`pc_commands` conserva el ID de idempotencia, PC, actor del personal, solicitud sin
secretos, contexto esperado y acción cerrada de T02, emisión/caducidad UTC (30 s),
estado y último acuse con fecha. Un resultado solo describe aceptación/efecto/fallo;
no demuestra apagado físico. Los JSON se tipan con shared; su validación y las
transiciones con eventos corresponden a T28, no a esta migración.
`pc_control_states` tiene una fila por PC, revisión UUIDv7 y reserva opcional ligada
por FK compuesta a una orden de esa misma PC. La reserva no vence automáticamente:
la coordinación la libera al confirmar el efecto según T29/T40. No duplica saldo,
sesión ni pausa, ni activa restricciones de login antes de T28. Las filas se crean
al activar la coordinación; el upgrade no inventa estados confirmados de Windows.

### T05b: mantenimiento e intentos técnicos persistidos

`pc_maintenances` guarda solo entradas confirmadas, con PC/nombre copiado, actor del
personal, origen e inicio UTC. Índice parcial: una entrada abierta por PC; salida
completa con UUIDv7 único, fin UTC, segundos monotónicos no negativos, actor y origen.
El fin UTC no determina la duración: la plausibilidad y recuperación de la salida
offline se concilian en T40. Roles, eventos y entrada efectiva quedan en T35–T40.
`staff_technical_login_attempts` separa de las cookies del panel una fila por cuenta:
0–9 fallos sin bloqueo o 10 con inicio/fin UTC separados exactamente por 60 s.
No hay contador por PC ni reset automático de base de datos; T35 aplica el reset tras
éxito o fin del bloqueo y el aviso único en la transacción con su evento. El upgrade
no inventa mantenimientos ni intentos anteriores y no cambia el login del panel.

### T06: metadatos del fondo global persistidos

`lock_screen_background` tiene una sola fila (ID 1), creada por la migración en revisión
0 y con imagen/autoría nulas: fondo por defecto. SHA-256, bytes, tipo WebP y dimensiones
van en columnas opcionales que se rellenan o vacían juntas, con los límites de shared.
La revisión es un entero seguro no negativo; tras cualquier cambio debe ser positiva
y llevar fecha UTC y actor del personal, también al quitar el fondo. No hay bytes,
rutas ni duplicados por PC en PostgreSQL. Validar archivo/hash, autorización del
administrador, incremento de revisión y evento atómico quedan en T43; esta migración
no sube ni descarga imágenes ni añade endpoints o dependencias.

### T07: normalización confirmada para la exportación

El mantenedor elige la opción A (2026-10-07): conservar el `trim` exterior del usuario
de login de cliente/técnico antes de validar, sin transformar la contraseña. La
exportación incluirá, junto a JSON Schema, instrucciones y el conjunto exacto de
caracteres que recorta JavaScript; C# usará ese conjunto explícito para evitar
diferencias con su recorte por defecto. Fixtures compartidos probarán el resultado
y la aceptación/rechazo de ambos validadores, incluidos usuario vacío tras recorte,
64 letras con espacios exteriores y Unicode. No cambia el comportamiento del login.

T07 se divide en exportación/normalización (T07a) y fixtures de compatibilidad (T07b).
Artefactos revisables en `packages/shared/protocol/`, copiados a `dist/json-schema/`
al compilar; el build y los tests detectan diferencias con el contrato versionado.
Ajv 8.20.0 y ajv-formats 3.0.1 son dependencias **solo de desarrollo de shared** para
validar draft 2020-12 de forma independiente de Zod. Ya existen en el lockfile por
Fastify; no añaden dependencias al servidor ni se usan en la lógica de producto.

### Existentes que se reutilizan

`packages/shared/src/protocol.ts` ya define `hello`, latidos, login, cierre, compra,
pausa/reanudación, `state`, avisos y `sessionEnded`. La pausa lleva `billing` y segundos
restantes calculados por el nodo. El host no decide cobrar ni vencer una pausa.
`apps/shell-ui/src/channel/channel.ts` permite cambiar el transporte sin rehacer las
pantallas; solo el agente envía `hello` y latidos.

### Propuestas que se concretarán tras las respuestas

| Frontera | Contrato propuesto |
|---|---|
| Instalador ↔ nodo | Emitir/consumir código, obtener identidad de PC y credencial, registrar MAC y revocar credencial; permisos y plazos explícitos |
| Panel ↔ nodo | Órdenes de PC y consulta de resultado; encargado/administrador operan, dueño solo lee |
| Agente ↔ nodo | Autenticación en la cabecera antes de aceptar el WebSocket, órdenes tipadas con ID y confirmación, estado de mantenimiento y fondo |
| Host ↔ agente | Pipe enmarcado y acotado: solicitudes del Shell, estado/conexión, comprobación de vida y confirmación de acción nativa |
| React ↔ host | JSON tipado por el puente, validación del origen virtual; sin credencial de PC ni ejecución de rutas o comandos libres |
| Fondo | Endpoints de la propuesta de la spec: subir, quitar, consultar y descargar por SHA-256; PC registrada para la descarga |

No se fijan rutas o nombres de eventos nuevos como contratos aprobados todavía.
El diseño final enumerará cuerpos, respuestas, errores, roles, límites y eventos zod.
Las órdenes peligrosas no se repiten ciegamente tras reconectar; el agente conserva
IDs procesados en un registro acotado y comprueba su vigencia y resultado.

La admisión actual por `pcId` no cumple 003-63. Cambiarla exige adaptar tests y simulador
y definir la transición de versión del protocolo; no mantener un acceso sin credencial
en producción para conservar compatibilidad con el canal provisional.

### T01: registro y autenticación confirmados (2026-10-04)

El mantenedor autoriza comenzar **Contratos y datos (T01–T07)** y confirma ADR-0017,
canal v2 y recuperación de registro. No cierra decisiones de mantenimiento, emergencia
o cobro tras revocación; esas decisiones se consultan antes de la tarea que las necesite.

**Base confirmada:** TLS, identidad derivada de una credencial aleatoria exclusiva de
la PC y `Authorization: Bearer <credential>` antes del upgrade WebSocket. La credencial
solo se entrega en la respuesta de registro destinada al instalador/agente; no viaja
en `hello`, URLs, eventos, datos ordinarios de PC o JavaScript del Shell. El nodo guarda
SHA-256, con la custodia y el puente local del ADR-0017.

| Contrato propuesto | Campos y límites |
|---|---|
| `pcInstallationCodeSchema` | 16 bytes aleatorios representados como 22 caracteres base64url sin padding; se copia desde el panel, sensible a mayúsculas |
| `pcCredentialSchema` | 32 bytes aleatorios representados como 43 caracteres base64url sin padding; diferente del código de instalación |
| MAC | `pcMacAddressInputSchema` admite MAC Ethernet unicast no nula con `:`/`-` y minúsculas; `pcMacAddressSchema` exige `AA:BB:CC:DD:EE:FF`. Normalización explícita tras validar, sin transformación oculta en JSON Schema; no autentica |
| `pcInstallationCodeRequestSchema` | `{ pcId?: UUIDv7 }`; vacío para alta nueva, PC existente para recuperación solo libre/sin mantenimiento |
| `pcInstallationCodeResponseSchema` | `{ id, code, expiresAt }`; UUIDv7 y fecha UTC; 600 s desde emisión, generado por encargado/administrador |
| `pcRegistrationRequestSchema` | `{ installationCode, macAddress }`; identidad/nombre los asigna el nodo; no aceptar `pcId`, rol o estado impuestos por el instalador |
| `pcRegistrationResponseSchema` | `{ pc: { id, name, macAddress }, credential, protocolVersion }`; respuesta excepcional con secreto, nunca una ficha ordinaria |
| `registeredPcSchema` | `{ id, name, macAddress }`; objeto estricto que rechaza credenciales/hashes adicionales |
| `pcRegistrationErrorSchema` | `{ code, message }`; `invalid_installation_code`, `installation_code_expired`, `installation_code_used`, `invalid_registration`, `unknown_pc`, `pc_unavailable`, `internal_error` |
| `pcAuthenticationErrorSchema` | `{ code, message }`; `missing_pc_credential`, `invalid_pc_credential`, `pc_credential_revoked`, `pc_identity_mismatch`, `unsupported_protocol_version` |

Los esquemas nuevos serán estrictos, compartirán `idSchema`/`utcInstantSchema` y se
exportarán desde `packages/shared/src/index.ts`. Probar validez/canonicalización de
base64url, errores y rechazo de secretos fuera de la respuesta de registro. Un esquema
no demuestra autorización, caducidad real o unicidad: esos efectos se prueban en T12/T13.
No se añade una dependencia para estos contratos.

**Versionado confirmado:** reservar versión **2** para el agente autenticado. T01 añade
la constante y contratos de registro sin modificar el canal v1 activo, de modo que el
repo siga funcionando durante la implementación por commits. T02/T07 preparan los
mensajes/esquemas v2; T13 cambia la admisión del nodo y T14 el simulador. Desde esa
admisión no se aceptará v1 ni conexiones anónimas en producción. Los mensajes de
sesión/pausa conservan sus campos y significado, y no se vuelve a decidir el cobro.

**Respuesta de registro perdida (confirmado):** el código permanece consumido y no se
recupera el secreto desde un hash. Encargado/administrador emite otro código con `pcId`
ligado a la misma PC, solo libre y fuera de mantenimiento; al consumirlo reemplaza la
credencial sin crear otra PC. Se comprueba disponibilidad al emitir y consumir; un
código nuevo sin consumir no invalida todavía una credencial vigente.

## Flujo principal

### T03: fondo global

Límites exactos: original **10 000 000 bytes** y **40 000 000 píxeles** (confirmados
2026-10-04), WebP enviado **2 000 000 bytes**, ancho ≤ 1920 y alto ≤ 1080.
Los encabezados se comprobarán antes de decodificar en el panel (T45); estos contratos
no decodifican imágenes ni comprueban bytes reales. JPG/PNG/WebP originales, solo WebP
en el nodo. Sin multipart ni nuevas dependencias; T43 conservará el límite de 512 KB
de fotos de productos al preparar el parser del fondo.
`lockBackgroundImageSchema` contiene SHA-256 hexadecimal minúsculo, tamaño en bytes,
`image/webp` y dimensiones enteras. Sin URLs, rutas ni bytes. `lockBackgroundSnapshotSchema`
es revisión 0/fondo por defecto/sin actor inicialmente, o revisión positiva con fondo
opcional, cambio UTC y actor del personal; quitar conserva la revisión y autoría del
cambio. El nodo incrementa la revisión del único registro en la misma transacción que
`lock_screen.background_changed`, cuyo payload lleva revisión e imagen o `null`.
GET/PUT/DELETE `/lock-screen/background` devuelven ese snapshot; PUT usa cuerpo binario
`image/webp`, DELETE sin cuerpo, descarga por SHA-256 y autenticación PC/personal según
ADR-0017. Validar contenido y hash al guardar/descargar queda en T43/T46, no en Zod.
`lockBackground` anuncia revisión e imagen o `null` en vivo y después de cada hello;
no transmite actor, imagen ni ruta. Progreso local `backgroundProgress` distingue
descarga (porcentaje entero 0–100), verificación, listo y fallo sin bloquear login.
Solo el puente local lo emite; no es un mensaje del nodo. Descargar/verificar no implica
aplicar durante una sesión: T46 conserva la copia anterior y aplica al volver al bloqueo.

### T02: contratos de mantenimiento y órdenes

T02 se divide antes de implementar para mantener commits revisables: T02a define
mantenimiento y auditoría; T02b órdenes/acuses; T02c el canal v2 que los integra.
Cada subtask tiene su propio commit y verificación. El total sigue contando los 59
grupos originales; T02 solo se marca al terminar sus tres subtareas.

**T02a:** login técnico estricto con UUIDv7 de petición y usuario/contraseña del
personal, sin credenciales Windows ni de PC. El nodo deriva rol y actor; solo
encargado/administrador, con PC libre tanto local como remota (confirmado 2026-10-04).
Constantes de 10 fallos consecutivos y 60 s, sin cambiar el login del panel.
Un mantenimiento confirmado lleva UUIDv7, PC/nombre, actor del personal, origen
`local`/`panel` e inicio UTC. `maintenanceState` comunica la entrada vigente o `null`,
separadamente del estado de sesión y de una orden solicitada.
La salida local durable lleva UUIDv7 propio, ID del mantenimiento, fin UTC y duración
monotónica en segundos enteros; no permite imponer actor. El nodo lo recupera del
mantenimiento autorizado y reconoce ese ID una sola vez. La salida remota conserva
el actor autorizado del panel. La PC no confirma entrada antes del efecto Windows.
Eventos `pc.maintenance_started`, `pc.maintenance_ended` y `staff.technical_login_locked`
usan el sobre de auditoría existente y objetos estrictos; jamás contienen contraseñas.
La salida incluye inicio/fin/duración y origen `local`/`panel`, junto al ID de salida.
Los esquemas validan estructura; autenticidad, idempotencia y plausibilidad temporal
se verificarán en la conciliación T40, y las transacciones en T28/T35–T40.
Sin nuevas dependencias ni construcción sobre el mecanismo elevado de ADR-0018.

**Mensaje confirmado (2026-10-04):** ventana centrada con sonido, duración 5 s, sin
foco ni bloqueo de entrada; PC libre, sesión activa o pausada, nunca mantenimiento.
Se liga al contexto destinatario y no se entrega si ha cambiado antes de mostrarse.
El alcance y la presentación son constantes del producto, no parámetros arbitrarios
que el emisor pueda variar en la orden.

**T02b (vigencia confirmada 2026-10-04):** una orden no aceptada vence a los 30 s y
requiere conservar su contexto. `expected` identifica `free`/`session`/`maintenance`,
su UUIDv7 de revisión y el ID de sesión o mantenimiento. La revisión cambia al cambiar
de ocupación o pausa, no por descontar segundos en un latido. El panel devuelve ese
contexto; no impone actor. Reiniciar/apagar en sesión o mantenimiento exige
`confirmed: true`; el nodo cierra/termina antes de emitir el efecto nativo correspondiente.
Abrir/cerrar sesión reutiliza sus contratos existentes; Wake-on-LAN lo ejecuta el nodo,
no se envía como orden a una PC apagada.
La orden al agente lleva UUIDv7, PC, actor autorizado, contexto, emisión/caducidad UTC
y acción cerrada: `lock`, `restart`, `powerOff`, `showMessage`, `startMaintenance` o
`endMaintenance`. Nunca contiene ejecutables, rutas, scripts o credenciales Windows.
Mensaje de texto plano, máximo técnico 1 000 caracteres para conservar el frame de 16 KiB;
sus 5 s/sonido/sin foco son constantes. Inicio y fin usan IDs de mantenimiento/salida.
El acuse lleva ID de orden y resultado `accepted`/`applied`/`failed`. `applied` solo
admite bloqueo, mensaje o mantenimiento; reinicio/apagado solo admite aceptación de
Windows o fallo. Un acuse no impone actor ni demuestra apagado físico. El nodo contrasta
tipo/IDs con la orden original, serializa acuses y guarda su resultado de forma idempotente.
El agente no reejecuta IDs ya aceptados y rechaza contexto distinto o caducidad; T28 y
T30 prueban ese almacenamiento. El contrato no implementa el journal ni la entrega.
Los errores HTTP distinguen PC desconocida/desconectada/ocupada, contexto antiguo,
confirmación ausente, reutilización incompatible del ID, petición inválida y fallo interno.
Las comparaciones temporales usan UTC del nodo; el agente lo avanza con reloj monotónico
desde `controlState.serverTime`, evitando ampliar vigencia al cambiar el reloj de Windows.

**T02c:** `native-protocol.ts` prepara los dos sentidos v2 sin cambiar la admisión v1.
Reutiliza los campos y significado de sesión/pausa, con objetos estrictos también en
sesiones, dinero y combos. `hello` v2 conserva `pcId` para contrastarlo con la identidad
autenticada; añade `recoveryState`, `controlContext` y `pendingMaintenanceExitId`.
`unknown` exige copia de sesión/contexto desconocida (`null`), sin inventar un cierre;
`known` comunica la copia persistida. La conciliación permanece en T17/T40. El latido
añade el último contexto conocido, que no sustituye al acuse del efecto Windows.
`controlState` lleva contexto y UTC del nodo, separado de `state`, `maintenanceState`
y `command`. Las salidas offline se envían individualmente con su ID y se reconocen
sin obligar a abrir un mantenimiento nuevo. Errores de autenticación distinguen la
revocación de un fallo de transporte; la aplicación del corte de consumo confirmado
el 2026-10-07 queda en T34, sin alterar estos contratos ya implementados.
La solicitud de puente `endMaintenance` identifica el mantenimiento y la petición;
el servicio produce la salida durable incluso sin red. `nativeShellRequestSchema`
solo admite acciones del cliente y login/salida técnica: React no fabrica hello,
latidos, acuses, credenciales ni órdenes nativas. El validador de notificaciones del
Shell excluye las órdenes, que consume C# por el canal confiable. T07 exporta estas
fronteras separadas para C#, con fixtures que prueban ese aislamiento.

### Arranque, sesión y recuperación

1. El instalador comprueba versión/edición y runtime, guarda la configuración previa,
   registra la PC y configura servicio, usuario restringido, inicio automático y shell.
2. El agente arranca sin UI, verifica el nodo y mantiene una única conexión con latidos.
3. El host abre la interfaz empaquetada y muestra el escritorio bloqueado desde el
   arranque; no lanza Explorer. Sin respuesta del nodo muestra la desconexión.
4. El cliente envía el login por React → host → pipe → agente → nodo. Solo el `state`
   válido del nodo autoriza volver al escritorio de uso.
5. El agente conserva el estado y una referencia de tiempo monotónico para la cuenta
   local. Cerrar o colgar WebView2 no reinicia esa cuenta ni da tiempo adicional.
6. Cierre, agotamiento o «Bloquear» llevan al escritorio de bloqueo con las reglas de
   cierre existentes y cierran los procesos del cliente sin reiniciar Windows (003-34).
   Determinar su pertenencia sin terminar Pope, servicios ni procesos de otros usuarios;
   verificar lanzadores, procesos auxiliares y juegos con anticheat en la PC de pruebas.
7. Si muere o se cuelga el host, el agente detecta el fallo y lo relanza conservando el
   estado. Probar el límite total de < 3 s (003-32), incluyendo detección y nueva UI.

### Pausa real (fase 2 de la spec 002)

- Al recibir pausa del nodo, cambiar al escritorio de bloqueo y silenciar el audio
  conservando el estado de volumen/mute que había. Las apps siguen ejecutándose.
- Confirmar la reanudación en el Shell; solo el estado del nodo sin pausa permite
  volver al escritorio de uso y restaurar el audio. Una pausa vencida que ya cobra
  sigue impidiendo entrada hasta reanudar.
- Sin red se conserva el último estado: en una pausa que no cobra no se decide
  localmente el vencimiento; en sesión activa se descuenta el restante conocido y
  se bloquea al agotarlo, como ADR-0007. La reconciliación la hace el nodo.
- Verificar entrada, juegos exclusivos, dispositivos de audio cambiados, reinicio
  del host y latencia de < 1 s (002-04, 05, 07, 50; CA-002-02).

### Mantenimiento y órdenes

- El nodo autoriza mantenimiento local de encargado/administrador o la orden remota
  ya permitida. Ambas entradas exigen que no haya sesión de cliente, también si está
  pausada; la entrada local quedó confirmada el 2026-10-04.
- El acceso técnico aplica 10 fallos por cuenta → bloqueo de 1 min y aviso al panel
  (003-45). El contador no vive en la PC: cambiar de equipo no elude el bloqueo.
  Son fallos consecutivos; un login correcto o el fin del bloqueo reinician el contador.
  Se emite un aviso por bloqueo; no afecta al login del personal del panel.
- Mantener el usuario cliente sin privilegios. La cuenta Windows, obtención del token
  elevado, separación de sesiones y recuperación al salir requieren una decisión
  técnica específica antes de construir este flujo; no elevar WebView2.
- Mostrar la pestaña «Técnico» plegada ya diseñada, con «Terminar y bloquear»; registrar
  quién autorizó, entrada, salida y duración. Sin red, continuar el mantenimiento y
  permitir salir/bloquear; guardar esa salida de forma durable y acotada hasta el
  reconocimiento idempotente del nodo (003-44). Definir recuperación tras reinicio.
- Encender usa UDP desde el nodo con la MAC registrada (no una orden a una PC apagada).
  El mapa solo confirma el arranque cuando la PC se conecta. Si pasan 2 min, avisar
  sin diagnosticar avería; quitar el aviso si conecta después (003-22).
- Reinicio/apagado con sesión activa o pausada: confirmar, cerrar con las reglas
  existentes y ejecutar después. El panel advierte la pérdida de tiempo de una temporal.
  Registrar resultado real, no solo envío; no emitir apagados repetidos al reconectar.
- Reinicio/apagado durante mantenimiento: pedir confirmación, terminar el mantenimiento,
  registrar la salida y después ejecutar la orden (mantenedor, 2026-10-04).
- Revocación: conservar la sesión y bloquear el acceso cuando la PC recibe la revocación,
  hasta intervención del encargado. **Opción A confirmada (2026-10-07): detener el
  consumo de saldo y tiempo restante durante el bloqueo por revocación confirmado**.
  El nodo decide el cobro; un simple corte de red o fallo TLS no activa esta regla.
  **Recuperación A confirmada (2026-10-07), ADR-0020:** revincular la misma PC con
  credencial nueva y conservar la sesión. La anterior sigue revocada. La nueva
  credencial no desbloquea ni reactiva el consumo automáticamente; requiere autorización
  del encargado o administrador desde el nodo para continuar. Es un flujo específico
  de T34, separado de la recuperación ordinaria de T12 que exige PC libre y sin mantenimiento.
  **Permisos A confirmados (2026-10-07), ADR-0021:** encargado y administrador pueden
  revocar, revincular y autorizar continuar. El nodo valida sesión/rol en cada acción;
  dueño solo lee. **Entrega A confirmada (2026-10-07), ADR-0022:** código de recuperación
  ligado a la PC revocada, un uso y 600 s, generado en panel e introducido físicamente
  en su asistente. El servicio obtiene/custodia la credencial nueva por TLS con el nodo
  verificado, sin mostrarla en panel/JavaScript. Requiere LAN con el nodo y no abre
  mantenimiento ni desbloquea. Diseñar el flujo específico T34 sin ampliar T12 a PCs
  ocupadas. **Estado previo A confirmado (2026-10-07):** autorizar continuar restaura
  activa como activa y pausada como pausada. El bloqueo confirmado no consume el tiempo
  de pausa que quedaba ni añade otra pausa por sesión/día (REQ-002-33, CA-002-09).
  Recuperar una pausa no la reanuda; vuelve a su flujo y límites ordinarios. Quedan
  contratos, acceso al asistente, respuestas perdidas y confirmación de los intervalos
  efectivos de bloqueo/continuación, incluidos acuses perdidos. El nodo fija los tiempos.
  La ausencia de latidos o una reconciliación no deben cerrar por accidente la sesión
  conservada. Los cambios de estado se auditan con actor según ADR-0008.
- **Acceso a Pope confirmado (2026-10-07), ADR-0023:** Alt+Tab se inhibe solo sin
  sesión. Con temporal/cuenta se permite también al enfocar Pope; en uso activo alterna
  entre Pope y ventanas autorizadas del escritorio de uso, sin pausar automáticamente.
  Cuenta conserva botón/confirmación; temporal no puede pausar. Pausa/revocación siguen
  aisladas: Alt+Tab habilitado no autoriza cambiar a los juegos. T09/T25 comprueban
  Pope en el selector sin Explorer, con juegos exclusivos/anticheat y sin trasladar
  WebView2 ya creado. Si el selector nativo falla, revisar el diseño conservando Alt+Tab;
  no dar por compatible el mecanismo ni iniciar Explorer para resolverlo.

### Alternativas de mantenimiento (ruta de ensayo aprobada; verificación pendiente)

La cuenta del personal de Pope autoriza la operación; el token y los permisos de
Windows proceden de otra identidad local. Ninguna opción convierte la cuenta del
cliente en administradora ni ejecuta el escritorio o WebView2 como LocalSystem.

| Opción | Qué implica | Ventajas y coste |
|---|---|---|
| A. Cuenta Windows de mantenimiento creada por Pope | El instalador crea una administradora exclusiva por PC; el servicio custodia su secreto y solo abre el entorno tras autorización del nodo | Separa al cliente y evita reutilizar credenciales personales. Exige protección del secreto, rotación, perfil, recuperación y desinstalación |
| B. Cuenta administradora Windows existente | El técnico configura una cuenta local ya creada y autoriza su uso al servicio; Pope no crea otra | Reutiliza el perfil y herramientas instaladas. Pope dependería de su contraseña y permisos; cambios externos pueden romper el acceso y esa cuenta puede contener datos ajenos a Pope |
| C. Inicio administrativo manual de Windows | Pope autoriza el mantenimiento, pero una persona introduce además las credenciales de Windows en la PC | El servicio no guarda ese secreto. Cambia 003-40 y no cumple la entrada remota sin escribir en la PC de 003-43; requiere revisar esos requisitos |

**Elección del mantenedor (2026-10-04): B**, cuenta Windows existente. La opción A fue
la recomendación inicial y se conserva solo como alternativa comparada. ADR-0018
desarrolla B, aceptada para ensayar el 2026-10-08. Hay que prototipar
obtención de token elevado con UAC, aislamiento del escritorio/perfil, compatibilidad
con las directivas del cliente y cierre de todos los procesos administrativos al salir.
No basta con lanzar `explorer.exe` desde el usuario restringido ni con añadirlo
temporalmente al grupo Administradores. La desinstalación conservará la cuenta y sus
datos, y un cambio externo de contraseña necesitará reconfigurar su custodia en el agente.

**Ruta T10 aprobada (2026-10-08):** ADR-0018 detalla DPAPI de máquina con ACL
SYSTEM, reconfiguración local, broker de prueba, token elevado/logon, perfil/escritorio
propios y cierre por Job Object. Solo usa APIs Windows, sin proponer nuevas dependencias.
El mantenedor aprueba explícitamente y pide continuar T10. Demostrar cada propiedad
en la VM antes de integrarla; la aceptación no sustituye esa prueba.

**Herramienta T10:** ampliar únicamente `Pope.DesktopProbe`. Referencia a `Pope.Agent`
para reutilizar `System.ServiceProcess.ServiceController` ya fijado en T08, sin paquete
nuevo. Broker sesión 0 y ayudante SYSTEM sin GUI en consola: Windows no permite heredar
handles entre sesiones. El ayudante obtiene los tokens, perfil y escritorio; las ventanas
se ejecutan bajo el usuario previsto. Un único servicio temporal por GUID y Job Objects
acotan todos los procesos del ensayo; no es el servicio de producto de T15.

### Fondo

El panel acepta JPG/PNG/WebP hasta 10 MB, reduce sin deformar a máximo 1920×1080 y
envía WebP hasta 2 MB (003-76). El plan propone cuerpo binario `image/webp` como las fotos
de productos para evitar multipart y otra dependencia. Verificar archivo y límite;
transmitir solo por LAN con autenticación.
Descargar a un archivo temporal, comprobar SHA-256 y sustituir la copia de forma atómica.
Conservar el anterior ante un fallo; con sesión activa, aplicar el nuevo al volver al
bloqueo. El tratamiento de imagen se hace en el panel, sin procesador pesado en el nodo.
El formato binario y los cuerpos/respuestas exactos se revisan al aprobar el plan;
la propuesta anterior de multipart no es un contrato vigente.

## Casos límite y errores

| Situación | Comportamiento o decisión pendiente |
|---|---|
| Nodo ausente al arrancar | Interfaz local y PC bloqueada; reconexión sin login offline (003-04) |
| Corte de LAN con sesión activa | Cuenta monotónica del último restante; bloqueo al agotarlo y conciliación del nodo (ADR-0007) |
| Corte durante pausa | Sigue en escritorio de pausa; no inventar cobro ni reanudación (002-30) |
| PC reiniciada en pausa | Bloqueo al arrancar y recuperación de la pausa desde el nodo (002-31) |
| Host muerto o UI colgada | Detectar desde el agente, relanzar y conservar estado; medir 003-32 |
| Agente reiniciado sin estado verificable | Propuesta: permanecer bloqueada hasta obtener estado válido; concretar recuperación en la spec |
| Credencial revocada | Rechazar conexión; conservar sesión y detener consumo durante bloqueo confirmado. Recuperar la misma PC con credencial nueva; mantener bloqueo hasta autorización del encargado/administrador (ADR-0020/0021). Mecanismo/confirmación temporal pendientes; sin red solo se conoce al reconectar |
| Nodo no verificado | No enviar credenciales; no confundir fallo de certificado con una revocación confirmada |
| Pipe o mensaje falsificado | Rechazar antes de una acción nativa; no registrar contraseñas ni secretos |
| Mantenimiento solicitado con sesión | Rechazar y exigir cierre previo; no cerrar automáticamente (003-43) |
| Red perdida en mantenimiento | Seguir en modo técnico; salida local y registro idempotente al reconectar (003-44) |
| No se puede cambiar de escritorio | No confirmar éxito ni dejar autorizado el uso; prototipo debe demostrar una recuperación segura |
| Fondo corrupto o descarga cortada | Conservar la copia previa y reintentar con límites (003-73) |
| Desinstalación o instalación a medias | Restaurar solo lo que Pope cambió y conservar datos previos; verificar en entorno desechable |

## Impacto en recursos (ADR-0011)

### Preparación T08 autorizada (2026-10-07)

El mantenedor pide continuar autónomamente T08–T20, una tarea por commit. Se conserva
el orden y las verificaciones previas de T09/T10; esta autorización no resuelve por sí
sola el mecanismo propuesto de ADR-0018 ni permite omitir pruebas del entorno aislado.
Se divide T08 en T08a (herramientas, solución y contratos) y T08b (compatibilidad en el
inventario Windows), sin añadir funcionalidad. El grupo solo se cierra al verificar ambas.

**Decisión posterior (mantenedor, 2026-10-08):** aceptar los resultados ejecutados en
Windows 10 Home 22H2 para cerrar T08b/T08 y continuar T09. Sustituye el gate Pro previo
a T09 descrito en este apartado. REQ-003-62 y el inventario conservan Pro como objetivo;
pruebas Pro pendientes antes de entregar al local, sin inferir su resultado desde Home.

**Cierre del prototipo T09 (mantenedor, 2026-10-08):** acepta el ensayo de Freedoom/
Chocolate Doom exclusivo en VM Home para cerrar T09 y avanzar. Se conserva validación
física de juegos reales/anticheat en T25/T56 antes de entrega, sin afirmar compatibilidad
desde la VM. Complementa la secuencia del entorno aislado y ADR-0023.

- SDK **10.0.401** fijado con `global.json`, solo parches estables de esa banda; framework
  `net10.0-windows`, ejecutables autocontenidos `win-x64`, según ADR-0006. El SDK de esta
  sesión se extrae bajo `tmp/`, sin instalación global ni cambios de servicio/cuentas.
- Servicio: API oficial `System.ServiceProcess.ServiceController` **10.0.12**, para
  `ServiceBase`, sin infraestructura de hosting adicional. T08 no arranca ni instala
  el servicio: el ciclo de vida protegido pertenece a T15.
- Host: SDK oficial `Microsoft.Web.WebView2` **1.0.4191.47**, WinForms según ADR-0019.
  Se excluye la referencia WPF que el paquete añade automáticamente para evitar el
  conflicto WindowsBase; no se suprimen advertencias. UI/aislamiento quedan en T09/T19.
- Tests: **xUnit 2.9.3**, adaptador Visual Studio **2.8.2** y **Microsoft.NET.Test.Sdk
  17.14.1** para `dotnet test`; **JsonSchema.Net 7.3.1** por su soporte draft 2020-12,
  formatos obligatorios y evaluación directa de los JSON exportados en T07. Son
  dependencias exclusivas de pruebas, nunca se publican con agente/host. Los fixtures
  verifican puntos de código, patrones, formatos y normalización sin coerción.
- Versiones transitivas fijadas en `packages.lock.json`; scripts del workspace con
  restauración bloqueada. Turborepo depende de shared para regenerar/comprobar contratos;
  C# consume los mismos JSON y no replica tarifas, saldo ni decisiones de cobro.
- T08b requiere los ejecutables y pruebas en Windows 10 Pro 22H2 y Windows 11 Pro 25H2.
  La matriz oficial actual de .NET no incluye el primero: compatibilidad funcional y
  soporte del fabricante son evidencias distintas. No afirmar REQ-003-62 hasta probar.
  VM «22h2 pope» disponible en VirtualBox 7.2.20, Guest Additions 7.2.20, 8192 MB y 2 vCPU.
  Registro y CIM identifican Windows 10 Home 22H2 (19045.2965); el mantenedor autoriza
  pruebas preliminares en Home, conservando la verificación obligatoria del inventario Pro.

Referencias consultadas: [SDK .NET 10](https://dotnet.microsoft.com/en-us/download/dotnet/10.0),
[Windows admitidos](https://github.com/dotnet/core/blob/main/release-notes/10.0/supported-os.md),
[SDK WebView2](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4191.47),
[JsonSchema.Net](https://www.nuget.org/packages/JsonSchema.Net/7.3.1).

Aplicar el presupuesto vigente del ADR-0016: nodo en i3-2120, Node ≤ 384 MB y total
Pope ~1 GB. Ningún runtime .NET, SDK o compilación se instala en el nodo para los clientes.
Servir archivos en streaming, limitar la subida y evitar copias grandes de imágenes en RAM.
Una conexión y temporizadores acotados por PC; registros de órdenes y reintentos con
retención explícita, sin crecer con semanas de cortes de red.

- **.NET 10 LTS** propuesto según ADR-0006, publicación `win-x64` autocontenida; confirmar
  compatibilidad con el Windows real antes de fijar SDK y herramientas del instalador.
- **SDK oficial WebView2:** dependencia nativa prevista por ADR-0005/0006. Host sin
  elevación y servicio sin UI. Evergreen y su instalador completo offline están
  confirmados. **Host WinForms + WebView2 confirmado por el mantenedor (opción A,
  2026-10-07), según ADR-0019:** ventana sin bordes con React a pantalla completa,
  C# mínimo para ventana, WebView2 y puente. Fijar versiones mínimas tras comprobar
  Windows; T09 debe demostrar el escritorio separado y la recuperación. Se conserva
  el respaldo WPF de ADR-0005 si el prototipo falla, previa revisión del plan.
- **C# estándar:** WebSocket, pipe, JSON y temporización; APIs Win32/COM comentadas en
  español. Sin lógica de tarifas, saldos, límites de pausa ni decisión de cobro.
- **Tests C#:** justificar framework de tests y validador JSON Schema (p. ej.
  JsonSchema.Net, solo en tests) antes de añadir paquetes; exportación draft 2020-12.
- **Servidor:** reutilizar TLS y UDP de Node, `ws`, Fastify y el almacenamiento existente.
  Proponer fondo binario como las fotos de productos, sin `@fastify/multipart` ni `sharp`;
  parser de WebP y máximo de 2 MB. Limitar dimensiones/píxeles antes de decodificar en
  el panel; concretar ese límite técnico al cerrar los contratos.

Medir agente < 50 MB y host < 60 MB excluyendo WebView2 (003-60), y registrar también el
consumo completo con sus procesos Chromium para conocer el coste real. Windows 10 Pro
22H2 y Windows 11 Pro 25H2 sin congelador son el inventario confirmado; comprobar
actualizaciones y persistencia ante cortes sin depender de internet para instalar o bloquear.

## Estrategia de pruebas

| Nivel | Qué se comprueba | REQ / CA |
|---|---|---|
| Shared y compatibilidad C# | JSON Schema de ambos sentidos, mensajes válidos/inválidos, límites y versión | 003-63; ADR-0002 |
| Servidor PGlite y PostgreSQL | Código de un uso, autenticación/revocación, suplantación, roles, órdenes, eventos y mantenimiento con sesión rechazada | 003-10, 11, 20, 40, 41, 43; CA-003-03, 07 |
| Login técnico en varias PCs | Diez fallos consecutivos, bloqueo por cuenta durante 1 min, un aviso al panel y reset tras login válido o fin del bloqueo | 003-45; CA-003-10 |
| Mantenimiento con corte de LAN | No termina por perder red; salida bloquea localmente, sobrevive al reinicio del servicio y se registra sin duplicados al reconectar | 003-44, 41; CA-003-09 |
| C# con efectos simulados | Cuenta monotónica, estados del nodo, reconexión, pipe falsificado, vigilancia y ausencia de datos sensibles en logs | 003-04, 32, 63; 002-30, 31 |
| Prototipo Windows aislado | Renderizar WebView2 en escritorio alterno, transición, atajos, permisos, fallo del host y juego exclusivo | 003-30 a 33; CA-003-02; CA-002-02 |
| PC o VM desechable | Arranque sin Explorer, usuario restringido, directivas, instalación interrumpida y desinstalación reversible | 003-01 a 03, 31, 50, 51, 62; CA-003-01 |
| PC real con juegos | Cierre de procesos de cliente sin reinicio, preservando Pope y sistema; cierre/agotamiento/bloqueo/temporal | 003-34; CA-003-08 |
| PC real del local | Juego exclusivo, teclas/clics bloqueados, silencio/restauración, RAM, < 1 s y recuperación < 3 s | 003-32, 60, 61; 002-04, 05, 07, 50 |
| Panel, Shell y simulador | Mantenimiento rojo, controles por rol, pestaña técnica, orden fallida, fondo actualizado y conservación durante sesión; límites de archivo, reducción y huella | CA-003-03 a 07; 003-76 |
| LAN real | Wake-on-LAN con BIOS/NIC configuradas, MAC correcta y reconexión | 003-22; CA-003-06 |

Juegos del inventario de prueba: Valorant, Counter-Strike 2, Call of Duty, Delta Force,
League of Legends, Minecraft, Roblox y Blood Strike. Sus versiones, anticheat y modo
de pantalla se registran en las mediciones; la VM no sustituye esa prueba de hardware.
Los juegos ocasionales de clientes requieren revisión por la spec 004.

Los tests de una ventana no prueban aislamiento de Windows. La entrega necesita
`mediciones.md` con evidencia por requisito, consumo por proceso, intervalos medidos,
versiones de Windows/WebView2 y juegos probados. No cambiar shell, autologin, cuentas o
directivas del equipo cotidiano para preparar el documento.

**Orden propuesto para futuras tareas:** cerrar spec/ADRs → contratos y pruebas de
compatibilidad → prototipo nativo aislado → registro y conexión segura → host/servicio
con bloqueo y pausa → controles/mantenimiento → fondo e instalador → verificación.
Si el prototipo no cumple, se revisa el ADR y el plan antes de ampliar la implementación.
Las tareas nativas de pausa se enumeran en el `tasks.md` de la 003, con referencias a
los requisitos de la 002, para mantener una sola lista de implementación. La fase 1
aprobada de la 002 conserva sus 19 tareas; la fase 2 sigue pendiente hasta verificarse.

## Riesgos

- **Windows Pro:** Shell Launcher no es la misma función que la directiva Custom User
  Interface. Pro admite esta última según Microsoft; la ruta de instalación debe
  validarse en la edición real y restaurar la configuración previa. No exigir
  Enterprise ni prometer que el instalador de Pro ya está resuelto.
- **Sesión 0:** el servicio no muestra ventanas. WebView2 no admite usuario del sistema;
  un host elevado ampliaría la superficie de ataque. Mantenimiento elevado se separa.
- **Escritorios:** no trasladar una ventana WebView2 ya creada entre escritorios.
  `SetThreadDesktop` exige que el hilo no tenga ventanas ni hooks. El prototipo debe
  determinar hilos STA o instancias del host y demostrar ACL, recuperación y consumo.
- **Aislamiento:** el escritorio alterno separa entrada, pero el lenguaje C# por sí
  solo no impide escapes. Probar permisos, atajos, diálogos y procesos del mismo usuario;
  el catálogo y sus vías de escape siguen pendientes de la spec 004.
- **Ctrl+Alt+Supr:** pertenece a Windows y no se intercepta con el hook; verificar las
  opciones recortadas por directiva (003-31), sin confundirlo con una ventana del Shell.
- **Recuperación:** un servicio caído o una desinstalación fallida no equivalen a que
  muera el host. El mantenedor solicita diseñar acceso de emergencia de Pope sin nodo;
  **presencia física obligatoria confirmada (opción A, 2026-10-07, ADR-0024)**, con
  intervención local delante de la PC afectada y sin entrada remota de emergencia.
  **Autenticación A confirmada (2026-10-07, ADR-0025):** credenciales manuales de la
  cuenta administradora local Windows existente, validadas por Windows sin nodo ni
  servicio. Sin clave propia de Pope ni uso automático del secreto del agente.
  **Permisos B confirmados (2026-10-07, ADR-0026):** administrador y encargado pueden
  usar esas credenciales para emergencia presencial. No se presume verificado un rol
  vigente de Pope sin nodo. La atribución por cuenta Windows sigue ADR-0028.
  **Alcance A confirmado (2026-10-07, ADR-0027):** Windows completo bajo esa identidad
  administradora para reparar Pope, red, controladores u otros fallos del equipo,
  separado del cliente y sin elevar WebView2. El nodo conserva sesiones y cobro.
  **Auditoría B confirmada (2026-10-07, ADR-0028):** cuenta Windows autenticada, PC y
  entrada/salida UTC automáticas, sin pedir nombre/usuario Pope ni motivo. Guardar
  localmente de forma durable y enviar al nodo sin duplicados cuando esté disponible.
  Una cuenta compartida no distingue personas ni demuestra un rol Pope vigente.
  Las reglas de uso están cerradas; captura sin agente, contratos/actor, persistencia
  acotada, salida no observada, aislamiento y comprobación local siguen por diseñar.
  Aprobar y probar la ruta administrativa independiente del servicio
  antes de construir. No se aprueba por esta elección el mecanismo ordinario de ADR-0018.
- **Compatibilidad y anticheat:** inventario Windows/ediciones y ausencia de congelador
  confirmados. Elegir herramientas para esas versiones y validar con juegos reales
  antes de afirmar compatibilidad o recuperación de pantalla exclusiva.
- **Preguntas abiertas:** quedan en `spec.md`; todas las opciones señaladas como
  propuestas necesitan decisión antes de aprobar el plan. No generar código ni tareas
  de implementación sobre ellas.

Referencias técnicas consultadas el 2026-10-04:
[Shell Launcher](https://learn.microsoft.com/en-us/windows/configuration/shell-launcher/wesl-usersettingsetcustomshell),
[Custom User Interface](https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-admx-winlogon#customshell),
[seguridad de WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security),
[SetThreadDesktop](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setthreaddesktop),
[SwitchDesktop](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-switchdesktop)
y [soporte .NET LTS](https://dotnet.microsoft.com/en-us/platform/support/policy).
Para la revisión de mantenimiento: [UAC y tokens de administrador](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/user-account-control/how-it-works)
y [procesos bajo otra identidad de Windows](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createprocesswithlogonw).
