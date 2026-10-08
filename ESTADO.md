# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-08 · revisión de sesión Windows preparada; aclarar UAC antes de otra ruta T10

## Ahora

| | |
|---|---|
| **Spec en curso** | [003 · Arranque y bloqueo de PC](docs/specs/003-bloqueo-de-pc/spec.md): T01–T09 completos; T10–T20 autorizadas para continuación autónoma; T21–T59 en Borrador. La 005 mantiene su T07 de revisión |
| **Siguiente tarea** | T10d2: resolver con el mantenedor el alcance de elevación de ADR-0029 Propuesto (Windows normal de administrador con UAC frente a Explorer/todo elevado). Revisión documental T10d2r preparada; después concretar/aprobar entrada, retorno y recuperación antes de construir. ADR-0018 sigue vigente; T10 abierta, no avanzar T11. T09 cerrada; juegos reales/anticheat pendientes en T25/T56 |
| **Progreso** | Spec 003: 9 / 59 grupos; T01–T09 completas. Pruebas Home aceptadas para T08b (2026-10-08); continuación T09–T20 autorizada. Spec 002: 19 / 19 tareas (fase 1), fase 2 en tasks 003. Spec 005: 41 / 42 |
| **Bloqueos** | Compatibilidad Windows 10 Pro 22H2 y Windows 11 Pro 25H2 pendiente antes de entregar al local; ya no bloquea T09 por aprobación explícita del mantenedor (2026-10-08). Guest Control recuperado: en la VM Home 22H2 (19045.2965), 8192 MB y ahora 4 vCPU, ambos artefactos autocontenidos arrancan y pasan los 334 tests, sin omitidos. Home aceptado como evidencia para cerrar T08b/T08. T09 completa: escritorio/WebView2/entrada/Alt+Tab y juego exclusivo verificados en VM, aceptados por el mantenedor; pruebas físicas de juegos reales/anticheat en T25/T56 antes de entrega. T10 parcial con ADR-0018 Aceptado: custodia/token/perfil/ACL, WebView2 limitado y cierre de ventana/hijo pasan en VM, pero Explorer lanzado termina; Windows completo y muerte del broker pendientes. Revisar ruta antes de integrar/avanzar T11. Retiro de credencial/servicio/árbol/procesos propios y retorno original comprobados. VM usa vboxuser con token medio/alto; cuenta cliente estándar/perfiles distintos aún sin demostrar. Contrato de T07 resuelto: opción A, recorte exterior solo del usuario con reglas exportadas para C#. Inventario confirmado: 12 PCs Windows 10 Pro 22H2 y una Windows 11 Pro 25H2, sin congelador. Compatibilidad y persistencia nativas pendientes de verificar. Revocación: consumo detenido, misma PC/sesión con credencial nueva, encargado/administrador, código local de un uso/10 min y vuelta al estado previo con pausa conservada confirmados (opciones A, ADR-0020/0021/0022, REQ-002-33). Contratos/prueba del asistente y confirmación temporal pendientes. Emergencia: reglas de uso cerradas en ADR-0024 a ADR-0028, con auditoría por cuenta Windows/PC/entrada/salida UTC sin nombre ni motivo; mecanismo, contratos/actor y pruebas pendientes |

## Cómo retomar

El mantenedor aprueba la validación por tarea de `AGENTS.md`: comprobaciones pertinentes
por commit, batería completa al cierre de cada Txx, Windows 11 de desarrollo primero
para pruebas aisladas/reversibles y VM después para las que alteran el sistema. La
aprobación no cierra el gate funcional de T10 ni autoriza construir una ruta alternativa
sin revisar y aprobar el mecanismo.

