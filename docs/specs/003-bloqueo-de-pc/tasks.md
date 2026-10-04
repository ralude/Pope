# Tareas 003: Arranque y bloqueo de la PC cliente

- **Estado:** Borrador (2026-10-04), solicitado por el mantenedor a partir del plan existente.
- **Plan:** [plan.md](plan.md), en Borrador.

Reglas: una tarea = un commit. Marca `[x]` en el mismo commit que la implementa y
actualiza `ESTADO.md`. Cada commit deja el repo compilando y con los tests en verde;
el cuerpo y los tests citan los REQ. Si excede unas 400 líneas, dividir antes de ejecutar.

**Este borrador no autoriza implementar.** Primero aprobar spec, plan y tareas; aceptar
ADR-0017/0018 antes de construir sobre ellos. La redacción anticipada responde a la
petición del mantenedor; ninguna tarea está terminada ni hay cuentas de Windows modificadas.

**Dependencias:** ejecutar en orden, una tarea a la vez. T09/T10 deben demostrar el
mecanismo nativo antes de integrarlo; si fallan, revisar ADR/plan y detener las tareas
dependientes. Confirmar Windows/edición, congelador y persistencia antes de T48–T54;
registrar juegos/monitores/audio antes de T09/T21/T24/T25 y NIC/Wake-on-LAN antes de T58.

La **fase 2 de la spec 002** se implementa aquí en T23–T25 y se verifica en T56; incluye
regresiones de T17/T22/T27/T55. Sus 19 tareas de fase 1 permanecen aprobadas y completas.
La lista no implementa el catálogo ni restauración de perfiles de la spec 004.

## Tareas

### Contratos y datos

- [ ] **T01: Contratos de registro y autenticación de PCs**
  - **Cubre:** REQ-003-10, REQ-003-11, REQ-003-63.
  - **Hacer:** añadir esquemas zod en `packages/shared` para códigos, registro, credencial, MAC y errores; fijar versión y transición desde el canal provisional según el plan aprobado.
  - **Verificar:** datos válidos/inválidos, caducidad expresada en UTC, rechazo de campos secretos en respuestas ordinarias y compatibilidad de mensajes existentes.
  - **Commit:** `feat(shared): define el registro autenticado de PCs`.

- [ ] **T02: Contratos de órdenes y mantenimiento**
  - **Cubre:** REQ-003-20, REQ-003-21, REQ-003-40, REQ-003-41, REQ-003-43, REQ-003-44, REQ-003-45.
  - **Hacer:** definir solicitudes, actor, IDs, estados, acuses, errores, mantenimiento y salida offline en `shared`; separar estado de sesión, orden solicitada y efecto confirmado.
  - **Verificar:** validación de cada variante, duplicados, ausencia de comandos/rutas libres y distinción entre aceptar reinicio y demostrar que se completó.
  - **Commit:** `feat(shared): define órdenes y mantenimiento de PCs`.

- [ ] **T03: Contratos del fondo global**
  - **Cubre:** REQ-003-70, REQ-003-71, REQ-003-72, REQ-003-73, REQ-003-74, REQ-003-75, REQ-003-76.
  - **Hacer:** definir metadatos, fondo por defecto, mensaje de cambio, respuestas HTTP, SHA-256, tamaños y progreso; fijar en el plan aprobado las unidades exactas de los límites.
  - **Verificar:** hash/tamaño/dimensiones inválidos, eliminación y reconexión; no incluir bytes de imagen en eventos ni en WebSocket.
  - **Commit:** `feat(shared): define el fondo global de bloqueo`.

- [ ] **T04: Migración de registro y credenciales**
  - **Cubre:** REQ-003-10, REQ-003-11, REQ-003-22, REQ-003-63.
  - **Hacer:** extender `pcs` y crear códigos/credenciales en `apps/server` con hashes, consumo, revocación e índices; generar una migración nueva con Drizzle.
  - **Verificar:** migración sobre base existente, unicidad y consumo concurrente con PGlite y PostgreSQL real; ninguna credencial de respaldo pública para PCs antiguas.
  - **Commit:** `feat(server): guarda el registro seguro de PCs`.

