# Estado del proyecto

> **Punto de entrada para retomar el trabajo.** Si acabas de abrir el proyecto (persona o
> agente de IA), empieza aquí. Este archivo se actualiza **en el mismo commit** que cada
> tarea terminada.

**Última actualización:** 2026-10-11 · T12 completa; T10 abierta; siguiente T13

## Ahora

| | |
|---|---|
| **Spec en curso** | [003 · Arranque y bloqueo de PC](docs/specs/003-bloqueo-de-pc/spec.md): T01–T09 y T11–T12 completos; T10 aplazada; T13–T20 autorizadas para continuación autónoma en esta máquina, sin VM; T21–T59 en Borrador. La 005 mantiene su T07 de revisión |
| **Siguiente tarea** | T13: autenticar el WebSocket antes del upgrade y contrastar hello v2. Continuar hasta T20 en esta máquina, sin VM (mantenedor, 2026-10-11). T10 abierta hasta realizar ese bloque. Cuenta temporal/observación/retirada VM pendientes al retomar T10; no volver a pedir la autorización ya concedida |
| **Progreso** | Spec 003: 11 / 59 grupos; T01–T09 y T11–T12 completas. Pruebas Home aceptadas para T08b (2026-10-08); continuación hasta T20 autorizada. Spec 002: 19 / 19 tareas (fase 1), fase 2 en tasks 003. Spec 005: 41 / 42 |
| **Bloqueos** | Compatibilidad Windows 10 Pro 22H2 y Windows 11 Pro 25H2 pendiente antes de entregar al local; ya no bloquea T09 por aprobación explícita del mantenedor (2026-10-08). Guest Control recuperado tras reinicio de VM autorizado el 2026-10-09; snapshot e inventario actuales en mediciones. Historial: en la VM Home 22H2 (19045.2965), 8192 MB y ahora 4 vCPU, ambos artefactos autocontenidos arrancan y pasan los 334 tests, sin omitidos. Home aceptado como evidencia para cerrar T08b/T08. T09 completa: escritorio/WebView2/entrada/Alt+Tab y juego exclusivo verificados en VM, aceptados por el mantenedor; pruebas físicas de juegos reales/anticheat en T25/T56 antes de entrega. T10 parcial con ADR-0018 Aceptado: custodia/token/perfil/ACL, WebView2 limitado y cierre de ventana/hijo pasan en VM, pero Explorer lanzado termina; Windows completo y muerte del broker pendientes. Revisar ruta antes de integrar mantenimiento; T11–T20 pueden avanzar por instrucción del mantenedor (2026-10-09). Retiro de credencial/servicio/árbol/procesos propios y retorno original comprobados. Ensayo previo usó vboxuser con token medio/alto; ahora cuenta estándar temporal creada/verificada, separación de sesión/perfiles aún pendiente. Contrato de T07 resuelto: opción A, recorte exterior solo del usuario con reglas exportadas para C#. Inventario confirmado: 12 PCs Windows 10 Pro 22H2 y una Windows 11 Pro 25H2, sin congelador. Compatibilidad y persistencia nativas pendientes de verificar. Revocación: consumo detenido, misma PC/sesión con credencial nueva, encargado/administrador, código local de un uso/10 min y vuelta al estado previo con pausa conservada confirmados (opciones A, ADR-0020/0021/0022, REQ-002-33). Contratos/prueba del asistente y confirmación temporal pendientes. Emergencia: reglas de uso cerradas en ADR-0024 a ADR-0028, con auditoría por cuenta Windows/PC/entrada/salida UTC sin nombre ni motivo; mecanismo, contratos/actor y pruebas pendientes |

## Cómo retomar

**Entorno vigente (2026-10-11):** el mantenedor pide continuar T12–T20 en esta máquina,
sin usar la VM, y mantener T10 abierta hasta realizar ese bloque. Conservar las pruebas
aisladas/reversibles; no alterar shell, autologin, cuentas, UAC ni directivas del Windows
cotidiano. Las verificaciones que exijan entorno desechable se registran como pendientes.

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
| [003 Arranque y bloqueo de la PC](docs/specs/003-bloqueo-de-pc/spec.md) | T01–T09 y T11–T12 completos; T10 aplazada; T13–T20 autorizadas en desarrollo sin VM; compatibilidad Pro pendiente antes de entrega; T21–T59 Borrador | 11 / 59 |
| [004 Lista blanca de aplicaciones](docs/specs/004-lista-blanca-de-aplicaciones/spec.md) | Borrador | — |
| [005 Inventario y caja](docs/specs/005-inventario-y-caja/spec.md) | En curso: partes 1 (tasa) y 2 (inventario y caja) aprobadas; parte 2 verificada; parte 1 en revisión (T07); parte 3 en borrador | 41 / 42 |
| [006 Sincronización y web del dueño](docs/specs/006-sincronizacion-y-web-del-dueno/spec.md) | Borrador | — |
| [007 Autorrecarga por pago móvil](docs/specs/007-autorrecarga-pago-movil/spec.md) | Borrador (futura) | — |
| [008 Migración desde SENET](docs/specs/008-migracion-desde-senet/spec.md) | Borrador | — |

## Bitácora

Las 10 entradas más recientes, la última arriba. El detalle está en `git log`.

