# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-02 · T42 terminada (tarifas)

## Ahora

| | |
|---|---|
| **Spec en curso** | [001 · Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) |
| **Siguiente tarea** | **T43: Administración de combos** ([tasks.md](docs/specs/001-cuentas-y-sesiones/tasks.md)) |
| **Progreso** | 57 / 68 tareas · fase 8 de 9 (Panel) |
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
- [ ] **Ajustes en el panel:** la spec dice que el administrador cambia desde el panel la gracia de latidos y las sesiones temporales conservadas, pero no hay tarea; se decidió dejarlo fuera de la fase 8. Hasta entonces, por la API (`PUT /settings`).
- [ ] **Spec 008:** averiguar si el plan de SENET del local incluye acceso a la API y quién tiene las credenciales.

## Mapa de specs

| Spec | Estado | Progreso |
|---|---|---|
| [001 Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) | En curso | 57 / 68 |
| [002 Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md) | Borrador | — |
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | Borrador | — |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | Borrador | — |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-02:** T42: pantalla Tarifas: el administrador marca días y les pone un precio; el resto del personal la ve sin poder cambiarla. Verificado CA-001-20 a mano.
- **2026-10-02:** T41: turno de caja en la barra superior (abrir y cerrar), diálogos de recarga y de venta de combo (con saldo o en caja) desde Clientes y desde el detalle de la PC; la sesión del mapa trae el id del cliente. Antes, las decisiones del mantenedor para el resto de la fase 8. Verificado a mano con el simulador.
- **2026-10-02:** T40: pantalla Clientes del panel: lista con buscador (usuario, nombre o teléfono), alta con errores por campo, bloquear, desactivar o activar y quitar el bloqueo por intentos; el dueño solo consulta. Antes, `refactor(panel)`: el panel lateral y el diálogo pasan a ser compartidos. Verificado a mano contra PostgreSQL real.
- **2026-10-01:** T39b: pestaña Organizar del mapa para el administrador con @dnd-kit/core: arrastrar con ratón o teclado, intercambiar, guardar o descartar. Verificado a mano: misma distribución al recargar y desde otra sesión.
- **2026-10-01:** T39a: columnas map_row y map_col en pcs, PUT /pcs/map solo para el administrador (distribución completa en una transacción) y evento pc.map_changed con las PCs que cambian. Probado también contra PostgreSQL real.
- **2026-10-01:** T39: mapa de PCs en vivo en el panel, con baldosas por estado, leyenda, ocupación y detalle de la PC con «Cerrar sesión». Cuenta el restante y el saldo con el reloj del nodo entre envíos del canal `/panel`. Medido con el simulador: 17–36 ms. Antes, `fix(panel)`: ya no aparece «sesión caducada» al abrir el panel sin sesión.
- **2026-09-30:** T38a. GET /pcs/map (todo el personal) y canal WebSocket /panel con la cookie del personal (sin ella se cierra con 4401): el mapa completo al conectar y en cada cambio, como mucho uno por segundo. Esquemas pcMapSchema y panelMessageSchema en shared. EventsService.subscribe avisa de lo confirmado y PcConnections de las conexiones.
- **2026-09-30:** T38. apps/panel (@pope/panel) con Vite, React 19 y wouter: tema oscuro del diseño estilo SENET para 1920×1080, Nunito incluida, barra superior con fecha y hora de Caracas, raíl de iconos y login. ApiClient valida cada respuesta con shared y da mensajes en español; un 401 fuera del login devuelve al login. Vite hace de proxy al nodo. Probado contra el servidor real: login correcto e incorrecto, sesión al recargar y salir.
- **2026-09-30:** Decisiones del mantenedor para la fase 8: diseño de referencia el lienzo estilo SENET a 1920×1080, Nunito incluida, Bs oculto hasta la spec 005 y escrito «Bs», organizar el mapa arrastrando (REQ-001-45, @dnd-kit/core; tareas T39a y T39b) y el nodo sirve el panel compilado (T45a). Se añade T38a: estado de las PCs y canal WebSocket del panel.
- **2026-09-30:** T37. Subcomando load del simulador (40 PCs conectadas, un login cada 1,5 s, 10 min de sesiones y ráfaga final informativa; mide la memoria con el log del servidor) y mediciones.md. En el equipo de desarrollo: p95 del login 69 ms (ráfaga 334 ms), rss máx 222 MB, 0 errores; argon2 13 ms. Pendiente repetirlo en el i5 de 2ª gen. Fin de la fase 7.
