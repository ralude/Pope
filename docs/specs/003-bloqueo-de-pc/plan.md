# Plan 003: Arranque y bloqueo de la PC cliente

- **Estado:** Borrador inicial (2026-10-04); pendiente de resolver preguntas y aprobar la spec.
- **Spec:** [spec.md](spec.md), todavía en Borrador.
- **ADRs que aplican:** ADR-0001, ADR-0002, ADR-0005, ADR-0006, ADR-0007, ADR-0008,
  ADR-0009, ADR-0015 y ADR-0016. ADR-0010 sigue Propuesto y pertenece a la spec 004.
- **ADRs nuevos que propone:** [ADR-0017](../../adr/0017-comunicacion-segura-del-cliente-windows.md),
  comunicación segura, y [ADR-0018](../../adr/0018-mantenimiento-con-cuenta-windows-existente.md),
  mantenimiento con una cuenta Windows existente. La instalación se documentará en
  ADR antes de construirla si requiere decisiones nuevas.

## Resumen

El servicio `Pope.Agent` mantiene la conexión con el nodo y supervisa al host; el
proceso `Pope.ShellHost` aloja React en WebView2 y usa C# para las APIs de Windows.
El bloqueo y la pausa usan un escritorio Win32 separado, con las aplicaciones del
cliente en el escritorio de uso. El nodo conserva toda decisión de sesión y cobro.

El mantenedor confirmó C#, WebView2, el escritorio separado y la inclusión de la
**fase 2 de la spec 002** el 2026-10-04. Este documento inicia el diseño solicitado;
no aprueba la spec, los ADR-0017/0018, las propuestas técnicas pendientes ni la implementación.
Después de cerrar las preguntas, se aprueba primero la spec, después el plan y por
último se redactan y aprueban las tareas, siguiendo ADR-0013.

**Decidido:** «Bloquear» cierra la sesión; mantenimiento
remoto solo con la PC libre; login técnico local para encargado y administrador,
validado por el nodo; cerrar procesos del cliente sin reiniciar Windows al terminar;
Evergreen con instalador completo sin conexión. Hay 13 PCs (normalmente 12 para clientes)
y se dispone de una PC de pruebas y una VM. **Inventario tentativo:** mayoría con Windows
10 22H2 y una PC con Windows 11. **Sin confirmar:** versiones/ediciones exactas,
congelador y las preguntas indicadas en la spec.

El nodo tendrá IP fija o reserva DHCP, configurada en la instalación. Un mantenimiento
ya autorizado continúa sin red y permite terminar/bloquear localmente; se registra la
salida al reconectar. El mantenedor eligió reutilizar una cuenta administradora Windows
existente; falta revisar y verificar el mecanismo propuesto en ADR-0018.

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
| Códigos de instalación | Hash, actor, creación, caducidad y consumo atómico de un solo uso; plazo y formato pendientes |
| Credenciales de PC | Hash, PC asociada, creación y revocación; el secreto solo se entrega al registro y lo guarda el agente |
| Órdenes de PC | UUIDv7, PC, tipo, actor, datos, resultado y tiempos; transición y evento en la misma transacción |
| Mantenimiento | PC, actor que lo autorizó, inicio, fin y duración; una entrada abierta por PC |
| Fondo del local | Metadatos y huella del archivo actual en disco bajo `POPE_DATA_DIR`; histórico mediante eventos |

Índices por credencial y código; unicidad de código consumido y mantenimiento abierto.
Fechas UTC, duración en segundos enteros. Las migraciones se generan con Drizzle y se
verifican con PGlite y PostgreSQL real. Cada mutación pasa por
`EventsService.inTransaction`; nunca se escribe directamente en `events`.

El estado físico del escritorio se confirma desde la PC: pedir una orden no demuestra
que Windows la haya aplicado. Separar orden solicitada, confirmada y fallida; conservar
el actor del personal al registrar el resultado.

## Contratos

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

## Flujo principal

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
  ya permitida; exige que no haya sesión de cliente, también si está pausada.
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
- Concretar mensaje del encargado y reinicio/apagado durante mantenimiento; no asumir
  que toda orden se puede ejecutar en cualquier estado.

### Alternativas de mantenimiento (identidad elegida; mecanismo en revisión)

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
desarrolla B como propuesta técnica aún sin aprobar. Hay que prototipar
obtención de token elevado con UAC, aislamiento del escritorio/perfil, compatibilidad
con las directivas del cliente y cierre de todos los procesos administrativos al salir.
No basta con lanzar `explorer.exe` desde el usuario restringido ni con añadirlo
temporalmente al grupo Administradores. La desinstalación conservará la cuenta y sus
datos, y un cambio externo de contraseña necesitará reconfigurar su custodia en el agente.

### Fondo

Verificar archivo y límite aprobado; transmitir solo por LAN con autenticación.
Descargar a un archivo temporal, comprobar SHA-256 y sustituir la copia de forma atómica.
Conservar el anterior ante un fallo; con sesión activa, aplicar el nuevo al volver al
bloqueo. El tratamiento de imagen se hace en el panel, sin procesador pesado en el nodo.
Formato de subida y límites siguen pendientes: la propuesta multipart no está aprobada.

## Casos límite y errores

