# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-21 · T28, T29 y T31 completas; T30a hecha (T30b espera a T39/T40); siguiente T32; T34 tras aprobar su diseño, T37 tras T10; T22 aplazada; T15c3/T10 abiertas

## Ahora

| | |
|---|---|
| **Spec en curso** | [003 · Arranque y bloqueo de PC](docs/specs/003-bloqueo-de-pc/spec.md): T01–T09, T11–T14, T16–T21, T23–T29 y T31 completos en desarrollo, sin VM; T30a hecha; T22 aplazada (autorizada, sin implementar); T10 aplazada y prueba SCM de T15 pendiente; T28–T42 autorizadas (2026-10-21) con T34/T37 en espera; T43–T59 Borrador. La 005 mantiene su T07 de revisión |
| **Siguiente tarea** | **T32** (mensajes del encargado a la PC). T31 hecha: el agente reinicia y apaga con diario previo; probado pidiendo y anulando, sin reinicio real. T30a hecha: reiniciar/apagar con sesión la cierra antes; T30b (con mantenimiento) espera a T39/T40. T29 hecha: todo cierre reserva la PC hasta que el agente aplica el bloqueo tras limpiar los procesos del cliente. Después T31–T33, el diseño de T34 para aprobar, T35, T36, T38 y T40 en lo independiente de T10, T39, T41 y T42. T37 espera a T10; T22 sigue aplazada. Siguen abiertas T15c3 (aceptar UAC para el SCM) y T10 |
| **Progreso** | Spec 003: 27 / 59 grupos; T01–T09, T11–T14, T16–T21, T23–T29 y T31 completas; T30a hecha. Pruebas Home aceptadas para T08b (2026-10-08); continuación hasta T42 autorizada. Spec 002: 19 / 19 tareas (fase 1), fase 2 en tasks 003. Spec 005: 41 / 42 |
| **Bloqueos** | T15c3 espera aceptar UAC en Windows para ensayo SCM; cancelación previa sin servicio/carpeta creados. T15 abierta; T16–T21 y T23–T27 completas en desarrollo; T22 aplazada. El cierre de procesos (T26) y el relevo del host (T27) dependen de que el agente lance y asocie el host, cosa que hasta T22 solo ocurre en los ensayos. SCM y reinicio real del servicio sin probar (T15c3). Juegos/anticheat del local, audio exclusivo y varios monitores sin probar (T56): no se declara compatible ADR-0023. Compatibilidad Windows 10 Pro 22H2 y Windows 11 Pro 25H2 pendiente antes de entregar al local; ya no bloquea T09 por aprobación explícita del mantenedor (2026-10-08). Guest Control recuperado tras reinicio de VM autorizado el 2026-10-09; snapshot e inventario actuales en mediciones. Historial: en la VM Home 22H2 (19045.2965), 8192 MB y ahora 4 vCPU, ambos artefactos autocontenidos arrancan y pasan los 334 tests, sin omitidos. Home aceptado como evidencia para cerrar T08b/T08. T09 completa: escritorio/WebView2/entrada/Alt+Tab y juego exclusivo verificados en VM, aceptados por el mantenedor; pruebas físicas de juegos reales/anticheat en T25/T56 antes de entrega. T10 parcial con ADR-0018 Aceptado: custodia/token/perfil/ACL, WebView2 limitado y cierre de ventana/hijo pasan en VM, pero Explorer lanzado termina; Windows completo y muerte del broker pendientes. Revisar ruta antes de integrar mantenimiento; T11–T20 pueden avanzar por instrucción del mantenedor (2026-10-09). Retiro de credencial/servicio/árbol/procesos propios y retorno original comprobados. Ensayo previo usó vboxuser con token medio/alto; ahora cuenta estándar temporal creada/verificada, separación de sesión/perfiles aún pendiente. Contrato de T07 resuelto: opción A, recorte exterior solo del usuario con reglas exportadas para C#. Inventario confirmado: 12 PCs Windows 10 Pro 22H2 y una Windows 11 Pro 25H2, sin congelador. Compatibilidad y persistencia nativas pendientes de verificar. Revocación: consumo detenido, misma PC/sesión con credencial nueva, encargado/administrador, código local de un uso/10 min y vuelta al estado previo con pausa conservada confirmados (opciones A, ADR-0020/0021/0022, REQ-002-33). Contratos/prueba del asistente y confirmación temporal pendientes. Emergencia: reglas de uso cerradas en ADR-0024 a ADR-0028, con auditoría por cuenta Windows/PC/entrada/salida UTC sin nombre ni motivo; mecanismo, contratos/actor y pruebas pendientes |

