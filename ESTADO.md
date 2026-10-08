# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-08 · pruebas preliminares en VM Home correctas; T08b Pro pendiente

## Ahora

| | |
|---|---|
| **Spec en curso** | [003 · Arranque y bloqueo de PC](docs/specs/003-bloqueo-de-pc/spec.md): T01–T07 completos; T08–T20 autorizadas para continuación autónoma; T21–T59 en Borrador. La 005 mantiene su T07 de revisión |
| **Siguiente tarea** | T08b: verificar artefactos y contratos en Windows 10 Pro 22H2 y Windows 11 Pro 25H2 antes de T09. Guest Control recuperado; pruebas preliminares autorizadas en Home completas. T08a completa |
| **Progreso** | Spec 003: 7 / 59 grupos; T01–T07 completas y T08a implementada/verificada en desarrollo. T08 permanece abierta por compatibilidad T08b; continuación T08–T20 autorizada. Spec 002: 19 / 19 tareas (fase 1), fase 2 en tasks 003. Spec 005: 41 / 42 |
| **Bloqueos** | T08b exige aún acceso y pruebas en Windows 10 Pro 22H2 y Windows 11 Pro 25H2 del inventario; la matriz oficial .NET 10 no incluye el primero. Guest Control recuperado: en la VM Home 22H2 (19045.2965), 8192 MB y ahora 4 vCPU, ambos artefactos autocontenidos arrancan y pasan los 334 tests, sin omitidos. Home solo aporta evidencia preliminar. Compatibilidad Pro por demostrar antes de T09–T20; SDK/framework y tests C# preparados en T08a. Contrato de T07 resuelto: opción A, recorte exterior solo del usuario con reglas exportadas para C#. Inventario confirmado: 12 PCs Windows 10 Pro 22H2 y una Windows 11 Pro 25H2, sin congelador. Compatibilidad y persistencia nativas pendientes de verificar. Revocación: consumo detenido, misma PC/sesión con credencial nueva, encargado/administrador, código local de un uso/10 min y vuelta al estado previo con pausa conservada confirmados (opciones A, ADR-0020/0021/0022, REQ-002-33). Contratos/prueba del asistente y confirmación temporal pendientes. Emergencia: reglas de uso cerradas en ADR-0024 a ADR-0028, con auditoría por cuenta Windows/PC/entrada/salida UTC sin nombre ni motivo; mecanismo, contratos/actor y pruebas pendientes |

## Cómo retomar

1. Lee completos [`AGENTS.md`](AGENTS.md) y este archivo al iniciar un chat o una tarea,
   y al retomar tras una compactación, sin esperar a que el usuario lo pida.
2. Mira la tabla **Ahora** de arriba.
3. Abre el `tasks.md` de la spec en curso y haz **solo** la siguiente tarea sin marcar.
4. En el **mismo commit**:
   - marca la tarea con `[x]` en `tasks.md`;
   - actualiza aquí **Ahora** (siguiente tarea, progreso, fase) y la **Bitácora**.
5. Si algo te bloquea, anótalo en **Bloqueos** y pregunta al mantenedor. No lo rodees.

Para pedírselo a un agente basta con: **"Lee ESTADO.md y continúa con la siguiente tarea."**

## Pendientes del mantenedor

Cosas que no bloquean la tarea actual, pero que alguien tiene que hacer:

