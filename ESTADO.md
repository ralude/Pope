# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-01 · T39 terminada (mapa de PCs en vivo)

## Ahora

| | |
|---|---|
| **Spec en curso** | [001 · Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) |
| **Siguiente tarea** | **T39a: Guardar la distribución del mapa** ([tasks.md](docs/specs/001-cuentas-y-sesiones/tasks.md)) |
| **Progreso** | 52 / 68 tareas · fase 8 de 9 (Panel) |
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
- [ ] **REQ-001-13:** el equivalente en Bs espera a la tasa BCV de la spec 005.
- [ ] **Antes de la spec 003:** decidir los ADR propuestos [0005](docs/adr/0005-shell-react-en-webview2.md), [0009](docs/adr/0009-escritorio-separado-para-bloqueo-y-pausa.md) y [0010](docs/adr/0010-lista-blanca-y-restauracion.md) (cliente Windows).
- [ ] **Spec 008:** averiguar si el plan de SENET del local incluye acceso a la API y quién tiene las credenciales.

## Mapa de specs

| Spec | Estado | Progreso |
|---|---|---|
| [001 Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) | En curso | 52 / 68 |
| [002 Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md) | Borrador | — |
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | Borrador | — |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | Borrador | — |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-01:** T39: mapa de PCs en vivo en el panel, con baldosas por estado, leyenda, ocupación y detalle de la PC con «Cerrar sesión». Cuenta el restante y el saldo con el reloj del nodo entre envíos del canal `/panel`. Medido con el simulador: 17–36 ms. Antes, `fix(panel)`: ya no aparece «sesión caducada» al abrir el panel sin sesión.
- **2026-09-30:** T38a. GET /pcs/map (todo el personal) y canal WebSocket /panel con la cookie del personal (sin ella se cierra con 4401): el mapa completo al conectar y en cada cambio, como mucho uno por segundo. Esquemas pcMapSchema y panelMessageSchema en shared. EventsService.subscribe avisa de lo confirmado y PcConnections de las conexiones.
- **2026-09-30:** T38. apps/panel (@pope/panel) con Vite, React 19 y wouter: tema oscuro del diseño estilo SENET para 1920×1080, Nunito incluida, barra superior con fecha y hora de Caracas, raíl de iconos y login. ApiClient valida cada respuesta con shared y da mensajes en español; un 401 fuera del login devuelve al login. Vite hace de proxy al nodo. Probado contra el servidor real: login correcto e incorrecto, sesión al recargar y salir.
- **2026-09-30:** Decisiones del mantenedor para la fase 8: diseño de referencia el lienzo estilo SENET a 1920×1080, Nunito incluida, Bs oculto hasta la spec 005 y escrito «Bs», organizar el mapa arrastrando (REQ-001-45, @dnd-kit/core; tareas T39a y T39b) y el nodo sirve el panel compilado (T45a). Se añade T38a: estado de las PCs y canal WebSocket del panel.
- **2026-09-30:** T37. Subcomando load del simulador (40 PCs conectadas, un login cada 1,5 s, 10 min de sesiones y ráfaga final informativa; mide la memoria con el log del servidor) y mediciones.md. En el equipo de desarrollo: p95 del login 69 ms (ráfaga 334 ms), rss máx 222 MB, 0 errores; argon2 13 ms. Pendiente repetirlo en el i5 de 2ª gen. Fin de la fase 7.
- **2026-09-30:** T37a. POPE_MEMORY_LOG_MS (opcional, mínimo 1000) hace que el servidor registre cada ese tiempo Memoria: rss=… MB heapUsed=… MB. Probado en un arranque real: unos 84 MB en reposo (el primer registro, durante el arranque y las migraciones, marcó 260 MB).
- **2026-09-30:** T36b. Subcomando interactive: consola con login, logout, red, reinicio, apagon, luz y estado sobre PCs simuladas. Probada contra PostgreSQL real: el corte de red de 20 s mantiene la sesión, el apagón la cierra sin latidos y el reinicio con la sesión ya nombrada la cierra al momento.
- **2026-09-30:** T36a. CLI del simulador: seed (crea sim01…simNN y los recarga por la API del panel, con turno propio, idempotente) y run (PCs simuladas con --login y --duration). Probado contra PostgreSQL real: 5 PCs entran con 2:00:00 y salen con 0,05 USD menos tras 2 min; el ledger y los eventos cuadran. La prueba destapó que Fastify rechaza content-type JSON sin cuerpo.
- **2026-09-30:** T36. Paquete tools/agent-sim (@pope/agent-sim) sin dependencias nuevas y clase SimulatedPc: hello, latido cada 10 s siempre, restante local, reconexión 1-30 s, corte de red, reinicio y apagón (sin cerrar la conexión, como en la realidad), login con latencia. 15 tests con conexión falsa y reloj simulado.
- **2026-09-30:** T35a. devPcId y devPcName pasan a shared (de 1 a 99, con RangeError fuera de rango) y seedDevPcs/dev:seed-pcs admiten --count para crear hasta 99 PCs; sin duplicar al repetir.