## Cómo retomar

**Entorno vigente (2026-10-21):** el mantenedor pide continuar T28–T42 en esta máquina,
sin usar la VM, con T22 aplazada. T34 empieza por proponer su diseño; T37 espera a T10 y
T38/T40 hacen solo lo independiente del mecanismo. T31 pide un reinicio con margen y lo
anula; T33 captura el paquete mágico en local. Antes (2026-10-12): continuar T21–T27 y
mantener T10 abierta hasta realizar ese bloque. Conservar las pruebas
aisladas/reversibles; no alterar shell, autologin, cuentas, UAC ni directivas del Windows
cotidiano. Las verificaciones que exijan entorno desechable se registran como pendientes.

**T15c3 actual:** intento `b3181fdb63634f5eb24eef508f365a79` no arrancó: Windows devolvió
cancelación de UAC. Servicio inexistente (1060) y carpeta protegida ausente; sin cambios
de Windows. Reabrir [el lanzador](apps/native/probes/test-agent-service.ps1) y aceptar UAC
para la verificación funcional cuando se retome T15. El mantenedor pide ahora avanzar
T16–T20; no repetir el lanzamiento UAC durante este bloque. No marcar T15 completa por los
tests automáticos. Batería T15 correcta (1 628 tests); última batería T20 correcta (1 676 tests). Repetir solo si cambian entradas.
PostgreSQL temporal `tmp/contracts003-pg` detenido al terminar T20; sin clientes ni bases de tests pendientes.

**Orden vigente (2026-10-09):** T10 aplazada por instrucción directa del mantenedor;
seguir T11–T20. Sustituye el límite histórico de no avanzar T11. T10 no se marca completa
y su mecanismo de mantenimiento no se integra sin demostrarlo.

El mantenedor aprueba la validación por tarea de `AGENTS.md`: comprobaciones pertinentes
por commit, batería completa al cierre de cada Txx, Windows 11 de desarrollo primero
para pruebas aisladas/reversibles y VM después para las que alteran el sistema. La
aprobación no cierra el gate funcional de T10 ni autoriza construir una ruta alternativa
sin revisar y aprobar el mecanismo.

[ADR-0029](docs/adr/0029-sesion-windows-de-mantenimiento-con-uac.md) aceptado para alcance:
el mantenedor elige «Windows normal con UAC (recomendado)». Explorer puede seguir
limitado bajo la administradora existente; las herramientas deben demostrar elevación
mediante UAC. Entrada/retorno automatizados y recuperación aún no están demostrados;
no instalar proveedores ni modificar Windows a partir de esos candidatos.