- [ ] **T05: Migración de control y mantenimiento**
  - **Cubre:** REQ-003-20, REQ-003-41, REQ-003-43, REQ-003-44, REQ-003-45.
  - **Hacer:** crear datos de órdenes, reserva de PC, mantenimiento e intentos técnicos según el plan; índices de idempotencia y una entrada abierta por PC.
  - **Verificar:** restricciones, fechas UTC, duraciones enteras y concurrencia en ambos motores; conservar tablas de sesiones y cookies existentes.
  - **Commit:** `feat(server): guarda el control y mantenimiento de PCs`.

- [ ] **T06: Migración de metadatos del fondo**
  - **Cubre:** REQ-003-70, REQ-003-71.
  - **Hacer:** añadir los metadatos del único fondo global y su revisión, sin guardar la imagen en PostgreSQL; generar migración nueva, sin implementar todavía los endpoints.
  - **Verificar:** estado inicial por defecto, restricciones de metadatos y migración sobre base existente en ambos motores.
  - **Commit:** `feat(server): guarda los metadatos del fondo global`.

- [ ] **T07: Exportación del protocolo para C#**
  - **Cubre:** REQ-003-63; ADR-0002.
  - **Hacer:** exportar JSON Schema y fixtures válidos/inválidos desde los esquemas zod, incluyendo mensajes existentes y nuevos; versionar los artefactos de compatibilidad.
  - **Verificar:** los fixtures pasan/fallan donde corresponde, exportación reproducible y detección de cambios incompatibles sin duplicar reglas de negocio.
  - **Commit:** `build(shared): exporta el protocolo para el cliente Windows`.

### Base nativa y conexión

- [ ] **T08: Solución y pruebas nativas**
  - **Cubre:** REQ-003-02, REQ-003-60, REQ-003-62, REQ-003-63.
  - **Hacer:** crear `apps/native` con servicio, host y tests; fijar SDK/framework y dependencias justificadas tras comprobar Windows; consumir fixtures T07 y documentar comandos.
  - **Verificar:** build/test/publicación `win-x64`, contratos JSON en C# y ausencia de lógica de saldo o cobro; compilar en desarrollo, no en el nodo.
  - **Commit:** `build(native): prepara el servicio y host de Windows`.

- [ ] **T09: Prototipo de escritorio separado y WebView2**
  - **Cubre:** REQ-003-30, REQ-003-33; REQ-002-04, REQ-002-05; CA-002-02.
  - **Hacer:** probar en VM/PC aislada creación, ACL y cambio de escritorio con host estándar y WebView2; documentar cada P/Invoke y el reparto de hilos/procesos.
  - **Verificar:** juego exclusivo sin entrada durante bloqueo, vuelta al escritorio de uso, apps intactas y ninguna ventana WebView2 trasladada después de crearla; registrar evidencia.
  - **Commit:** `test(native): valida el escritorio separado con WebView2`.

- [ ] **T10: Prototipo de mantenimiento elevado**
  - **Cubre:** REQ-003-40, REQ-003-43; ADR-0018.
  - **Hacer:** demostrar con una cuenta Windows existente token elevado, perfil/escritorio y cierre exclusivo; ensayar permisos y límites del servicio en sesión 0 sin elevar WebView2.
  - **Verificar:** Windows completo administrativo, usuario cliente sigue limitado, salida conserva datos previos y fallo de credenciales vuelve a bloqueo; documentar mecanismo antes de integrarlo.
  - **Commit:** `test(native): valida el mantenimiento con cuenta Windows existente`.

- [ ] **T11: Transporte cifrado del nodo**
  - **Cubre:** REQ-003-63; ADR-0017.
  - **Hacer:** configurar HTTPS/WSS y certificados en `apps/server` según ADR aceptado, con guía de confianza y rotación; mantener operación por LAN sin internet.
  - **Verificar:** conexión válida, certificado ajeno/caducado rechazado, contraseñas ausentes de logs y funcionamiento local sin nube.
  - **Commit:** `feat(server): cifra la conexión del cliente Windows`.

- [ ] **T12: Emisión y consumo de códigos de instalación**
  - **Cubre:** REQ-003-10, REQ-003-11; CA-003-11.
  - **Hacer:** implementar endpoints de registro: encargado/administrador generan, un uso, 600 s; crear PC/nombre/credencial y evento atómicamente; definir recuperación si se pierde la respuesta.
  - **Verificar:** dueño rechazado, caducidad exacta, doble consumo concurrente y respuesta perdida sin duplicar PC ni reutilizar código consumido.
  - **Commit:** `feat(server): registra PCs con códigos de instalación`.

