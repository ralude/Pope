# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-02 · productos y conceptos en el nodo (T10 de la spec 005)

## Ahora

| | |
|---|---|
| **Spec en curso** | [005 · Inventario y caja](docs/specs/005-inventario-y-caja/spec.md): parte 1 (tasa) en pausa tras T03; parte 2 (inventario, ventas y caja) en curso |
| **Siguiente tarea** | **T11: Fotos de los productos** ([tasks.md](docs/specs/005-inventario-y-caja/tasks.md)). Orden: T11–T17 (con T13a, T16b), T04, T18–T24, T05–T07 |
| **Progreso** | Spec 005: 8 / 29 tareas (parte 1: 3 / 7; parte 2: 5 / 22) |
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
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | En curso: partes 1 (tasa) y 2 (inventario y caja) aprobadas; parte 3 en borrador | 8 / 29 |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-02:** T10 (spec 005): tablas `products`, `stock_movements` y `sale_concepts`; alta y edición de productos y conceptos por el administrador, con sus eventos; la cantidad inicial de un producto se guarda como su primera entrada, y `GET /products` da el stock calculado.
- **2026-10-02:** Decisiones del mantenedor para la fase 2 de la spec 005: la caja es del local (una sola abierta, en la que cobran encargados y administradores; la cierra quien la abrió o un administrador; se puede reabrir el mismo día), solo se anulan ventas de la caja abierta y el nombre del local es un ajuste del panel. Tareas nuevas: T13a, T16b y T23b.
- **2026-10-02:** T09c (spec 005): contratos del turno: fondo inicial en USD y Bs, lo esperado por método (con el saldo fuera), lo contado, la diferencia (CA-005-03), el historial de cierres y la versión 2 de `shift.opened` y `shift.closed`.
- **2026-10-02:** T09b (spec 005): contratos de las ventas y el registro de caja: venta con productos, conceptos y varios pagos (también con saldo), importe en Bs al céntimo, reparto de los pagos por grupo, totales con el saldo aparte, lista del turno, eventos `sale.recorded` y `sale.voided`, y mensaje `cash` del canal. T09 queda en tres partes (T09c: apertura y cierre del turno).
- **2026-10-02:** T09a (spec 005): contratos del inventario en `@pope/shared`: productos (con la cantidad inicial como primera entrada y la versión de la foto), conceptos, movimientos de stock, aviso de bajo mínimo, el ajuste `allowNegativeStock` y los eventos `product.*`, `stock.moved` y `sale_concept.*`.
- **2026-10-02:** T08 (spec 005): diseño de Caja, Inventario, Nuevo producto, abrir y cerrar caja, Cierres y el PDF del encargado en el lienzo del panel, aprobado por el mantenedor (sin líneas de firma en el PDF). Decidido además: vender sin stock es un ajuste del nodo (`allowNegativeStock`, REQ-005-12), y las recargas, temporales y combos cobrados en un método de Bs se guardan en Bs con la tasa. T09 se divide en T09a (inventario) y T09b (ventas y caja).
- **2026-10-02:** Spec 005, parte 2 redactada con el mantenedor: productos con foto, conceptos sin inventario ("Impresiones"), Caja con venta nueva a la izquierda y movimientos del turno a la derecha, fondo inicial, cierre con conteo por método y PDF de una página (más el detallado para administrador y dueño). La tasa queda en pausa tras T03 por decisión suya.
- **2026-10-02:** T03 (spec 005): el `state` de las PCs lleva la tasa vigente y se reenvía al cambiarla (el Shell ya muestra el Bs), y el canal del panel anuncia `exchangeRate` al conectar, al cambiar y al pasar de día.
- **2026-10-02:** T02 (spec 005): tabla `exchange_rates` (solo inserción), `ExchangeRatesService` con las últimas tasas en memoria y `GET`/`POST /exchange-rate` (guardan el encargado y el administrador; el dueño solo ve). Probado también contra PostgreSQL real.
- **2026-10-02:** T01 (spec 005): contratos de la tasa en `@pope/shared`: esquemas de la API, evento `exchange_rate.set`, mensaje `exchangeRate` del canal del panel, tasa vigente y antigüedad en días hábiles. Antes, el mantenedor aprobó la parte 1 de la 005 y la spec 002 con su plan.
