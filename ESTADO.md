# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-02 · diseño de la Caja y el Inventario aprobado (T08 de la spec 005)

## Ahora

| | |
|---|---|
| **Spec en curso** | [005 · Inventario y caja](docs/specs/005-inventario-y-caja/spec.md): parte 1 (tasa) en pausa tras T03; parte 2 (inventario, ventas y caja) en curso |
| **Siguiente tarea** | **T09a: Contratos del inventario** ([tasks.md](docs/specs/005-inventario-y-caja/tasks.md)). Orden: T09a–T17, T04, T18–T24, T05–T07 |
| **Progreso** | Spec 005: 4 / 25 tareas (parte 1: 3 / 7; parte 2: 1 / 18) |
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
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | En curso: partes 1 (tasa) y 2 (inventario y caja) aprobadas; parte 3 en borrador | 4 / 25 |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-02:** T08 (spec 005): diseño de Caja, Inventario, Nuevo producto, abrir y cerrar caja, Cierres y el PDF del encargado en el lienzo del panel, aprobado por el mantenedor (sin líneas de firma en el PDF). Decidido además: vender sin stock es un ajuste del nodo (`allowNegativeStock`, REQ-005-12), y las recargas, temporales y combos cobrados en un método de Bs se guardan en Bs con la tasa. T09 se divide en T09a (inventario) y T09b (ventas y caja).
- **2026-10-02:** Spec 005, parte 2 redactada con el mantenedor: productos con foto, conceptos sin inventario ("Impresiones"), Caja con venta nueva a la izquierda y movimientos del turno a la derecha, fondo inicial, cierre con conteo por método y PDF de una página (más el detallado para administrador y dueño). La tasa queda en pausa tras T03 por decisión suya.
- **2026-10-02:** T03 (spec 005): el `state` de las PCs lleva la tasa vigente y se reenvía al cambiarla (el Shell ya muestra el Bs), y el canal del panel anuncia `exchangeRate` al conectar, al cambiar y al pasar de día.
- **2026-10-02:** T02 (spec 005): tabla `exchange_rates` (solo inserción), `ExchangeRatesService` con las últimas tasas en memoria y `GET`/`POST /exchange-rate` (guardan el encargado y el administrador; el dueño solo ve). Probado también contra PostgreSQL real.
- **2026-10-02:** T01 (spec 005): contratos de la tasa en `@pope/shared`: esquemas de la API, evento `exchange_rate.set`, mensaje `exchangeRate` del canal del panel, tasa vigente y antigüedad en días hábiles. Antes, el mantenedor aprobó la parte 1 de la 005 y la spec 002 con su plan.
- **2026-10-02:** Planes propuestos: tasa manual de la spec 005 (parte 1, 7 tareas; la escriben encargado o administrador y vale al guardarla) y pausa de la spec 002 en dos fases (fase 1 en TypeScript ya; fase 2 nativa con la spec 003). La spec 002 queda con las dudas resueltas por el mantenedor.
- **2026-10-02:** T51: tabla de los 21 criterios de aceptación en `mediciones.md`, todos con test automático (se añadió el de CA-001-15), y la spec 001 queda **implementada** salvo el Bs. Antes, por petición del mantenedor: colores nuevos del mapa del panel (gris, verde, celeste, ámbar) y «Control de la PC» desactivado, con sus requisitos en la spec 003 (Wake-on-LAN y modo administrador remoto).
- **2026-10-02:** T50: «Cerrar sesión» con confirmación en el Shell; en las temporales, «Perderás X min». Verificado CA-001-09 con una temporal de 25 min abierta desde el panel. Fin de la fase 9.
- **2026-10-02:** T49: diálogo «Comprar combo» en el Shell (desde el panel de la sesión y desde el aviso), con lo que alcanza el saldo y cómo quedan saldo y horas. Antes, `feat(server)`: mensaje `listCombos`/`combos` del canal y `requestId` en la respuesta a la compra. Verificado con recargas reales desde el panel.
- **2026-10-02:** T48: avisos de 5 y 1 min (los del nodo, sin contradecir al contador) y pantalla «Tu sesión terminó» que vuelve al bloqueo a los 10 s. Antes, `feat(shell-ui)`: todos los tiempos sin segundos («4 h 15 min»), como pidió el mantenedor. Verificado con una sesión temporal de 6 min.