- [ ] **T13: Autenticación del WebSocket de PCs**
  - **Cubre:** REQ-003-11, REQ-003-63.
  - **Hacer:** autenticar antes del upgrade `/pc`, derivar identidad de la credencial y verificar `hello`; adaptar gateway/tests manteniendo límites de mensajes y conexión.
  - **Verificar:** agente desconocido, credencial revocada, `pcId` ajeno, mensajes malformados y conexión duplicada; sin acceso anónimo de producción.
  - **Commit:** `feat(server): autentica el canal de PCs`.

- [ ] **T14: Simulador con registro autenticado**
  - **Cubre:** REQ-003-10, REQ-003-11, REQ-003-63.
  - **Hacer:** adaptar `tools/agent-sim` al registro, certificado y protocolo elegido; separar explícitamente credenciales de pruebas y configuración de producción.
  - **Verificar:** login/latidos/pausa existentes con autenticación, PC falsa rechazada y secretos omitidos de salida, argumentos y archivos versionados.
  - **Commit:** `feat(tools): autentica las PCs del simulador`.

- [ ] **T15: Ciclo de vida del servicio y custodia local**
  - **Cubre:** REQ-003-02, REQ-003-63.
  - **Hacer:** implementar arranque/parada de `Pope.Agent`, configuración validada, custodia según ADR y logs acotados; separar servicio sin UI del usuario interactivo.
  - **Verificar:** parada limpia, configuración corrupta, permisos del usuario cliente denegados y ausencia de secretos; ejecutar como servicio solo en entorno de pruebas.
  - **Commit:** `feat(native): inicia el agente y protege su configuración`.

- [ ] **T16: Conexión y reconexión del agente**
  - **Cubre:** REQ-003-02, REQ-003-04, REQ-003-63.
  - **Hacer:** mantener un WebSocket autenticado con certificado verificado, `hello`, latidos y reintentos acotados; no conectar React directamente al nodo en producción.
  - **Verificar:** corte/reconexión, cambio de nodo no confiable, un solo canal/temporizador y memoria estable durante reintentos prolongados.
  - **Commit:** `feat(native): mantiene la conexión autenticada con el nodo`.

- [ ] **T17: Estado de sesión y cuenta local monotónica**
  - **Cubre:** REQ-003-04; REQ-002-30, REQ-002-31; ADR-0007.
  - **Hacer:** conservar el último estado autorizado y descontar solo el restante permitido, sin calcular tarifas; reconciliar identidad tras reinicio sin inventar un `hello` que cierre sesión.
  - **Verificar:** cambio de reloj, host reiniciado, corte en sesión/pausa, agotamiento offline y arranque bloqueado; el nodo sigue siendo fuente de verdad.
  - **Commit:** `feat(native): conserva el estado autorizado de la sesión`.

- [ ] **T18: Pipe seguro entre servicio y host**
  - **Cubre:** REQ-003-63; ADR-0017.
  - **Hacer:** implementar mensajes enmarcados, límites, ACL y verificación de PID/sesión del host lanzado; separar solicitudes UI y acciones nativas permitidas.
  - **Verificar:** proceso impostor del mismo usuario, PID reutilizado, cliente remoto, frame truncado y exceso de cola; no registrar contraseñas.
  - **Commit:** `feat(native): protege el puente local con el host`.

- [ ] **T19: Host de WebView2 con interfaz empaquetada**
  - **Cubre:** REQ-003-01, REQ-003-03, REQ-003-04, REQ-003-63.
  - **Hacer:** alojar `shell-ui` local con origen virtual permitido y puente tipado; limitar navegación, ventanas nuevas, descargas y herramientas de desarrollo de producción.
  - **Verificar:** pantalla sin nodo, origen/mensaje falsificado rechazado, host sin elevación y credencial de PC inaccesible a JavaScript.
  - **Commit:** `feat(native): aloja el Shell local en WebView2`.

- [ ] **T20: Transporte WebView2 de PcChannel**
  - **Cubre:** REQ-003-03, REQ-003-04, REQ-003-63.
  - **Hacer:** implementar el adaptador de `PcChannel` en `apps/shell-ui`; mantener transporte de desarrollo separado y todas las pantallas sobre la interfaz existente.
  - **Verificar:** solicitudes/respuestas correlacionadas, desconexión, reintentos y limpieza de listeners; solo el agente envía `hello` y latidos.
  - **Commit:** `feat(shell-ui): conecta el Shell con el puente de WebView2`.