- [ ] **Avisos de 5 y 1 min (spec 001, cambio del mantenedor, 2026-10-03), para después de la fase 1 de la 002:** pasan a ser una ventana centrada con sonido, sin botones, que se quita sola a los 5 s y no bloquea el juego (los clics y las teclas siguen llegando). Hay que anotarlo en la spec 001 (REQ-001-24 y el diseño de T48), rehacer el artboard «Aviso» del lienzo del Shell y añadir su tarea.
- [ ] **Spec 002:** ¿los ajustes de la pausa van a «Ajustes del local» del panel? Pregunta 4 del [`tasks.md`](docs/specs/002-pausa-de-sesion/tasks.md); hasta entonces, por la API.
- [ ] **T11 y T37:** repetir las mediciones en el PC servidor del local: un **i3-2120 con 8 GB** (ADR-0016), casi siempre encendido: incluir una prueba larga de memoria. En el equipo de desarrollo ya cumplen (p95 del login 69 ms, `rss` 222 MB; ver [`mediciones.md`](docs/specs/001-cuentas-y-sesiones/mediciones.md)), pero no valen como aprobación.
- [ ] **Spec 003:** resolver las preguntas abiertas de [`spec.md`](docs/specs/003-bloqueo-de-pc/spec.md). Confirmados C#/WebView2/escritorio separado, fase 2 de pausa, mantenimiento remoto solo sin sesión y acceso técnico local de encargado/administrador validado por el nodo. «Bloquear» cierra la sesión y se cierran procesos del cliente sin reiniciar. Evergreen offline; 13 equipos (12 para clientes normalmente), PC de pruebas y VM. Nodo con IP fija/reserva DHCP; mantenimiento continúa sin red y permite salir/bloquear con registro al reconectar. Confirmados 12 equipos Windows 10 Pro 22H2 y uno Windows 11 Pro 25H2, sin congelador; compatibilidad por probar. Revisar el mecanismo de mantenimiento con cuenta Windows existente, recuperación y contratos definitivos.
- [ ] **REQ-001-24:** confirmar el criterio de T07: si una sesión empieza con menos de 1 min, solo se envía el aviso de 1 min (anotado en las preguntas resueltas de la spec 001).
- [ ] **T28a:** confirmar los límites de los ajustes: gracia de latidos entre 30 s y 30 min, sesiones temporales conservadas entre 3 y 100 (la spec solo fija el 3 mínimo y el 3 min por defecto).
- [ ] **T31:** confirmar dos criterios al abrir una sesión temporal: el tope de 24 h por cobro y que la PC deba estar conectada al nodo (si no, se cobraría por una PC que no puede desbloquearse).
- [ ] **T07 (spec 005):** revisar la verificación de la tasa manual (CA-005-06, REQ-001-13) y la forma del Bs: el criterio escribe «3,00 USD (≈ 120,00 Bs)» en una línea, y el panel lo pone debajo del importe, sin paréntesis, como en el diseño.
- [ ] **Cliente Windows:** decidir el ADR [0010](docs/adr/0010-lista-blanca-y-restauracion.md) para la spec 004. ADR-0005 (WebView2) y ADR-0009 (escritorio separado) aceptados por el mantenedor el 2026-10-04; no siguen bloqueando la planificación de la 003.
- [ ] **Plan 003:** revisar [ADR-0017](docs/adr/0017-comunicacion-segura-del-cliente-windows.md) y [ADR-0018](docs/adr/0018-mantenimiento-con-cuenta-windows-existente.md). Host WinForms + WebView2 confirmado en [ADR-0019](docs/adr/0019-host-del-shell-en-winforms.md); SDK/tests/compatibilidad pendientes. El mantenedor eligió reutilizar una cuenta administradora Windows existente; falta aprobar y probar el mecanismo de elevación, custodia y salida. No se ha modificado ninguna cuenta de Windows.
- [ ] **Ajustes en el panel:** ya existe «Ajustes del local» (spec 005, T23b) con el nombre del local y «Permitir vender sin stock». La gracia de latidos y las sesiones temporales conservadas (spec 001) siguen sin pantalla, sin tarea; hasta entonces, por la API (`PUT /settings`).
- [ ] **Spec 005, parte 2:** imprimir en papel el PDF del encargado (se comprobó que se descarga y ocupa una página) y medir REQ-005-71 (una venta en menos de 500 ms) en el i3-2120 del local, con las mediciones de la spec 001. Ver [`mediciones.md`](docs/specs/005-inventario-y-caja/mediciones.md).
- [ ] **Spec 008:** averiguar si el plan de SENET del local incluye acceso a la API y quién tiene las credenciales.
- [ ] **Simulador, `seed`:** `openShift()` envía `POST /shifts` sin los fondos exigidos por la spec 005. Con caja cerrada falla con «Datos no válidos»; para T18 se abrió la caja desde el panel y la preparación terminó. Corregir en una tarea aparte; no forma parte de la pausa.

## Mapa de specs

| Spec | Estado | Progreso |
|---|---|---|
| [001 Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) | Implementada (REQ-001-13, Bs, verificado en T07 de la 005; en revisión) | 69 / 69 |
| [002 Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md) | Fase 1 implementada, verificada y aprobada. Fase 2 pendiente de la spec 003 | 19 / 19 |
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | T01–T07 completos; T08–T20 autorizadas, compatibilidad Windows pendiente; T21–T59 Borrador | 7 / 59 |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | En curso: partes 1 (tasa) y 2 (inventario y caja) aprobadas; parte 2 verificada; parte 1 en revisión (T07); parte 3 en borrador | 41 / 42 |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-08:** el mantenedor informa de que la VM vuelve a estar disponible. Guest Control autenticado funciona; VirtualBox/Guest Additions 7.2.20, Windows 10 Home 22H2 x64 (19045.2965), 8192 MB y ahora 4 vCPU. Ejecutados los artefactos preparados con hashes comprobados: Agent/ShellHost `--check-build` devuelven 0 antes de extraer el SDK portable, sin .NET en PATH; los 334 tests C# pasan, cero fallos/omitidos, con SDK 10.0.401/runtime 10.0.12. Informes JSON/TRX recogidos en `tmp/`, sin instalar servicios ni modificar cuentas, shell, UAC o escritorios. Home conserva alcance preliminar; T08b/T08 abiertas y T09–T20 pendientes de la verificación Pro. Detalle en `mediciones.md`.

