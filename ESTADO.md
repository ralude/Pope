# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-02 · movimientos del turno en la caja del panel (T21 de la spec 005)

## Ahora

| | |
|---|---|
| **Spec en curso** | [005 · Inventario y caja](docs/specs/005-inventario-y-caja/spec.md): parte 1 (tasa) en pausa tras T03; parte 2 (inventario, ventas y caja) en curso |
| **Siguiente tarea** | **T22: Abrir y cerrar la caja** ([tasks.md](docs/specs/005-inventario-y-caja/tasks.md)). Orden: T22–T24 (con T23b), T05–T07 |
| **Progreso** | Spec 005: 25 / 32 tareas (parte 1: 4 / 7; parte 2: 21 / 25) |
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
- [ ] **T11 y T37:** repetir las mediciones en el PC servidor del local (i5 de 2ª gen, 8 GB). En el equipo de desarrollo ya cumplen (p95 del login 69 ms, `rss` 222 MB; ver [`mediciones.md`](docs/specs/001-cuentas-y-sesiones/mediciones.md)), pero no valen como aprobación.
- [ ] **Spec 003:** revisar las preguntas abiertas sobre la conexión PC ↔ nodo (cifrado, credencial, pipe, interfaz local, validación en C#).
- [ ] **REQ-001-24:** confirmar el criterio de T07: si una sesión empieza con menos de 1 min, solo se envía el aviso de 1 min (anotado en las preguntas resueltas de la spec 001).
- [ ] **T28a:** confirmar los límites de los ajustes: gracia de latidos entre 30 s y 30 min, sesiones temporales conservadas entre 3 y 100 (la spec solo fija el 3 mínimo y el 3 min por defecto).
- [ ] **T31:** confirmar dos criterios al abrir una sesión temporal: el tope de 24 h por cobro y que la PC deba estar conectada al nodo (si no, se cobraría por una PC que no puede desbloquearse).
- [ ] **REQ-001-13:** el equivalente en Bs espera a la tasa BCV de la spec 005. El mantenedor decidió (2026-10-02) adelantar la **tasa manual** (REQ-005-34): falta preparar sus requisitos, plan y tareas para aprobarlos. El Shell y el panel ya muestran Bs en cuanto el nodo mande una tasa.
- [ ] **Antes de la spec 003:** decidir los ADR propuestos [0005](docs/adr/0005-shell-react-en-webview2.md), [0009](docs/adr/0009-escritorio-separado-para-bloqueo-y-pausa.md) y [0010](docs/adr/0010-lista-blanca-y-restauracion.md) (cliente Windows).
- [ ] **Ajustes en el panel:** la spec dice que el administrador cambia desde el panel la gracia de latidos y las sesiones temporales conservadas, pero no hay tarea; se decidió dejarlo fuera de la fase 8. Hasta entonces, por la API (`PUT /settings`).
- [ ] **Test inestable con PostgreSQL real:** `no-heartbeat.e2e.test.ts` › «si la PC nunca supo de la sesión…» cierra la PC y abre una temporal en ella; como abrir exige la PC conectada (T31), con PostgreSQL real el nodo ya vio la desconexión y responde 409 (con PGlite pasa). Falla igual antes de la fase 8; hay que rehacer el test para que la PC pierda el `state` sin estar desconectada al abrir.
- [ ] **Spec 008:** averiguar si el plan de SENET del local incluye acceso a la API y quién tiene las credenciales.

## Mapa de specs

| Spec | Estado | Progreso |
|---|---|---|
| [001 Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) | Implementada (salvo REQ-001-13, Bs) | 68 / 68 |
| [002 Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md) | Aprobada · plan aprobado · faltan sus tareas | — |
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | Borrador | — |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | En curso: partes 1 (tasa) y 2 (inventario y caja) aprobadas; parte 3 en borrador | 25 / 32 |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-02:** T21 (spec 005): lista de movimientos de la caja con los totales por grupo, en vivo, y «Anular» con motivo para el administrador; probada en Chrome (CA-005-11).
- **2026-10-02:** T20b (spec 005): cobro en la Caja con un método o «Dividir pago», el importe en Bs con la tasa y la cuenta que paga con su saldo; probado en Chrome (CA-005-07 y CA-005-10).
- **2026-10-02:** T20a (spec 005): pantalla Caja con el catálogo (golosinas con foto y disponibles, otras ventas con cantidad y precio) y la venta nueva con su total en USD y Bs. T20 se divide en dos (T20b: el cobro, con «Dividir pago», decidido por el mantenedor).
- **2026-10-02:** T19 (spec 005): pestaña «Otras ventas» en Inventario con los conceptos sin inventario; el administrador los da de alta y edita. Probado en Chrome con «Impresiones» a 0,10 USD.
- **2026-10-02:** T18b (spec 005): modal «Nuevo producto» y «Editar» con la foto reducida en el navegador a WebP de 512 px; probado en Chrome (CA-005-08).
- **2026-10-02:** T18a (spec 005): página Inventario con buscador, estado de cada producto, detalle con sus movimientos y entrada, ajuste y merma; se refresca sola con el aviso `cash`. Probada en Chrome. T18 se divide en dos (T18b: alta y edición con foto).
- **2026-10-02:** T04 (spec 005): píldora de la tasa en la barra superior (vigente, sin tasa o desactualizada) y diálogo «Tasa del día» para el encargado y el administrador; probado en Chrome con dos pestañas a la vez.
- **2026-10-02:** T17 (spec 005): reportes del cierre en PDF con `pdfkit`: resumen de una página (lo vendido por grupo, lo pagado con saldo, la tasa y el cuadre por método) y detallado (movimientos, anulaciones y stock por producto). Termina la fase 2 (nodo); probada también contra PostgreSQL real.
- **2026-10-02:** T16b (spec 005): el nombre del local es un ajuste de texto (`localName`, por defecto "Pope") que cambia el administrador; `setting.changed` pasa a la versión 2 con valores de número o de texto.
- **2026-10-02:** T16a (spec 005): la caja se abre con fondo en USD y Bs y se cierra con lo contado por método; el nodo guarda lo esperado y da la diferencia (CA-005-03), con eventos v2; `GET /shifts/current/closing` y el historial `GET /shifts`. Hasta T22, el panel no puede abrir ni cerrar la caja (no envía fondo ni conteo).