### Bloqueo y fase 2 de pausa

- [ ] **T21: Bloqueo nativo y atajos restringidos**
  - **Cubre:** REQ-003-03, REQ-003-30, REQ-003-33.
  - **Hacer:** integrar el mecanismo demostrado en T09, escritorio de bloqueo y hook según estado/foco; liberar solo tras estado autorizado del nodo.
  - **Verificar:** Win, Alt+Tab, Ctrl+Esc, Alt+F4, clics y varios monitores; fallo de cambio no confirma éxito ni abre el escritorio de uso.
  - **Commit:** `feat(native): aplica el bloqueo en un escritorio separado`.

- [ ] **T22: Supervisión y relanzamiento del host**
  - **Cubre:** REQ-003-32; CA-003-02.
  - **Hacer:** detectar salida, bloqueo de UI y fallo de renderer; relanzar el host preservando estado y cuenta, sin crear instancias competidoras.
  - **Verificar:** matar/colgar host y renderer, recuperación total < 3 s y ningún acceso al juego bloqueado durante el hueco; medir detección y relanzamiento.
  - **Commit:** `feat(native): recupera el host cuando falla`.

- [ ] **T23: Pausa y reanudación en escritorios reales**
  - **Cubre:** REQ-002-04, REQ-002-05, REQ-002-10, REQ-002-13, REQ-002-30, REQ-002-31.
  - **Hacer:** aplicar pausa del nodo en el escritorio separado; conservar juegos, confirmar reanudación y mantener bloqueo si la pausa vence cobrando o pierde LAN.
  - **Verificar:** ninguna entrada al juego, procesos sin suspender/cerrar, pausa vencida, opción de cierre y reanudación desde panel; sin decisión local de cobro.
  - **Commit:** `feat(native): aplica la pausa sin cerrar los juegos`.

- [ ] **T24: Silencio y restauración de audio de pausa**
  - **Cubre:** REQ-002-07.
  - **Hacer:** silenciar dispositivos/sesiones de audio conforme al mecanismo probado y conservar estado previo; restaurarlo al reanudar sin duplicar capturas tras reconexión.
  - **Verificar:** juego exclusivo, varios dispositivos, cambio de salida, mute previo y host reiniciado; recuperación conserva volumen/mute originales.
  - **Commit:** `feat(native): silencia y restaura el audio durante la pausa`.

- [ ] **T25: Acceso a Pausar durante el juego**
  - **Cubre:** REQ-002-01, REQ-002-02, REQ-002-50.
  - **Hacer:** implementar el acceso a Pope elegido por el mantenedor para pantalla exclusiva; conservar confirmación y límites actuales, sin habilitar acceso a Windows.
  - **Verificar:** acceso con cada modo de juego y anticheat, cancelación sin pausa, temporal sin botón y medición desde confirmar Pausar hasta bloquear entrada < 1 s.
  - **Commit:** `feat(native): permite acceder a Pope durante el juego`.

- [ ] **T26: Cierre de procesos del cliente**
  - **Cubre:** REQ-003-34; CA-003-08.
  - **Hacer:** controlar pertenencia de juegos/lanzadores/procesos auxiliares y cerrarlos al terminar; proteger Pope, servicios y otros usuarios, sin reiniciar ni restaurar perfiles de la 004.
  - **Verificar:** cierre, agotamiento, bloqueo y temporal; no cerrar apps en pausa ni procesos del cliente siguiente; ensayar anticheat en PC real.
  - **Commit:** `feat(native): cierra los procesos del cliente al terminar`.

- [ ] **T27: Fallo completo y reinicio del servicio**
  - **Cubre:** REQ-003-02, REQ-003-03, REQ-003-32; REQ-002-30, REQ-002-31.
  - **Hacer:** implementar la recuperación aprobada ante pérdida del agente, distinta de T22; proteger bloqueo y reconciliar estado sin conceder entrada técnica normal offline.
  - **Verificar:** matar servicio con PC bloqueada/activa/pausada, reinicio sin nodo, journal corrupto y ausencia de tiempo adicional; no sustituir el acceso de emergencia T53/T54.
  - **Commit:** `feat(native): recupera el control tras reiniciar el servicio`.

### Control remoto y mantenimiento

