# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-03 · T06 de la spec 002 (pausar y reanudar sin cobrar la pausa)

## Ahora

| | |
|---|---|
| **Spec en curso** | [002 · Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md), fase 1 (todo en TypeScript). La 005 espera la revisión de T07 |
| **Siguiente tarea** | **T07: Límites de pausas por sesión y por día** (spec 002, [`tasks.md`](docs/specs/002-pausa-de-sesion/tasks.md)) |
| **Progreso** | Spec 002: 6 / 19 tareas (fase 1). Spec 005: 41 / 42 (falta la revisión de T07) |
| **Bloqueos** | Ninguno |

## Cómo retomar

1. Lee [`AGENTS.md`](AGENTS.md): son las reglas del proyecto.
2. Mira la tabla **Ahora** de arriba.
3. Abre el `tasks.md` de la spec en curso y haz **solo** la siguiente tarea sin marcar.
4. En el **mismo commit**:
   - marca la tarea con `[x]` en `tasks.md`;
   - actualiza aquí **Ahora** (siguiente tarea, progreso, fase) y la **Bitácora**.
5. Si algo te bloquea, anótalo en **Bloqueos** y pregunta al mantenedor. No lo rodees.

Para pedírselo a un agente basta con: **"Lee ESTADO.md y continúa con la siguiente tarea."**

## Pendientes del mantenedor

Cosas que no bloquean la tarea actual, pero que alguien tiene que hacer:

- [ ] **Spec 002:** ¿los ajustes de la pausa van a «Ajustes del local» del panel? Pregunta 4 del [`tasks.md`](docs/specs/002-pausa-de-sesion/tasks.md); hasta entonces, por la API.
- [ ] **T11 y T37:** repetir las mediciones en el PC servidor del local: un **i3-2120 con 8 GB** (ADR-0016), casi siempre encendido: incluir una prueba larga de memoria. En el equipo de desarrollo ya cumplen (p95 del login 69 ms, `rss` 222 MB; ver [`mediciones.md`](docs/specs/001-cuentas-y-sesiones/mediciones.md)), pero no valen como aprobación.
- [ ] **Spec 003:** revisar las preguntas abiertas sobre la conexión PC ↔ nodo (cifrado, credencial, pipe, interfaz local, validación en C#).
- [ ] **REQ-001-24:** confirmar el criterio de T07: si una sesión empieza con menos de 1 min, solo se envía el aviso de 1 min (anotado en las preguntas resueltas de la spec 001).
- [ ] **T28a:** confirmar los límites de los ajustes: gracia de latidos entre 30 s y 30 min, sesiones temporales conservadas entre 3 y 100 (la spec solo fija el 3 mínimo y el 3 min por defecto).
- [ ] **T31:** confirmar dos criterios al abrir una sesión temporal: el tope de 24 h por cobro y que la PC deba estar conectada al nodo (si no, se cobraría por una PC que no puede desbloquearse).
- [ ] **T07 (spec 005):** revisar la verificación de la tasa manual (CA-005-06, REQ-001-13) y la forma del Bs: el criterio escribe «3,00 USD (≈ 120,00 Bs)» en una línea, y el panel lo pone debajo del importe, sin paréntesis, como en el diseño.
- [ ] **Antes de la spec 003:** decidir los ADR propuestos [0005](docs/adr/0005-shell-react-en-webview2.md), [0009](docs/adr/0009-escritorio-separado-para-bloqueo-y-pausa.md) y [0010](docs/adr/0010-lista-blanca-y-restauracion.md) (cliente Windows).
- [ ] **Ajustes en el panel:** ya existe «Ajustes del local» (spec 005, T23b) con el nombre del local y «Permitir vender sin stock». La gracia de latidos y las sesiones temporales conservadas (spec 001) siguen sin pantalla, sin tarea; hasta entonces, por la API (`PUT /settings`).
- [ ] **Test inestable con PostgreSQL real:** `no-heartbeat.e2e.test.ts` › «si la PC nunca supo de la sesión…» cierra la PC y abre una temporal en ella; como abrir exige la PC conectada (T31), con PostgreSQL real el nodo ya vio la desconexión y responde 409 (con PGlite pasa). Falla igual antes de la fase 8; hay que rehacer el test para que la PC pierda el `state` sin estar desconectada al abrir.
- [ ] **Spec 005, parte 2:** imprimir en papel el PDF del encargado (se comprobó que se descarga y ocupa una página) y medir REQ-005-71 (una venta en menos de 500 ms) en el i3-2120 del local, con las mediciones de la spec 001. Ver [`mediciones.md`](docs/specs/005-inventario-y-caja/mediciones.md).
- [ ] **Spec 008:** averiguar si el plan de SENET del local incluye acceso a la API y quién tiene las credenciales.

## Mapa de specs

| Spec | Estado | Progreso |
|---|---|---|
| [001 Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) | Implementada (REQ-001-13, Bs, verificado en T07 de la 005; en revisión) | 68 / 68 |
| [002 Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md) | En curso: fase 1 (tareas aprobadas) | 6 / 19 |
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | Borrador | — |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | En curso: partes 1 (tasa) y 2 (inventario y caja) aprobadas; parte 2 verificada; parte 1 en revisión (T07); parte 3 en borrador | 41 / 42 |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-03:** T06 (spec 002): la PC pausa y reanuda; mientras la pausa no cobra no se cobra nada (latido, compra, cambio de tasa, cierre) ni se avisa; las temporales no pausan. CA-002-01 y CA-002-07 con test e2e.
- **2026-10-03:** T05 (spec 002): tabla `session_pauses` (migración 0024), con una sola pausa abierta por sesión y sus índices para contar las de la sesión y las del día.
- **2026-10-03:** T04 (spec 002): eventos `session.paused` (con su número y `maxUntil`), `session.resumed` (lo no cobrado; quién, en el actor) y `session.pause_expired`, según lo que decidió el mantenedor. Termina la fase de contratos.
- **2026-10-03:** T03 (spec 002): el canal de la PC admite `pause` y `resume`; el `state` lleva la pausa, las pausas que quedan y el límite; error `pause_unavailable`, motivo de cierre `pause_expired` («Se venció la pausa», mantenedor) y la pausa en el mapa del panel.
- **2026-10-03:** T02 (spec 002): reglas puras de la pausa (pausas que quedan y su límite, motivos de rechazo con sus textos, duración y pausas del día en Caracas). El mantenedor fija los textos que faltaban y que manda el límite del día.
- **2026-10-03:** T01 (spec 002): los cinco ajustes de la pausa (activada, 15 min, 3 por sesión, 5 por día y volver a cobrar al vencer), con sus límites; se cambian con `PUT /settings` y emiten `setting.changed` v2.
- **2026-10-03:** Spec 002: el mantenedor aprueba las tareas de la fase 1 y decide: `pauseLimit` en el `state` para elegir el mensaje, el botón Pausar desactivado y con mensaje si la pausa está apagada, y `pauseEnabled` como 1/0. Queda abierto si sus ajustes van al panel.
- **2026-10-03:** Spec 002: `tasks.md` de la fase 1 (T01–T19: contratos, nodo, panel, Shell, simulador y verificación), con cuatro preguntas para el mantenedor; pendiente de aprobar.
- **2026-10-03:** T07 (spec 005): CA-005-06 probado en Chrome con una base nueva sin tasa: al guardar 40,00 en el panel, el panel y el Shell muestran el Bs al momento y queda `exchange_rate.set` con el administrador y la fuente `manual`; REQ-001-13 marcado en la spec 001. Falta la revisión del mantenedor.
- **2026-10-03:** T06 (spec 005): el equivalente en Bs en Tarifas, Combos (lista y editor) y el diálogo de sesión temporal; probado en Chrome con tasa y sin tasa.