[Ensayo mínimo](docs/specs/003-bloqueo-de-pc/ensayo-sesion-windows.md) aprobado explícitamente:
«confirmo» autoriza snapshot y cuenta cliente estándar temporal con retirada en `22h2 pope`.
El mantenedor confirma Windows sin respuesta y luego autoriza el reinicio forzado.
Ejecutado únicamente en VM; Guest Control vuelve a leer. Snapshot operativo previo:
`0535d231-c5b4-4c22-b0bf-cd3483d99ebc`; cuenta temporal creada con contraseña privada,
SID/marcador verificados, solo Usuarios, grupo administrativo y UAC conservados.
Ensayo `7d26df55ba4248e09e985fd18f03439a`; publicación y accesos comprobados, observación
nativa/manual aún pendiente. El primer aviso de ventana abierta no queda corroborado:
sin proceso/informe cliente en la lectura posterior; no registrar continuidad ni fallo
del observador sin evidencia. El mantenedor informa preparación de Windows y luego
«ya funciona». No cerrar automáticamente la sesión administrativa previa.
El cambio manual de usuario solo estudia el escritorio y no cierra T10.

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
- [ ] **Spec 003:** resolver las preguntas abiertas de [`spec.md`](docs/specs/003-bloqueo-de-pc/spec.md). Confirmados C#/WebView2/escritorio separado, fase 2 de pausa, mantenimiento remoto solo sin sesión y acceso técnico local de encargado/administrador validado por el nodo. «Bloquear» cierra la sesión y se cierran procesos del cliente sin reiniciar. Evergreen offline; 13 equipos (12 para clientes normalmente), PC de pruebas y VM. Nodo con IP fija/reserva DHCP; mantenimiento continúa sin red y permite salir/bloquear con registro al reconectar. Confirmados 12 equipos Windows 10 Pro 22H2 y uno Windows 11 Pro 25H2, sin congelador; compatibilidad por probar. Revisar el mecanismo de mantenimiento con cuenta Windows existente, recuperación y contratos definitivos.
- [ ] **REQ-001-24:** confirmar el criterio de T07: si una sesión empieza con menos de 1 min, solo se envía el aviso de 1 min (anotado en las preguntas resueltas de la spec 001).
- [ ] **T28a:** confirmar los límites de los ajustes: gracia de latidos entre 30 s y 30 min, sesiones temporales conservadas entre 3 y 100 (la spec solo fija el 3 mínimo y el 3 min por defecto).
- [ ] **T31:** confirmar dos criterios al abrir una sesión temporal: el tope de 24 h por cobro y que la PC deba estar conectada al nodo (si no, se cobraría por una PC que no puede desbloquearse).
- [ ] **T07 (spec 005):** revisar la verificación de la tasa manual (CA-005-06, REQ-001-13) y la forma del Bs: el criterio escribe «3,00 USD (≈ 120,00 Bs)» en una línea, y el panel lo pone debajo del importe, sin paréntesis, como en el diseño.
- [ ] **Cliente Windows:** decidir el ADR [0010](docs/adr/0010-lista-blanca-y-restauracion.md) para la spec 004. ADR-0005 (WebView2) y ADR-0009 (escritorio separado) aceptados por el mantenedor el 2026-10-04; no siguen bloqueando la planificación de la 003.
- [ ] **Plan 003:** revisar [ADR-0017](docs/adr/0017-comunicacion-segura-del-cliente-windows.md) y [ADR-0018](docs/adr/0018-mantenimiento-con-cuenta-windows-existente.md). Host WinForms + WebView2 confirmado en [ADR-0019](docs/adr/0019-host-del-shell-en-winforms.md); SDK/tests/compatibilidad pendientes. El mantenedor eligió reutilizar una cuenta administradora Windows existente; ADR-0018 aprobado el 2026-10-08; falta demostrar elevación, custodia y salida en T10. No se modifican cuentas preexistentes; solo se crea la fixture cliente estándar autorizada en VM.
- [ ] **Ajustes en el panel:** ya existe «Ajustes del local» (spec 005, T23b) con el nombre del local y «Permitir vender sin stock». La gracia de latidos y las sesiones temporales conservadas (spec 001) siguen sin pantalla, sin tarea; hasta entonces, por la API (`PUT /settings`).
- [ ] **Spec 005, parte 2:** imprimir en papel el PDF del encargado (se comprobó que se descarga y ocupa una página) y medir REQ-005-71 (una venta en menos de 500 ms) en el i3-2120 del local, con las mediciones de la spec 001. Ver [`mediciones.md`](docs/specs/005-inventario-y-caja/mediciones.md).
- [ ] **Spec 008:** averiguar si el plan de SENET del local incluye acceso a la API y quién tiene las credenciales.
- [ ] **Simulador, `seed`:** `openShift()` envía `POST /shifts` sin los fondos exigidos por la spec 005. Con caja cerrada falla con «Datos no válidos»; para T18 se abrió la caja desde el panel y la preparación terminó. Corregir en una tarea aparte; no forma parte de la pausa.

## Mapa de specs

| Spec | Estado | Progreso |
|---|---|---|
| [001 Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) | Implementada (REQ-001-13, Bs, verificado en T07 de la 005; en revisión) | 69 / 69 |
| [002 Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md) | Fase 1 implementada, verificada y aprobada. Fase 2 pendiente de la spec 003 | 19 / 19 |
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | T01–T09, T11–T14, T16–T21, T23–T29 y T31 completos en desarrollo sin VM; T30a hecha; T22 aplazada (autorizada); T10 y SCM T15 pendientes; compatibilidad Pro, juegos/anticheat y audio exclusivo pendientes antes de entrega (T56); T28–T59 Borrador | 27 / 59 |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | En curso: partes 1 (tasa) y 2 (inventario y caja) aprobadas; parte 2 verificada; parte 1 en revisión (T07); parte 3 en borrador | 41 / 42 |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-21:** T31 completa en desarrollo: el agente guarda la orden en un diario protegido, acepta y pide a Windows reiniciar o apagar; tras reiniciar no repite la misma orden. El nodo pide un bloqueo al volver si la orden cerró una sesión o se perdió su acuse. Ensayo `--power-proof`: Windows aceptó reiniciar y apagar y ambos se anularon, sin reiniciar el equipo. Batería correcta: 1 765 tests. Sin probar: reinicio y apagado reales (VM/PC de pruebas) y como SYSTEM.