- [ ] **T28: Órdenes idempotentes y reserva de PC**
  - **Cubre:** REQ-003-20, REQ-003-41, REQ-003-43.
  - **Hacer:** implementar solicitud/acuse/resultado con eventos y reserva transaccional; serializar sobre la misma PC todos los caminos de login, temporal, restauración y mantenimiento.
  - **Verificar:** doble clic, ACK duplicado/tardío, orden vencida, desconexión y login concurrente; no ejecutar órdenes viejas sobre otra sesión.
  - **Commit:** `feat(server): coordina las órdenes y reservas de PCs`.

- [ ] **T29: Bloquear mediante el cierre existente**
  - **Cubre:** REQ-003-20, REQ-003-34; REQ-001-69.
  - **Hacer:** enlazar Bloquear/cerrar/agotamiento con cierre de negocio, bloqueo nativo y limpieza T26; liberar la reserva solo al confirmar el efecto.
  - **Verificar:** cuenta activa/pausada y temporal, sin cobro tras cierre; limpieza fallida mantiene reserva y no admite un cliente nuevo por accidente.
  - **Commit:** `feat(server): cierra la sesión antes de bloquear la PC`.

- [ ] **T30: Reiniciar y apagar con confirmación de estado**
  - **Cubre:** REQ-003-20, REQ-003-41; REQ-001-69.
  - **Hacer:** validar confirmación ligada al estado actual; cerrar sesión activa/pausada o terminar mantenimiento antes de emitir la orden, conservando actor y eventos.
  - **Verificar:** estado cambiado después de confirmar, temporal con aviso de pérdida, salida técnica registrada y orden no enviada si falla el cierre previo.
  - **Commit:** `feat(server): prepara reinicios y apagados confirmados`.

- [ ] **T31: Ejecución nativa de órdenes de energía**
  - **Cubre:** REQ-003-20, REQ-003-61.
  - **Hacer:** ejecutar solo variantes autorizadas de reinicio/apagado, guardar resultado/ID antes del efecto y devolver aceptación o fallo de Windows sin executor genérico.
  - **Verificar:** duplicado tras reconectar/reiniciar, expiración, permiso insuficiente y orden malformada; desconexión no equivale a apagado comprobado.
  - **Commit:** `feat(native): ejecuta reinicios y apagados autorizados`.

- [ ] **T32: Mensajes del encargado a la PC**
  - **Cubre:** REQ-003-20, REQ-003-61.
  - **Hacer:** integrar envío, transporte y presentación elegida en nodo/host/Shell; validar texto, destinatario, vigencia y límites acordados, sin HTML ejecutable.
  - **Verificar:** foco/duración conforme a la decisión, contenido malicioso y estados permitidos; mensaje retrasado no aparece al siguiente cliente ni se marca entregado por enviarlo.
  - **Commit:** `feat(shell-ui): muestra los mensajes del encargado`.

- [ ] **T33: Wake-on-LAN y aviso de dos minutos**
  - **Cubre:** REQ-003-22; CA-003-06.
  - **Hacer:** enviar paquete mágico desde el nodo a la NIC/MAC configurada; registrar actor y observar conexión, avisar a los 120 s y retirar aviso si conecta después.
  - **Verificar:** paquete/MAC correctos, dueño rechazado, temporizadores acotados y llegada tardía; no diagnosticar avería ni confirmar arranque por enviar UDP.
  - **Commit:** `feat(server): enciende PCs por Wake-on-LAN`.

- [ ] **T34: Revocación conservando la sesión**
  - **Cubre:** REQ-003-11, REQ-003-63.
  - **Hacer:** implementar la parte del nodo tras resolver cobro/permisos y desglosar la recuperación; preservar sesión, distinguir revocación autenticada de fallo TLS y coordinar bloqueo nativo de T21.
  - **Verificar:** revocación en canal vivo y al reconectar, jobs/reconcile no cierran sesión conservada y PC revocada no inicia una nueva; validar autorización y recepción del bloqueo.
  - **Commit:** `feat(server): conserva la sesión al revocar una PC`.

- [ ] **T35: Autorización técnica local y remota**
  - **Cubre:** REQ-003-40, REQ-003-41, REQ-003-43.
  - **Hacer:** validar encargado/administrador en el nodo sin crear cookie del panel; reservar PC y emitir autorización específica; aplicar la regla de sesión previa que se apruebe para entrada local.
  - **Verificar:** dueño/inactivo/contraseña errónea, carreras con login y entrada remota con activa/pausada; fallo de preparación no registra mantenimiento iniciado.
  - **Commit:** `feat(server): autoriza el mantenimiento de PCs`.