La [propuesta ADR-0029](docs/adr/0029-sesion-windows-de-mantenimiento-con-uac.md) documenta
que el inicio normal de una cuenta administradora usa Explorer limitado con UAC; otra
sesión no garantiza Explorer elevado. La pregunta de alcance está en la spec y requiere
respuesta antes de implementar. Entrada/retorno automatizados y recuperación aún no
están demostrados; no instalar proveedores ni modificar Windows a partir del borrador.

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
- [ ] **Plan 003:** revisar [ADR-0017](docs/adr/0017-comunicacion-segura-del-cliente-windows.md) y [ADR-0018](docs/adr/0018-mantenimiento-con-cuenta-windows-existente.md). Host WinForms + WebView2 confirmado en [ADR-0019](docs/adr/0019-host-del-shell-en-winforms.md); SDK/tests/compatibilidad pendientes. El mantenedor eligió reutilizar una cuenta administradora Windows existente; ADR-0018 aprobado el 2026-10-08; falta demostrar elevación, custodia y salida en T10. No se ha modificado ninguna cuenta de Windows.
- [ ] **Ajustes en el panel:** ya existe «Ajustes del local» (spec 005, T23b) con el nombre del local y «Permitir vender sin stock». La gracia de latidos y las sesiones temporales conservadas (spec 001) siguen sin pantalla, sin tarea; hasta entonces, por la API (`PUT /settings`).
- [ ] **Spec 005, parte 2:** imprimir en papel el PDF del encargado (se comprobó que se descarga y ocupa una página) y medir REQ-005-71 (una venta en menos de 500 ms) en el i3-2120 del local, con las mediciones de la spec 001. Ver [`mediciones.md`](docs/specs/005-inventario-y-caja/mediciones.md).
- [ ] **Spec 008:** averiguar si el plan de SENET del local incluye acceso a la API y quién tiene las credenciales.
- [ ] **Simulador, `seed`:** `openShift()` envía `POST /shifts` sin los fondos exigidos por la spec 005. Con caja cerrada falla con «Datos no válidos»; para T18 se abrió la caja desde el panel y la preparación terminó. Corregir en una tarea aparte; no forma parte de la pausa.

## Mapa de specs

| Spec | Estado | Progreso |
|---|---|---|
| [001 Cuentas y sesiones](docs/specs/001-cuentas-y-sesiones/spec.md) | Implementada (REQ-001-13, Bs, verificado en T07 de la 005; en revisión) | 69 / 69 |
| [002 Pausa de sesión](docs/specs/002-pausa-de-sesion/spec.md) | Fase 1 implementada, verificada y aprobada. Fase 2 pendiente de la spec 003 | 19 / 19 |
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | T01–T09 completos; T10–T20 autorizadas; compatibilidad Pro pendiente antes de entrega; T21–T59 Borrador | 9 / 59 |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | En curso: partes 1 (tasa) y 2 (inventario y caja) aprobadas; parte 2 verificada; parte 1 en revisión (T07); parte 3 en borrador | 41 / 42 |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-08:** T10d2r documental preparada: ADR-0029 Propuesto para sesión Windows propia con UAC, fuentes Microsoft y etapas de prueba. Explorer normal usa token limitado; pendiente confirmar si el mantenedor acepta ese alcance o exige todo elevado. Entrada mediante proveedor V2, retorno autenticado y supervisor son candidatos por concretar/probar; no se añaden lenguajes, credenciales, cuentas ni políticas. ADR-0018 vigente; T10/T10d2 abiertas, 9/59. Solo documentos: diff/enlaces revisados, sin repetir pipeline automático. Siguiente: respuesta de alcance, luego diseño/aprobación del mecanismo.

- **2026-10-08:** estrategia de validación por tarea y Windows de desarrollo → VM aprobada y guardada en AGENTS.md. Pipeline pendiente de T10 completado: formato/lint/tipos/build pasan; 1 581 tests correctos (1 247 TS + 334 nativos). Fixture DPAPI/token limitado pasa en Windows 11 de desarrollo 26H2/26300.9457; sin cambios del sistema. Caché y compilación nativa compartida entre build/tipos; sin repetir publicación/VM. Siguiente revisión elegida: sesión Windows independiente, sin construirla aún. T10 permanece abierta por el gate de Explorer; no avanzar T11.