| Situación | Comportamiento o decisión pendiente |
|---|---|
| Nodo ausente al arrancar | Interfaz local y PC bloqueada; reconexión sin login offline (003-04) |
| Corte de LAN con sesión activa | Cuenta monotónica del último restante; bloqueo al agotarlo y conciliación del nodo (ADR-0007) |
| Corte durante pausa | Sigue en escritorio de pausa; no inventar cobro ni reanudación (002-30) |
| PC reiniciada en pausa | Bloqueo al arrancar y recuperación de la pausa desde el nodo (002-31) |
| Host muerto o UI colgada | Detectar desde el agente, relanzar y conservar estado; medir 003-32 |
| Agente reiniciado sin estado verificable | Propuesta: permanecer bloqueada hasta obtener estado válido; concretar recuperación en la spec |
| Credencial revocada o nodo no verificado | Rechazar conexión; falta decidir cuándo y cómo se bloquea una sesión ya activa |
| Pipe o mensaje falsificado | Rechazar antes de una acción nativa; no registrar contraseñas ni secretos |
| Mantenimiento solicitado con sesión | Rechazar y exigir cierre previo; no cerrar automáticamente (003-43) |
| Red perdida en mantenimiento | Seguir en modo técnico; salida local y registro idempotente al reconectar (003-44) |
| No se puede cambiar de escritorio | No confirmar éxito ni dejar autorizado el uso; prototipo debe demostrar una recuperación segura |
| Fondo corrupto o descarga cortada | Conservar la copia previa y reintentar con límites (003-73) |
| Desinstalación o instalación a medias | Restaurar solo lo que Pope cambió y conservar datos previos; verificar en entorno desechable |

## Impacto en recursos (ADR-0011)

Aplicar el presupuesto vigente del ADR-0016: nodo en i3-2120, Node ≤ 384 MB y total
Pope ~1 GB. Ningún runtime .NET, SDK o compilación se instala en el nodo para los clientes.
Servir archivos en streaming, limitar la subida y evitar copias grandes de imágenes en RAM.
Una conexión y temporizadores acotados por PC; registros de órdenes y reintentos con
retención explícita, sin crecer con semanas de cortes de red.

- **.NET 10 LTS** propuesto según ADR-0006, publicación `win-x64` autocontenida; confirmar
  compatibilidad con el Windows real antes de fijar SDK y herramientas del instalador.
- **SDK oficial WebView2:** dependencia nativa prevista por ADR-0005/0006. Host sin
  elevación y servicio sin UI. Evergreen y su instalador completo offline están
  confirmados; elegir WinForms/WPF y fijar versiones mínimas en el diseño final.
- **C# estándar:** WebSocket, pipe, JSON y temporización; APIs Win32/COM comentadas en
  español. Sin lógica de tarifas, saldos, límites de pausa ni decisión de cobro.
- **Tests C#:** justificar framework de tests y validador JSON Schema (p. ej.
  JsonSchema.Net, solo en tests) antes de añadir paquetes; exportación draft 2020-12.
- **Servidor:** reutilizar TLS y UDP de Node, `ws`, Fastify y el almacenamiento existente.
  `@fastify/multipart` solo si se aprueba ese formato de fondo; alternativa: cuerpo binario
  como las fotos de productos, sin nueva dependencia.

Medir agente < 50 MB y host < 60 MB excluyendo WebView2 (003-60), y registrar también el
consumo completo con sus procesos Chromium para conocer el coste real. Windows 10 22H2
y congelador condicionan actualizaciones; no depender de internet para instalar o bloquear.

## Estrategia de pruebas

| Nivel | Qué se comprueba | REQ / CA |
|---|---|---|
| Shared y compatibilidad C# | JSON Schema de ambos sentidos, mensajes válidos/inválidos, límites y versión | 003-63; ADR-0002 |
| Servidor PGlite y PostgreSQL | Código de un uso, autenticación/revocación, suplantación, roles, órdenes, eventos y mantenimiento con sesión rechazada | 003-10, 11, 20, 40, 41, 43; CA-003-03, 07 |
| Mantenimiento con corte de LAN | No termina por perder red; salida bloquea localmente, sobrevive al reinicio del servicio y se registra sin duplicados al reconectar | 003-44, 41; CA-003-09 |
| C# con efectos simulados | Cuenta monotónica, estados del nodo, reconexión, pipe falsificado, vigilancia y ausencia de datos sensibles en logs | 003-04, 32, 63; 002-30, 31 |
| Prototipo Windows aislado | Renderizar WebView2 en escritorio alterno, transición, atajos, permisos, fallo del host y juego exclusivo | 003-30 a 33; CA-003-02; CA-002-02 |
| PC o VM desechable | Arranque sin Explorer, usuario restringido, directivas, instalación interrumpida y desinstalación reversible | 003-01 a 03, 31, 50, 51, 62; CA-003-01 |
| PC real con juegos | Cierre de procesos de cliente sin reinicio, preservando Pope y sistema; cierre/agotamiento/bloqueo/temporal | 003-34; CA-003-08 |
| PC real del local | Juego exclusivo, teclas/clics bloqueados, silencio/restauración, RAM, < 1 s y recuperación < 3 s | 003-32, 60, 61; 002-04, 05, 07, 50 |
| Panel, Shell y simulador | Mantenimiento rojo, controles por rol, pestaña técnica, orden fallida, fondo actualizado y conservación durante sesión | CA-003-03 a 07 |
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
Las tareas de pausa se añadirán a la spec 002 coordinadas con la 003, sin darla por
implementada hasta verificar los requisitos nativos.

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
  muera el host. Acordar acceso de reparación sin abrir una puerta de cliente.
- **Edición, congelador y anticheat:** falta inventario; validar con juegos reales antes
  de afirmar compatibilidad o recuperación de pantalla exclusiva.
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