- [ ] **T36: Diez fallos técnicos y aviso al panel**
  - **Cubre:** REQ-003-45; CA-003-10.
  - **Hacer:** aplicar por cuenta 10 fallos consecutivos, bloqueo de 60 s, reset por éxito/vencimiento y un evento/aviso por bloqueo; mantener intacto login del panel.
  - **Verificar:** intentos desde varias PCs, concurrencia en décimo fallo, reinicio del nodo, éxito intermedio y un solo aviso; sin enumeración de cuentas ni contraseñas en logs.
  - **Commit:** `feat(server): limita los intentos del login técnico`.

- [ ] **T37: Entrada administrativa nativa**
  - **Cubre:** REQ-003-40, REQ-003-41, REQ-003-43.
  - **Hacer:** integrar el mecanismo demostrado en T10 y la autorización T35; iniciar entorno de la cuenta Windows existente y confirmar entrada física al nodo.
  - **Verificar:** elevación real, perfil/procesos separados, contraseña Windows cambiada, nodo ausente y preparación fallida; WebView2/cliente sin privilegios nuevos.
  - **Commit:** `feat(native): abre el mantenimiento autorizado de Windows`.

- [ ] **T38: Formulario y pestaña técnica**
  - **Cubre:** REQ-003-40, REQ-003-42, REQ-003-43.
  - **Hacer:** añadir login técnico local del Shell y pestaña plegada central del entorno de mantenimiento; mostrar PC/actor y Terminar y bloquear, sin tiempo transcurrido.
  - **Verificar:** roles/errores, paso del ratón, controles no tapados y salida local/remota; no introducir contraseñas Windows en React ni elevar WebView2.
  - **Commit:** `feat(shell-ui): muestra el acceso y los controles técnicos`.

- [ ] **T39: Conciliación de salida técnica en el nodo**
  - **Cubre:** REQ-003-41, REQ-003-43, REQ-003-44; CA-003-09.
  - **Hacer:** validar reporte contra autorización/PC, persistir salida/actor/duración y emitir evento una vez; responder ACK idempotente y liberar reserva tras estado bloqueado confirmado.
  - **Verificar:** reportes falsificados, ACK perdido, duplicados/concurrencia y reconexión con salida pendiente; no conservar rojo ni reabrir mantenimiento por un snapshot obsoleto.
  - **Commit:** `feat(server): concilia la salida técnica pendiente`.

- [ ] **T40: Salida técnica nativa durable**
  - **Cubre:** REQ-003-41, REQ-003-43, REQ-003-44; CA-003-09.
  - **Hacer:** terminar procesos propios de mantenimiento, bloquear localmente, persistir salida antes de perderla y reenviar al nodo hasta ACK; registrar actor/duración una sola vez.
  - **Verificar:** LAN perdida conserva mantenimiento, salida funciona offline, reinicio durante cada etapa, ACK perdido/duplicado y cola acotada sin descartar auditoría pendiente.
  - **Commit:** `feat(native): conserva la salida del mantenimiento sin red`.

- [ ] **T41: Controles y mantenimiento en el mapa**
  - **Cubre:** REQ-003-20, REQ-003-21, REQ-003-22, REQ-003-43; CA-003-07.
  - **Hacer:** activar controles existentes en `apps/panel`, resultados/errores/confirmaciones y rojo técnico con actor; mantener gris, verde, celeste, ámbar y morado según estado aprobado.
  - **Verificar:** permisos, doble clic, estado cambiado, pérdida de tiempo temporal y desconexión; comprobación manual del mapa y tests de la lógica/ApiClient.
  - **Commit:** `feat(panel): controla las PCs y muestra el mantenimiento`.

- [ ] **T42: Registro de PCs y alertas técnicas en panel**
  - **Cubre:** REQ-003-10, REQ-003-45.
  - **Hacer:** añadir generación/caducidad de códigos para encargado/administrador y aviso técnico de T36; presentar códigos solo en el flujo de instalación, sin guardarlos en logs.
  - **Verificar:** dueño sin generación, caducidad de 10 min y una alerta por bloqueo; prueba manual de pantallas y validación de respuestas.
  - **Commit:** `feat(panel): registra PCs y avisa de bloqueos técnicos`.

El resto del borrador (fondo, instalación, emergencia y verificación) continúa en redacción. No implementar esta lista parcial.