- **2026-10-11:** T12c/T12 completas: once pruebas nuevas pasan en ambos motores; recuperación libre, 600 s exactos, consumo/nombres concurrentes, secreto entregado una vez y rollback. Batería completa correcta: formato, lint, tipos/build y tests (409 servidor en PostgreSQL 18.6, 334 nativos). Ejecución general final con `--env-mode=loose` para conservar variables de PostgreSQL/workers; primeras ejecuciones detenidas sin contabilizarlas como evidencia completa. Windows 11 Pro 26H2/26300.9457; sin VM ni cambios de Windows. Siguiente T13, 11/59, T10 abierta.

- **2026-10-11:** T12b completa: endpoints de emisión/registro con roles, RNG criptográfico, hashes SHA-256, consumo/evento transaccionales, nombre automático y respuestas no-store. Recuperación conserva PC/posición y exige disponibilidad al emitir/consumir. Tres tests HTTP, formato, lint, tipos y build del servidor correctos; siguiente T12c para ampliar evidencia y cerrar batería. Sin VM ni cambios de Windows; T10 abierta.

- **2026-10-11:** T12a completa: revisados los cambios previos de contratos/eventos y concretado el registro sin secretos, con actor del personal al emitir y sistema al consumir. Continuación T12–T20 en desarrollo sin VM por instrucción del mantenedor; T10 abierta. Build/tests de shared y comprobaciones de dependientes registradas antes del commit; siguiente T12b.

- **2026-10-09:** T11b/T11 completas: confianza/rotación TLS documentadas, arranque de desarrollo en loopback y LAN HTTPS/WSS. Batería completa: formato, lint, tipos, test y build correctos; 1 588 tests (398 servidor + 334 nativos). TLS se prueba con certificados efímeros sin internet ni cambios de Windows. Comprobación focalizada repetida tras ajustar limpieza de fixtures; sin repetir la batería de producto sin cambios. Siguiente T12; T10 aplazada, 10/59.

- **2026-10-09:** T11a implementa TLS nativo de Fastify/Node sin dependencias nuevas. HTTPS/WSS reales y rechazo de certificados/nombre/PEM/clave/caducidad, TLS antiguo, cookies Secure y ausencia de credenciales en logs comprobados con fixtures efímeros. Build/tipos correctos; cierre de batería y guía en T11b. T10 aplazada, sin cambios de Windows.

- **2026-10-09:** mantenedor aplaza T10 y autoriza seguir las siguientes tareas aprobadas. Siguiente T11 (HTTPS/WSS); T10 y la observación/retirada de fixture VM quedan pendientes. Conservada la evidencia del observador publicada antes del cambio de orden. Sin cambios de Windows.

- **2026-10-09:** observador transferido y preparado mediante UAC humano; manifiesto de despliegue, accesos/argumentos y hashes EXE/DLL coinciden. Tras aviso de ventana cliente abierta no hay proceso ni informe cliente; sin eventos Application 1000/1026 del prototipo en la consulta. Explorer sigue en sesiones 1 y 2; la sesión administrativa previa no consta cerrada. Mantenedor informa Windows preparando la cuenta y luego operativo. Pendiente confirmar arranque real, cerrar manualmente la sesión previa, observar y retirar la fixture; sin nuevos cambios de sistema ni código, T10 abierta.

- **2026-10-09:** cuenta PopeT10Client creada por el asistente privado y verificada: SID/marcador correctos, Usuarios, no Administradores, grupo administrativo/UAC intactos. Observador nativo de sesión/token/perfil/Explorer/fixture preparado; alto solo con UAC manual, sin servicios ni cambios de sesión automáticos. Build/formato correctos y 334 tests pasan; nueva API de token solo lectura coincide con WindowsIdentity en host limitado. Publicación autocontenida correcta tras restaurar configuración de runtime; no repetir paquetes TS sin cambios. Transferencia/observación/retirada pendientes; T10 abierta, 9/59.

- **2026-10-09:** ensayo mínimo autorizado («confirmo», 2026-10-08 local). Windows VM sin respuesta confirmado por mantenedor; reinicio forzado autorizado y ejecutado. Snapshot de recuperación 3f484244 guardado, luego snapshot operativo 0535d231 tras revalidar Home 22H2/19045.2965, único usuario habilitado administrador, UAC activo, cuenta temporal ausente. Preparador PowerShell privado listo: guard de UUID/modelo VM, ACL del manifiesto, SecureString, cuenta Usuarios y verificación de grupos/UAC; sintaxis y rechazo del Windows cotidiano comprobados. Sin cuenta nueva todavía ni cambio C#; no repetir pipeline de producto. T10 abierta, siguiente ejecutar preparación/observación.

- **2026-10-08:** T10d2v documental completa: ensayo mínimo Propuesto para snapshot, cuenta estándar temporal `PopeT10Client`, inicio/cambio manual Windows, Explorer normal/UAC, continuidad y retirada por SID/GUID. La preparación de VM necesita autorización explícita; no se crea cuenta ni instala proveedor. Consulta actual Guest Control agota plazo; VM figura encendida y sin snapshots, inventario anterior sin revalidar. Documentadas restricciones COM/AOT y retorno como hipótesis. Diff/enlaces revisados sin repetir pipeline de producto; T10 abierta, 9/59, siguiente aprobación/preparación T10d2s.
