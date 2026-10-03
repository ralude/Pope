# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-03 · T26 de la spec 005 (ventas con otro ingreso en el nodo)

## Ahora

| | |
|---|---|
| **Spec en curso** | [005 · Inventario y caja](docs/specs/005-inventario-y-caja/spec.md): parte 1 (tasa) en pausa tras T04; parte 2 (inventario, ventas y caja) en curso |
| **Siguiente tarea** | **T27: Caja: otro ingreso** (cambios del 2026-10-03: T25 a T31). Después, rehacer **T24** (verificación de la parte 2) y luego T05–T07 |
| **Progreso** | Spec 005: 32 / 42 tareas (parte 1: 4 / 7; parte 2: 28 / 35) |
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
- [ ] **REQ-001-13:** el equivalente en Bs: la tasa manual (spec 005, parte 1) ya funciona y el Shell la muestra; faltan las pantallas del panel (T05 y T06) y la verificación (T07).
- [ ] **Antes de la spec 003:** decidir los ADR propuestos [0005](docs/adr/0005-shell-react-en-webview2.md), [0009](docs/adr/0009-escritorio-separado-para-bloqueo-y-pausa.md) y [0010](docs/adr/0010-lista-blanca-y-restauracion.md) (cliente Windows).
- [ ] **Ajustes en el panel:** ya existe «Ajustes del local» (spec 005, T23b) con el nombre del local y «Permitir vender sin stock». La gracia de latidos y las sesiones temporales conservadas (spec 001) siguen sin pantalla, sin tarea; hasta entonces, por la API (`PUT /settings`).
- [ ] **Test inestable con PostgreSQL real:** `no-heartbeat.e2e.test.ts` › «si la PC nunca supo de la sesión…» cierra la PC y abre una temporal en ella; como abrir exige la PC conectada (T31), con PostgreSQL real el nodo ya vio la desconexión y responde 409 (con PGlite pasa). Falla igual antes de la fase 8; hay que rehacer el test para que la PC pierda el `state` sin estar desconectada al abrir.
- [ ] **Spec 005, parte 2:** imprimir en papel el PDF del encargado (se comprobó que se descarga y ocupa una página) y medir REQ-005-71 (una venta en menos de 500 ms) en el i5, con las mediciones de la spec 001. Ver [`mediciones.md`](docs/specs/005-inventario-y-caja/mediciones.md).
- [ ] **Spec 008:** averiguar si el plan de SENET del local incluye acceso a la API y quién tiene las credenciales.

## Mapa de specs

| Spec | Estado | Progreso |
|---|---|---|
| [001 Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) | Implementada (salvo REQ-001-13, Bs) | 68 / 68 |
| [002 Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md) | Aprobada · plan aprobado · faltan sus tareas | — |
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | Borrador | — |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | En curso: partes 1 (tasa) y 2 (inventario y caja) aprobadas; parte 3 en borrador | 32 / 42 |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-03:** T26 (spec 005): el nodo vende otros ingresos (importe y comentario), los guarda con su comentario, emite `sale.recorded` v2 y los junta en «Otros ingresos» en el reporte.
- **2026-10-03:** T25 (spec 005): contratos del otro ingreso (importe en USD y comentario opcional) y `sale.recorded` v2 con líneas de producto u otro ingreso.
- **2026-10-03:** Spec 005: el mantenedor aprueba el plan y las tareas de los cambios (T25 a T31): otro ingreso con su migración desde los conceptos, el cliente y las líneas en los movimientos, el informe X y la tabla de la Caja.
- **2026-10-03:** Spec 005, parte 2: el mantenedor aprueba tres cambios tomados de SENET. El «otro ingreso» (importe y comentario) sustituye a los conceptos; la lista de movimientos pasa a ser una tabla con los ingresos del día en grande y la apertura al final; y se añade el informe X (el reporte de la caja abierta, sin cerrarla). T24 queda pendiente de rehacer.
- **2026-10-03:** T24 (spec 005): tabla de los 8 criterios de la parte 2 en `mediciones.md`, todos con test automático y casi todos probados a mano en Chrome; falta la revisión del mantenedor, imprimir el PDF en papel y medir REQ-005-71 en el i5.
- **2026-10-02:** T23b (spec 005): pantalla «Ajustes del local» para el administrador con el nombre del local (sale en el PDF del cierre) y «Permitir vender sin stock»; probada en Chrome.
- **2026-10-02:** T23 (spec 005): página Cierres de caja para el administrador y el dueño, con los totales y la diferencia de cada caja y sus dos PDF; probada en Chrome.
- **2026-10-02:** T22c (spec 005): el PDF del encargado lleva al final lo vendido por artículo con lo que queda en almacén, como el Z-Report de SENET (pedido por el mantenedor; REQ-005-51 cambia: puede seguir en una segunda página). Fondos agregados y retiradas de efectivo quedan como pregunta abierta.
- **2026-10-02:** T22b (spec 005): «Cerrar caja» con lo esperado, lo contado y la diferencia, «¿Seguro?» y descarga del PDF; probado en Chrome (CA-005-03 y el PDF de una página).
- **2026-10-02:** T22a (spec 005): diálogo «Abrir caja» con el fondo en USD y Bs, desde la píldora, la Caja y los cobros; probado en Chrome. T22 se divide en dos (T22b: cerrar con conteo y reporte).
