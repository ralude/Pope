# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-07 · T07a exportación y normalización completas; siguiente T07b fixtures

## Ahora

| | |
|---|---|
| **Spec en curso** | [003 · Arranque y bloqueo de PC](docs/specs/003-bloqueo-de-pc/spec.md): Contratos y datos T01–T06 completos; T07a completa; T07b fixtures pendiente; resto de [plan/tasks](docs/specs/003-bloqueo-de-pc/tasks.md) en Borrador. La 005 espera T07 |
| **Siguiente tarea** | T07b: fixtures válidos/inválidos compartidos y compatibilidad de fronteras. T07a ya exporta contratos y normalización |
| **Progreso** | Spec 003: 6 / 59 grupos; T01–T06 completas, incluidas T02a/b/c y T05a/b; T07a completa, T07b pendiente; resto Borrador. Spec 002: 19 / 19 tareas (fase 1), fase 2 en tasks 003. Spec 005: 41 / 42 |
| **Bloqueos** | Contrato de T07 resuelto: opción A, recorte exterior solo del usuario con reglas exportadas para C#. Inventario confirmado: 12 PCs Windows 10 Pro 22H2 y una Windows 11 Pro 25H2, sin congelador. Compatibilidad/herramientas y persistencia nativas pendientes de verificar. Revocación: consumo detenido, misma PC/sesión con credencial nueva, encargado/administrador, código local de un uso/10 min y vuelta al estado previo con pausa conservada confirmados (opciones A, ADR-0020/0021/0022, REQ-002-33). Contratos/prueba del asistente y confirmación temporal pendientes. Emergencia: reglas de uso cerradas en ADR-0024 a ADR-0028, con auditoría por cuenta Windows/PC/entrada/salida UTC sin nombre ni motivo; mecanismo, contratos/actor y pruebas pendientes |

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
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | Contratos y datos T01–T06 completos; T07a completa, T07b pendiente; resto Borrador | 6 / 59 |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | En curso: partes 1 (tasa) y 2 (inventario y caja) aprobadas; parte 2 verificada; parte 1 en revisión (T07); parte 3 en borrador | 41 / 42 |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-07:** T07a completa: 19 contratos versionados v1/v2/puente y normalización explícita de usuario con 25 caracteres ECMAScript, sin tocar password. Build comprueba diferencias con los JSON revisables y copia a dist; conserva rutas v1. Ajv/formatos solo para tests; cuatro pruebas de exportación/recorte y 312 tests shared en verde. T07b fixtures pendiente; grupo sigue 6/59, sin tareas nativas.

- **2026-10-07:** inventario confirmado por el mantenedor: 12 PCs Windows 10 Pro 22H2 y una Windows 11 Pro 25H2; ninguna usa Deep Freeze ni otro congelador. Spec/plan/tasks alineados, sin afirmar compatibilidad nativa. Cerradas las decisiones de uso de emergencia, el mantenedor pide seguir las tareas; se retoma T07 ya autorizado. T08–T59 siguen en Borrador.

- **2026-10-07:** el mantenedor elige B para auditoría de emergencia: cuenta Windows autenticada, PC y entrada/salida UTC automáticas, sin nombre/usuario Pope ni motivo. Registro durable local y envío idempotente al nodo al volver. ADR-0028 y spec/plan/T53/T54 alineados; cuenta compartida no identifica persona ni valida rol Pope. Cero preguntas de uso de emergencia; mecanismo técnico, contratos/actor, persistencia y pruebas pendientes. T53/T54 no completadas, sin cambios de producto ni Windows.

- **2026-10-07:** el mantenedor elige A para alcance de emergencia: Windows completo bajo la cuenta administradora existente para reparar Pope, red, controladores u otros fallos. ADR-0027 y spec/plan/T53/T54 alineados; entorno separado del cliente, WebView2 restringido y cobro en el nodo. Queda una decisión de emergencia: identificación/auditoría; ruta, aislamiento y salida por diseñar/probar. Sin implementar tareas nativas ni modificar Windows.

- **2026-10-07:** el mantenedor elige B para permisos de emergencia: administrador y encargado pueden usar las credenciales Windows presencialmente. ADR-0026 y spec/plan/T53/T54 alineados. Windows valida la cuenta local; no se presume validado un rol vigente de Pope sin nodo. Quedan dos decisiones de emergencia: alcance e identificación/auditoría; mecanismo por diseñar/probar. Sin implementar tareas nativas ni cambiar cuentas.

- **2026-10-07:** el mantenedor elige A para autenticación de emergencia: credenciales de la cuenta administradora local Windows existente introducidas físicamente, validadas por Windows sin nodo ni servicio. ADR-0025 y spec/plan/T53/T54 alineados; complementa presencia física de ADR-0024. Quién puede usarla, alcance e identificación/auditoría por decidir; ruta administrativa por diseñar/probar. Sin aprobar ADR-0018 ni implementar tareas nativas.

- **2026-10-07:** el mantenedor elige A para emergencia: presencia física obligatoria delante de la PC e intervención local de una persona autorizada; sin entrada remota de emergencia. ADR-0024 y spec/plan/T53/T54 alineados. Autenticación, permisos, alcance, comprobación local y auditoría pendientes; mecanismo sin aprobar, sin implementación ni cambios de cuentas. Continúa la revisión una por una.

- **2026-10-07:** el mantenedor confirma Alt+Tab permitido con sesión temporal/de cuenta, también con Pope en primer plano, e inhibido solo sin sesión. ADR-0023, REQ-003-30/CA-003-12 y T09/T21/T25/T56/T59 alineados. Pausa/revocación mantienen escritorio separado: atajo habilitado no permite volver al juego sin autorización. Sin Explorer; selector y juegos/anticheat pendientes de prueba. No se aprueban ni implementan tareas nativas.

- **2026-10-07:** el mantenedor elige A para el estado al recuperar la PC: activa vuelve activa; pausada vuelve pausada conservando el tiempo restante y los contadores durante el bloqueo confirmado, sin otra pausa. REQ-002-33/CA-002-09 añadidos a spec 002 y vinculados a T34/revisión T59 de la 003. Specs/plans/tasks alineados; excepción sin implementar/verificar, fase 1 de 002 mantiene sus 19 tareas aprobadas. Confirmación temporal y contratos siguen pendientes.

- **2026-10-07:** el mantenedor elige A para entregar la autorización de recuperación: código ligado a la PC revocada, un uso, 10 min, generado por encargado/administrador e introducido físicamente en el asistente. Credencial nueva solo bajo custodia del servicio, por TLS con el nodo; sin desbloqueo ni mantenimiento automático. ADR-0022, spec/plan/T34 alineados. Contratos/prototipo pendientes; T12 conserva sus condiciones. Continúa la revisión de preguntas.