- **2026-10-07:** VirtualBox 7.2.20 y Guest Additions accesibles inicialmente; registro/CIM identifican Windows 10 Home 22H2, build 19045.2965, 8192 MB y 2 vCPU. El mantenedor autoriza Home solo para pruebas preliminares. Paquete de artefactos/tests y runner con hashes preparados fuera de Git; ninguna ejecución en invitado completada. Guest Control deja de abrir sesiones, con `VERR_DUPLICATE`, latidos intermitentes y CPU al 100%. Snapshot detenido y cancelado por API, sin snapshot completado; reinicio por Guest Additions falla y apagado ACPI no termina. VM permanece en ejecución. T08b y grupo T08 siguen abiertos; Pro sigue obligatorio y no se avanza a T09–T20. Detalle en `mediciones.md`.

- **2026-10-07:** T08a completa: solución Agent/ShellHost/tests con .NET 10.0.401, WinForms + SDK WebView2, locks de NuGet y scripts del workspace. 333 fixtures T07 coinciden en C#, más cobertura de los 19 contratos: 334 tests nativos; 1 581 tests del workspace en verde. Build sin avisos, publicaciones autocontenidas `win-x64` y arranque de comprobación pasan en desarrollo. Sin instalar servicios, mostrar UI ni cambiar Windows. T08b requiere Windows 10 Pro 22H2 y Windows 11 Pro 25H2 del inventario; VirtualBox Windows 10 aún no está disponible. T08 no se cierra y no se salta a T09–T20. Evidencia en `docs/specs/003-bloqueo-de-pc/mediciones.md`.

- **2026-10-07:** el mantenedor pide continuar autónomamente T08–T20. Se registra el alcance sin aceptar implícitamente ADR-0018 ni omitir los prototipos obligatorios. T08 se divide en herramientas/contratos en desarrollo (T08a) y compatibilidad del inventario (T08b). SDK .NET 10.0.401 y dependencias justificadas en el plan; la matriz oficial no incluye Windows 10 Pro 22H2. El mantenedor instalará pronto VirtualBox con esa versión; aún no hay acceso para validar T08b/T09/T10.

- **2026-10-07:** T07b2 y grupo T07 completos: 333 fixtures compartidos, incluidos recorte Unicode, contraseña intacta, longitudes por puntos de código, límites numéricos, UUIDv7 y UTC. Contratos JSON reproducibles con comprobación de diferencias; la verificación C# queda en T08. Contratos y datos 7/59; siguiente T08 todavía Borrador.

- **2026-10-07:** T07b1 completa: fixtures con resultados esperados explícitos para los 19 contratos. Zod y Ajv comprueban los mismos JSON exportados, sin coerción ni mutación; órdenes/acuses/salida y progreso respetan la frontera del Shell. Matriz Unicode y límites adicionales en T07b2; todavía 6/59.

- **2026-10-07:** T07a completa: 19 contratos versionados v1/v2/puente y normalización explícita de usuario con 25 caracteres ECMAScript, sin tocar password. Build comprueba diferencias con los JSON revisables y copia a dist; conserva rutas v1. Ajv/formatos solo para tests; cuatro pruebas de exportación/recorte y 312 tests shared en verde. T07b fixtures pendiente; grupo sigue 6/59, sin tareas nativas.

- **2026-10-07:** inventario confirmado por el mantenedor: 12 PCs Windows 10 Pro 22H2 y una Windows 11 Pro 25H2; ninguna usa Deep Freeze ni otro congelador. Spec/plan/tasks alineados, sin afirmar compatibilidad nativa. Cerradas las decisiones de uso de emergencia, el mantenedor pide seguir las tareas; se retoma T07 ya autorizado. T08–T59 siguen en Borrador.

- **2026-10-07:** el mantenedor elige B para auditoría de emergencia: cuenta Windows autenticada, PC y entrada/salida UTC automáticas, sin nombre/usuario Pope ni motivo. Registro durable local y envío idempotente al nodo al volver. ADR-0028 y spec/plan/T53/T54 alineados; cuenta compartida no identifica persona ni valida rol Pope. Cero preguntas de uso de emergencia; mecanismo técnico, contratos/actor, persistencia y pruebas pendientes. T53/T54 no completadas, sin cambios de producto ni Windows.

- **2026-10-07:** el mantenedor elige A para alcance de emergencia: Windows completo bajo la cuenta administradora existente para reparar Pope, red, controladores u otros fallos. ADR-0027 y spec/plan/T53/T54 alineados; entorno separado del cliente, WebView2 restringido y cobro en el nodo. Queda una decisión de emergencia: identificación/auditoría; ruta, aislamiento y salida por diseñar/probar. Sin implementar tareas nativas ni modificar Windows.
