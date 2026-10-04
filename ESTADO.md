# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-04 · inicio del plan 003 por petición del mantenedor

## Ahora

| | |
|---|---|
| **Spec en curso** | [003 · Arranque y bloqueo de PC](docs/specs/003-bloqueo-de-pc/spec.md), spec y [plan inicial](docs/specs/003-bloqueo-de-pc/plan.md) en Borrador; incluye la fase 2 de la pausa. La 005 espera la revisión de T07 |
| **Siguiente tarea** | Resolver las preguntas de la spec 003, revisar la propuesta de seguridad y aprobar la spec antes de aprobar el plan. Los avisos de 5 y 1 min quedan conservados como pendiente |
| **Progreso** | Spec 003: documentación inicial, sin tareas de implementación aprobadas. Spec 002: 19 / 19 tareas (fase 1). Spec 005: 41 / 42 |
| **Bloqueos** | Para cerrar el plan: versiones/ediciones exactas de Windows, congelador y decisiones abiertas; hay PC de pruebas y VM. No se implementa sobre propuestas sin aprobar |

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
- [ ] **Spec 003:** resolver las preguntas abiertas de [`spec.md`](docs/specs/003-bloqueo-de-pc/spec.md). Confirmados C#/WebView2/escritorio separado, fase 2 de pausa, mantenimiento remoto solo sin sesión y acceso técnico local de encargado/administrador validado por el nodo. «Bloquear» cierra la sesión y se cierran procesos del cliente sin reiniciar. Evergreen offline; 13 equipos (12 para clientes normalmente), PC de pruebas y VM. Nodo con IP fija/reserva DHCP; mantenimiento continúa sin red y permite salir/bloquear con registro al reconectar. Windows 10 22H2 y una PC Windows 11 son tentativos; versiones/ediciones y congelador pendientes. Revisar alternativas de identidad administradora, recuperación y contratos definitivos.
- [ ] **REQ-001-24:** confirmar el criterio de T07: si una sesión empieza con menos de 1 min, solo se envía el aviso de 1 min (anotado en las preguntas resueltas de la spec 001).
- [ ] **T28a:** confirmar los límites de los ajustes: gracia de latidos entre 30 s y 30 min, sesiones temporales conservadas entre 3 y 100 (la spec solo fija el 3 mínimo y el 3 min por defecto).
- [ ] **T31:** confirmar dos criterios al abrir una sesión temporal: el tope de 24 h por cobro y que la PC deba estar conectada al nodo (si no, se cobraría por una PC que no puede desbloquearse).
- [ ] **T07 (spec 005):** revisar la verificación de la tasa manual (CA-005-06, REQ-001-13) y la forma del Bs: el criterio escribe «3,00 USD (≈ 120,00 Bs)» en una línea, y el panel lo pone debajo del importe, sin paréntesis, como en el diseño.
- [ ] **Cliente Windows:** decidir el ADR [0010](docs/adr/0010-lista-blanca-y-restauracion.md) para la spec 004. ADR-0005 (WebView2) y ADR-0009 (escritorio separado) aceptados por el mantenedor el 2026-10-04; no siguen bloqueando la planificación de la 003.
- [ ] **Plan 003:** revisar [ADR-0017](docs/adr/0017-comunicacion-segura-del-cliente-windows.md), propuesto a petición del mantenedor, y las alternativas de mantenimiento de [`plan.md`](docs/specs/003-bloqueo-de-pc/plan.md). No se ha elegido ni creado una cuenta administradora de Windows.
- [ ] **Ajustes en el panel:** ya existe «Ajustes del local» (spec 005, T23b) con el nombre del local y «Permitir vender sin stock». La gracia de latidos y las sesiones temporales conservadas (spec 001) siguen sin pantalla, sin tarea; hasta entonces, por la API (`PUT /settings`).
- [ ] **Spec 005, parte 2:** imprimir en papel el PDF del encargado (se comprobó que se descarga y ocupa una página) y medir REQ-005-71 (una venta en menos de 500 ms) en el i3-2120 del local, con las mediciones de la spec 001. Ver [`mediciones.md`](docs/specs/005-inventario-y-caja/mediciones.md).
- [ ] **Spec 008:** averiguar si el plan de SENET del local incluye acceso a la API y quién tiene las credenciales.
- [ ] **Simulador, `seed`:** `openShift()` envía `POST /shifts` sin los fondos exigidos por la spec 005. Con caja cerrada falla con «Datos no válidos»; para T18 se abrió la caja desde el panel y la preparación terminó. Corregir en una tarea aparte; no forma parte de la pausa.