- **2026-10-21:** T30a: reiniciar o apagar con sesión exige confirmación y la cierra antes, en la misma transacción que la orden; si el cierre falla no se envía nada. Si esa orden no se ejecuta, el nodo pide un bloqueo para confirmar la limpieza. 8 tests; 455 del servidor en verde. T30b (con mantenimiento) espera a T39/T40, por el aplazamiento de T37. Siguiente T31.

- **2026-10-21:** T29c/T29 completas en desarrollo: el agente valida el bloqueo con su `controlState` y la hora del nodo, termina la sesión local si aún la tenía, espera la limpieza T26 y responde aplicado, o `native_failure` si quedan procesos del cliente. Ensayo real ampliado de T26: aplicado en 765–768 ms tras el cierre y 608–655 ms tras el agotamiento, sin procesos del cliente vivos. 447 tests del servidor en PostgreSQL 18.6; batería correcta, 1 749 tests. Sin probar: confirmación del escritorio por el host (T22) y juegos/anticheat (T56).

- **2026-10-21:** T29b: cada cierre de sesión pide en la misma transacción un bloqueo que reserva la PC (actor del personal o «sistema»); «Bloquear» con sesión o pausa la cierra con las reglas existentes. Un bloqueo solo libera la PC al aplicarse; si vence o falla sin efecto se repite al reconectar, y un fallo de Windows espera a otro Bloquear. El cierre bloquea PC → sesión → cuenta, como el login. 9 tests nuevos; 50 pasan también en PostgreSQL 18.6. Siguiente T29c (agente): hasta entonces el agente real no responde y la PC queda reservada tras cada cierre.

- **2026-10-21:** el mantenedor decide que todos los cierres de sesión reserven la PC hasta que el agente confirme bloqueo y limpieza. T29a: el contrato, el evento y la base de datos (migración 0030) admiten bloqueos con actor «sistema», y solo bloqueos. Siguiente T29b.

- **2026-10-21:** T28b/T28 completas en desarrollo: órdenes del panel idempotentes por ID, con eventos, vencimiento a los 30 s, acuses validados que no retroceden y reserva que impide abrir sesiones hasta confirmar el efecto. Un reinicio/apagado aceptado libera la PC cuando vuelve a conectar. Por ahora solo bloquear o reiniciar/apagar una PC libre; el resto se activa en T29–T40. Batería correcta: 1 733 tests. Pendiente: PostgreSQL real antes de entregar y la ejecución en el agente (T29–T31).

- **2026-10-21:** T28a: el nodo calcula el contexto de control de cada PC por su ocupación (libre, sesión con su pausa o mantenimiento) y cambia la revisión solo si la ocupación cambia. Lo envía tras `hello` y cuando un latido trae otra copia. Login, temporal y restauración se rechazan (`pc_unavailable`) con una orden en curso o un mantenimiento. Migración 0029. Siguiente T28b.

- **2026-10-21:** el mantenedor autoriza T28–T42 sin VM y con T22 aplazada. T34: primero el diseño para aprobar. T37 espera a T10; T38/T40 solo en lo independiente. T31 se prueba pidiendo y anulando un reinicio; T33 con captura local y encendido físico en T58. Siguiente T28.

- **2026-10-19:** T27b/T27 completas en desarrollo: ensayo con el proceso del agente matado de verdad. Bloqueada sigue bloqueada. Activa pasa al bloqueo en 24 ms, sin sesión ni Alt+Tab. Pausada conserva el bloqueo y el silencio. Un agente nuevo con el nodo caído no concede nada ni devuelve el sonido; al volver el nodo, la pausa sigue y reanudar restaura el audio. Batería correcta, 1 709 tests. Bloque T23–T27 terminado; T22 aplazada sigue pendiente. Sin probar: SCM (T15c3) y juegos/anticheat (T56).

- **2026-10-19:** T27a: sin agente, el host bloquea, olvida la sesión, muestra el bloqueo sin sesión y congela el silencio. Un agente reiniciado no publica estado hasta oír al nodo, y así no devuelve el sonido en plena pausa. 408 nativos. Siguiente T27b.
