# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-02 · T51 terminada: spec 001 implementada

## Ahora

| | |
|---|---|
| **Spec en curso** | Ninguna: la [001 · Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) está implementada |
| **Siguiente tarea** | **Preparar la tasa manual en Bs** (parte de la [spec 005](docs/specs/005-inventario-y-caja/spec.md), REQ-005-34): requisitos, plan y tareas para que los apruebe el mantenedor (su decisión del 2026-10-02) |
| **Progreso** | Spec 001: 68 / 68 tareas |
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
| [002 Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md) | Borrador | — |
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | Borrador | — |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | Borrador | — |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-02:** T51: tabla de los 21 criterios de aceptación en `mediciones.md`, todos con test automático (se añadió el de CA-001-15), y la spec 001 queda **implementada** salvo el Bs. Antes, por petición del mantenedor: colores nuevos del mapa del panel (gris, verde, celeste, ámbar) y «Control de la PC» desactivado, con sus requisitos en la spec 003 (Wake-on-LAN y modo administrador remoto).
- **2026-10-02:** T50: «Cerrar sesión» con confirmación en el Shell; en las temporales, «Perderás X min». Verificado CA-001-09 con una temporal de 25 min abierta desde el panel. Fin de la fase 9.
- **2026-10-02:** T49: diálogo «Comprar combo» en el Shell (desde el panel de la sesión y desde el aviso), con lo que alcanza el saldo y cómo quedan saldo y horas. Antes, `feat(server)`: mensaje `listCombos`/`combos` del canal y `requestId` en la respuesta a la compra. Verificado con recargas reales desde el panel.
- **2026-10-02:** T48: avisos de 5 y 1 min (los del nodo, sin contradecir al contador) y pantalla «Tu sesión terminó» que vuelve al bloqueo a los 10 s. Antes, `feat(shell-ui)`: todos los tiempos sin segundos («4 h 15 min»), como pidió el mantenedor. Verificado con una sesión temporal de 6 min.
- **2026-10-02:** T47: la sesión del Shell muestra el tiempo total, las horas de combo y el saldo con su tiempo equivalente, con cuenta atrás local hecha con el motor de cobro de `@pope/shared` (coincide con el nodo en cada latido). Sin catálogo y con la pausa desactivada, como decidió el mantenedor (anotado en la spec 001).
- **2026-10-02:** T46: nace `apps/shell-ui` (diseño "Shell Pope · Fase 9", con vidrio y desenfoques): pantalla de bloqueo con login y errores del nodo en español, y canal con el nodo detrás de `PcChannel` (en desarrollo, WebSocket directo que hace de agente). Antes, `docs(specs)`: en la spec 003 el técnico entra solo con usuario y contraseña, y se añade el fondo de bloqueo que sube el administrador.
- **2026-10-02:** T45a: el nodo sirve el panel compilado en modo `local` (`@fastify/static`), con la API por delante y `index.html` para las rutas del panel; AGENTS.md explica cómo abrirlo. Fin de la fase 8.
- **2026-10-02:** T45: pantalla Interrumpidas (pendientes con Restaurar y elección de PC libre, y respaldo por PC) y punto ámbar en el raíl con el número que envía el canal. Verificados CA-001-06 y CA-001-08 con el simulador.
- **2026-10-02:** T44: abrir, ampliar y cerrar sesiones temporales desde el detalle de la PC del mapa (por tiempo o por importe). Verificados CA-001-05 y CA-001-10 a mano con el simulador.
- **2026-10-02:** T43b: pantalla Personal (solo administrador): alta con rol y activar o desactivar, sin poder desactivarse a sí mismo. Verificado a mano: el encargado desactivado pierde la sesión y no puede entrar.