- **2026-10-08:** T10d1b publicada/comprobada y T10d2 parcial en VM (16:17:56 UTC). Mantenedor completa entrada privada/UAC. DPAPI/ACL/propietario SYSTEM/reemplazo, token completo 12288, cliente limitado 8192/logon distinto, perfil/aislamiento, WebView2 y cierre exclusivo de ventana/hijo pasan. Explorer lanzado termina: Windows completo sin demostrar, fase de muerte del broker no ejecutada. Retorno y limpieza completos, Explorer previo vivo; sin cambios de cuentas/grupos/UAC. Revisión automática rechaza informes/capturas completos; resultado técnico sanitizado guardado. T10 abierta, 9/59; siguiente revisar ADR/plan, detener T11.

- **2026-10-08:** T10d1a preparada: instalador privado elevado, servicio/binarios/archivos por GUID, importación/reemplazo y verificación de propietario/DACL SYSTEM. Exporta solo informes y retira custodia/servicio/árbol propios. Build/checks en verde; instalación y retirada reales pendientes en VM, sin credencial capturada todavía. T10 abierta, 9/59; siguiente T10d1b.

- **2026-10-08:** T10c3 preparada: coordinación de token/perfil/ACL, credencial ficticia inválida, padre/hijo/job, continuidad WebView2 y retorno a bloqueo externo. Explorer debe seguir en el nuevo logon elevado y escritorio/job; salida o delegación falla sin matar procesos por nombre. Datos/procesos previos se comprueban. Build/checks en verde; aún sin ejecución elevada en VM. T10 abierta, 9/59; siguiente T10d1 (runner y publicación), luego T10d2.

- **2026-10-08:** T10c2 preparada: ventana/hijo administrativo sin WebView2, rechazo de SYSTEM/no elevación y evidencia de token/perfil/escritorio. Cliente limitado prueba DACL del escritorio, custodia y duplicación del token. Build/checks en verde; aún no ejecutado con credencial real. T10 abierta, 9/59; siguiente T10c3.

- **2026-10-08:** T10c1 preparada: APIs de carga/entorno/descarga de perfil y escritorios con ACL SYSTEM/SID del nuevo logon. ACE propia de estación sin CREATEDESKTOP/EXITWINDOWS, retirada selectiva; no borrar perfiles ni permisos ajenos. Se solicita acceso de ajuste explícito al token del broker para activar privilegios ya concedidos. Build/checks en verde; propiedades reales pendientes en VM. T10 abierta, 9/59; siguiente T10c2.

- **2026-10-08:** T10b2 preparada: broker ServiceBase SYSTEM en sesión 0, ayudante sin GUI en consola y operaciones fijas por GUID. Reutiliza dependencia T08; Job Object sin breakaway, asignación suspendida y plazo 120 s. Build/locks/checks en verde; aún sin servicio instalado ni token administrativo demostrado. T10c dividida previamente en perfil/ACL, ventanas y coordinación. T10 abierta, 9/59; siguiente T10c1.

- **2026-10-08:** T10b1 preparada: primitivas Win32 de logon interactivo, token vinculado/primario, sesión y token cliente limitado; todas con comentarios. Consulta real en desarrollo confirma token limitado (tipo 3), integridad 8192, sesión 1 y SID/logon coherentes. Sin autenticación administrativa ni cambios de Windows; obtención desde SYSTEM pendiente en VM. T10 abierta, 9/59; siguiente T10b2.

- **2026-10-08:** T10a preparada: DPAPI de máquina, entrada privada nativa sin persistencia plana, staging protegido y almacén SYSTEM con reemplazo atómico. Fixture pública comprueba Unicode, corrupción y rechazo fuera de SYSTEM en desarrollo. Build sin avisos; verificación efectiva de ACL/propietario/configuración y reemplazo pendiente en VM en T10d. Sin cuentas ni credenciales reales configuradas. T10 abierta, 9/59; siguiente T10b.

