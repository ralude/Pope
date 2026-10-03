# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-03 · verificación de la parte 1 de la spec 005 (T07, en revisión)

## Ahora

| | |
|---|---|
| **Spec en curso** | [005 · Inventario y caja](docs/specs/005-inventario-y-caja/spec.md): parte 1 (tasa) en verificación; parte 2 (inventario, ventas y caja) verificada |
| **Siguiente tarea** | **T07: Verificación de la parte 1** (spec 005), en revisión del mantenedor: CA-005-06 probado en el panel y el Shell, ver [mediciones.md](docs/specs/005-inventario-y-caja/mediciones.md). Después, el `tasks.md` de la spec 002 |
| **Progreso** | Spec 005: 41 / 42 tareas (parte 1: 6 / 7; parte 2: 35 / 35) |
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

- [ ] **Spec 002:** escribir su `tasks.md` (fase 1) a partir del plan aprobado, al terminar la tasa manual de la 005.
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
| [002 Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md) | Aprobada · plan aprobado · faltan sus tareas | — |
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | Borrador | — |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | En curso: partes 1 (tasa) y 2 (inventario y caja) aprobadas; parte 2 verificada; parte 1 en revisión (T07); parte 3 en borrador | 41 / 42 |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-03:** T07 (spec 005): CA-005-06 probado en Chrome con una base nueva sin tasa: al guardar 40,00 en el panel, el panel y el Shell muestran el Bs al momento y queda `exchange_rate.set` con el administrador y la fuente `manual`; REQ-001-13 marcado en la spec 001. Falta la revisión del mantenedor.
- **2026-10-03:** T06 (spec 005): el equivalente en Bs en Tarifas, Combos (lista y editor) y el diálogo de sesión temporal; probado en Chrome con tasa y sin tasa.
- **2026-10-03:** T05 (spec 005): el equivalente en Bs, debajo del importe, en el detalle de la PC del mapa, Clientes, Recargar saldo y Vender combo; probado en Chrome con tasa.
- **2026-10-03:** ADR-0016 aceptado: el servidor del local es un i3-2120 con 8 GB, casi siempre encendido (no el i5 de ADR-0011, que queda reemplazado). Se mantiene el presupuesto; las mediciones pendientes se hacen en ese PC, con una prueba larga de memoria.
- **2026-10-03:** T24 (spec 005) aprobada por el mantenedor: la parte 2 (inventario, ventas y caja) queda verificada. Siguen T05–T07 de la parte 1.
- **2026-10-03:** T24 (spec 005) rehecha tras los cambios del día: los 10 criterios de la parte 2 (con el CA-005-07 nuevo y los CA-005-12 y CA-005-13) tienen test automático y prueba a mano; falta la revisión del mantenedor.
- **2026-10-03:** T31 (spec 005): la Caja muestra los movimientos en una tabla como la de SENET, con los ingresos del día, la apertura, el informe X y «Cerrar caja (informe Z)»; probada en Chrome (CA-005-12).
- **2026-10-03:** T30 (spec 005): informe X, el PDF del encargado de la caja abierta con lo esperado, sin cerrarla.
- **2026-10-03:** T29 (spec 005): cada movimiento de la caja lleva la cuenta del cliente y, las ventas, sus líneas; la migración 0023 rellena la cuenta en los cobros anteriores.
- **2026-10-03:** T28b (spec 005): el nodo deja los conceptos; la migración 0022 convierte sus líneas en otros ingresos y borra la tabla.