## Mapa de specs

| Spec | Estado | Progreso |
|---|---|---|
| [001 Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) | Implementada (REQ-001-13, Bs, verificado en T07 de la 005; en revisión) | 69 / 69 |
| [002 Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md) | Fase 1 implementada, verificada y aprobada. Fase 2 pendiente de la spec 003 | 19 / 19 |
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | Spec en Borrador; plan inicial solicitado, preguntas en curso | — |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | En curso: partes 1 (tasa) y 2 (inventario y caja) aprobadas; parte 2 verificada; parte 1 en revisión (T07); parte 3 en borrador | 41 / 42 |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-04:** el mantenedor prioriza el plan 003 con C#/WebView2, escritorio separado y fase 2 de pausa. Acuerdos de cierre, roles, Evergreen, 13 PCs, entorno de pruebas, nodo fijo y mantenimiento sin red en la spec. `plan.md` creado según la plantilla y ADR-0017 propuesto; se comparan cuentas Windows sin elegir una. Windows/congelador y otras preguntas pendientes; spec/plan en Borrador, sin código ni tareas de implementación.
- **2026-10-04:** el mantenedor aprueba T19 y el cierre de la fase 1 de la spec 002: 19/19 tareas terminadas. Informe y límites en `mediciones.md`; fase 2 pendiente de la spec 003. Siguiente paso: definir los avisos de 5 y 1 min ya pedidos.
- **2026-10-04:** T19 (spec 002) preparada para revisión: criterios en `mediciones.md`; 852 tests sin caché y 372 con PostgreSQL real en verde. Pruebas del Shell y del panel con pausa, confirmación, vencimiento, reanudación y cierre. La fase 2 queda pendiente; T19 no se marca hasta la revisión del mantenedor.
- **2026-10-04:** T51a (spec 001), autorizada por el mantenedor: corregido el test que abría una temporal con la PC desconectada; ahora descarta el estado inicial con la PC conectada. Los 10 tests de `no-heartbeat` pasan con ambos motores; batería completa sin caché en verde. Se retira el pendiente de ese test.
- **2026-10-04:** T18 (spec 002): `pausa N`, `reanuda N` y pausa en `estado` del simulador, con la cuenta detenida hasta que el nodo indique cobro; probado con tres PCs en el mapa y un corte de red. Queda T19; el mantenedor autoriza corregir antes el test previo de `no-heartbeat` en un commit aparte.
- **2026-10-04:** configuración de Codex del proyecto para leer AGENTS.md y ESTADO.md por defecto al iniciar un chat o tarea y al retomar tras una compactación. La siguiente tarea sigue siendo T18 de la spec 002.
- **2026-10-03:** T17 (spec 002): el Shell muestra la pantalla de pausa (y su variante vencida) y reanuda con «¿Eres juan?»; probado en Chrome (CA-002-03). Termina la fase del Shell.
- **2026-10-03:** T16 (spec 002): el Shell tiene el botón Pausar (apagado con su motivo si no quedan pausas) y la confirmación del diseño; probado en Chrome.
- **2026-10-03:** Spec 002: el `state` de la PC lleva también la duración máxima de la pausa, para la confirmación del Shell (decisión del mantenedor antes de T16).
- **2026-10-03:** T15 (spec 002): el Shell pausa y reanuda por el canal y, en una pausa que no cobra, su tiempo no baja; la pausa cuenta hacia atrás desde lo que dice el nodo.
