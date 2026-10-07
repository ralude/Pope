# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-07 · host WinForms + WebView2 confirmado (opción A); continúa la revisión de decisiones

## Ahora

| | |
|---|---|
| **Spec en curso** | [003 · Arranque y bloqueo de PC](docs/specs/003-bloqueo-de-pc/spec.md): Contratos y datos T01–T06 completos; T07 con contrato confirmado, pendiente de implementación; resto de [plan/tasks](docs/specs/003-bloqueo-de-pc/tasks.md) en Borrador. La 005 espera T07 |
| **Siguiente tarea** | T07: exportar protocolo, reglas exactas de recorte del usuario y fixtures. En este chat el mantenedor está resolviendo las preguntas una por una |
| **Progreso** | Spec 003: 6 / 59 grupos; T01–T06 completas, incluidas T02a/b/c y T05a/b; T07 pendiente de implementación; resto Borrador. Spec 002: 19 / 19 tareas (fase 1), fase 2 en tasks 003. Spec 005: 41 / 42 |
| **Bloqueos** | Contrato de T07 resuelto: opción A, recorte exterior solo del usuario con reglas exportadas para C#. Inventario Windows pospuesto por el mantenedor (opción B, 2026-10-07), obligatorio antes de fijar herramientas/compatibilidad y tareas nativas dependientes. Cobro/recuperación de revocación y emergencia pendientes para tareas posteriores |

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
- [ ] **Spec 003:** resolver las preguntas abiertas de [`spec.md`](docs/specs/003-bloqueo-de-pc/spec.md). Confirmados C#/WebView2/escritorio separado, fase 2 de pausa, mantenimiento remoto solo sin sesión y acceso técnico local de encargado/administrador validado por el nodo. «Bloquear» cierra la sesión y se cierran procesos del cliente sin reiniciar. Evergreen offline; 13 equipos (12 para clientes normalmente), PC de pruebas y VM. Nodo con IP fija/reserva DHCP; mantenimiento continúa sin red y permite salir/bloquear con registro al reconectar. Windows 10 22H2 y una PC Windows 11 son tentativos; versiones/ediciones y congelador pendientes. Revisar el mecanismo de mantenimiento con cuenta Windows existente, recuperación y contratos definitivos.
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
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | Contratos y datos T01–T06 completos; contrato de T07 confirmado, implementación pendiente; resto Borrador | 6 / 59 |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | En curso: partes 1 (tasa) y 2 (inventario y caja) aprobadas; parte 2 verificada; parte 1 en revisión (T07); parte 3 en borrador | 41 / 42 |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-07:** el mantenedor elige A para el host: WinForms + WebView2, con React a pantalla completa y C# mínimo. ADR-0019 aceptado, spec/plan/T08 alineados; no se aprueban ni ejecutan tareas nativas. Inventario Windows, SDK/tests y prototipo T09 siguen pendientes. Continúa la revisión de preguntas una por una.

- **2026-10-07:** el mantenedor elige B para el inventario Windows: dejar versiones/ediciones pendientes y continuar resolviendo decisiones de diseño. Los datos tentativos no se consideran confirmados; T08 sigue en Borrador y la compatibilidad no está verificada. Siguiente punto de revisión: base del host del Shell.

- **2026-10-07:** el mantenedor resuelve la normalización de T07 con la opción A: conservar recorte exterior del usuario antes de validar, exportar reglas/caracteres exactos para C# y fixtures compartidos, sin modificar contraseñas. Spec/plan/tasks actualizados; T07 sin implementar. Se continúa resolviendo preguntas una por una.

- **2026-10-07:** registrada la indicación explícita del mantenedor de dejar T07 pendiente hasta revisar el contrato de normalización del usuario. Spec/tasks reflejan la suspensión de esa tarea; T01–T06 están completas (6/59 grupos) y la 005 sigue esperando T07. Sin cambios al protocolo exportado.

- **2026-10-07:** T06 completada: migración 0028 para el único fondo global, revisión y autoría, sin bytes/rutas en la base de datos. Cuatro pruebas de upgrade/límites/retirada/reaplicación pasan en ambos motores; 909 tests del monorepo (391 del servidor en PostgreSQL temporal real), formato, lint, tipos y build pasan. T07 queda pendiente por indicación del mantenedor hasta revisar el contrato de normalización del usuario; T08–T59 continúan en Borrador.

- **2026-10-07:** T05b completa T05: migración 0027 para mantenimiento confirmado/salida idempotente e intentos técnicos por cuenta. Cinco pruebas de upgrade, restricciones y concurrencia pasan en PGlite; 905 tests del monorepo, incluidos 387 del servidor en PostgreSQL temporal real, formato, lint, tipos y build pasan. Siguiente T06; sin mecanismo elevado ni cambios de Windows.

- **2026-10-07:** T05a completada: migración 0026, cuatro pruebas de upgrade/restricciones/reserva concurrente en PGlite y PostgreSQL temporal real; 900 tests del monorepo (382 del servidor en PGlite), formato, lint, tipos y build pasan. Ejecutores limitados por CLI a dos workers; la variable de entorno no aplica ese límite. T05b es la siguiente. El mantenedor pide continuar hasta T07 y después indica dejar T07 pendiente hasta revisar la normalización del usuario; se continúa hasta T06.

- **2026-10-06:** README reescrito tomando Cullen como referencia de presentación: problema del local, operación, decisiones técnicas, arquitectura, evidencia, arranque y documentación. Distingue capacidades implementadas de Windows/nube pendientes y conserva los límites de las mediciones. Sin cambios de código ni avance de specs; siguiente T05 de la 003.
- **2026-10-05:** T04 completada: migración 0025 y seis tests de registro/upgrade/concurrencia. 896 tests del monorepo pasan, incluidos 378 del servidor en PGlite; los 378 también pasan en PostgreSQL temporal real. Formato, lint, tipos y build pasan. Se redujo el paralelismo del ejecutor a dos workers sin cambiar límites de tests ni requisitos. Registro/auth efectivos quedan en T12/T13; siguiente T05.
- **2026-10-04:** T03: fondo global con SHA-256, WebP/bytes/dimensiones, revisión y actor; aviso v2 sin imagen ni rutas y progreso solo local. Entrada 10 000 000 bytes/40 millones de píxeles y salida 2 000 000 bytes/1920×1080 confirmados. 890 tests (308 shared), formato, lint, tipos y build pasan; no se decodifican/suben imágenes ni se implementan endpoints aún. Siguiente T04.
