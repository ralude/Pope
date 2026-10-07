# Spec 003: Arranque y bloqueo de la PC cliente

- **Estado:** Aprobada parcialmente: Contratos y datos (T01–T07), mantenedor 2026-10-04. El resto sigue en Borrador.
- **Fecha:** 2026-09-25
- **ADRs relacionados:** ADR-0005, ADR-0006, ADR-0007, ADR-0009, ADR-0010
- **Seguridad:** [ADR-0017](../../adr/0017-comunicacion-segura-del-cliente-windows.md), aceptado por el mantenedor el 2026-10-04.
- **Propuesta de mantenimiento:** [ADR-0018](../../adr/0018-mantenimiento-con-cuenta-windows-existente.md), con cuenta Windows existente elegida por el mantenedor; mecanismo pendiente de revisión.
- **Specs relacionadas:** 001, 002, 004

**Confirmado por el mantenedor (2026-10-04):** C# para el servicio y el control nativo de
Windows, WebView2 para alojar el Shell React y escritorio Win32 separado para bloqueo y
pausa. El plan incluirá la fase 2 de la spec 002. Esta confirmación no aprueba todavía
toda la spec ni sus decisiones pendientes.

## Problema

Al encender una PC del local, el cliente debe ver directamente la pantalla de Pope, sin
escritorio de Windows ni forma de saltársela. Solo el nodo central puede autorizar su uso.

## Actores

- **Cliente:** ve el Shell e inicia sesión.
- **Encargado:** controla las PCs desde el panel.
- **Técnico:** instala, mantiene y actualiza las PCs.
- **Sistema:** el agente y el host del Shell.

## Historias de usuario

- Como **dueño**, quiero que al encender la PC aparezca Pope bloqueado para que nadie la use sin pagar.
- Como **encargado**, quiero bloquear, apagar o enviar un mensaje a cualquier PC desde el panel.
- Como **técnico**, quiero salir al escritorio de Windows con mi usuario y contraseña del personal para hacer mantenimiento.
- Como **administrador**, quiero subir desde el panel una imagen para el fondo de la pantalla de bloqueo y que llegue sola a todas las PCs.

## Requisitos funcionales

**Arranque**
- **REQ-003-01:** Al encender, Windows inicia sesión automáticamente con un usuario local **sin privilegios** cuyo shell es `Pope.ShellHost`, no `explorer.exe`.
- **REQ-003-02:** `Pope.Agent` arranca como servicio antes del inicio de sesión y conecta con el nodo local.
- **REQ-003-03:** Tras el arranque, la PC muestra la pantalla de login de Pope en estado **bloqueado**.
- **REQ-003-04:** Si el nodo local no responde, la pantalla lo indica ("Sin conexión con el servidor") y reintenta sola. No se puede iniciar sesión sin nodo.

**Registro de PCs**
- **REQ-003-10:** Una PC nueva se registra con un **código de instalación** de un solo uso generado en el panel por encargado o administrador, con caducidad de **10 min**. El nodo le asigna un nombre (PC 01…). (Roles y plazo confirmados por el mantenedor, 2026-10-04.)
- **REQ-003-11:** El nodo rechaza agentes no registrados o con credencial revocada. Si se revoca una PC con sesión abierta, conserva la sesión y bloquea el acceso cuando la PC recibe la revocación, hasta intervención del personal autorizado. Durante el bloqueo por revocación confirmado se detiene el consumo de saldo y tiempo restante; el nodo conserva la autoridad del cobro. Esta regla no se activa por un simple corte de red o fallo TLS. Una PC sin red solo puede enterarse al reconectar. La recuperación revincula la misma PC con una credencial nueva y conserva la misma sesión; la credencial anterior permanece revocada. La PC continúa bloqueada y sin consumo hasta que el encargado o administrador autorice continuar desde el nodo; obtener la nueva credencial no desbloquea automáticamente. Encargado y administrador pueden revocar, revincular y autorizar continuar; el nodo valida la sesión/rol en cada acción y registra los cambios con actor. El dueño solo lee. Mecanismo de recuperación y confirmación/corte temporal siguen pendientes. (Conservación y bloqueo: mantenedor, 2026-10-04; consumo, recuperación y permisos, opciones A: 2026-10-07; ADR-0020/0021.)

  **Entrega de la nueva identidad (mantenedor, 2026-10-07; opción A, ADR-0022):** encargado o administrador genera en el panel un código de recuperación ligado a la PC revocada, de un uso y válido durante 10 min. El personal lo introduce físicamente en el asistente de esa PC; el servicio obtiene y guarda la credencial nueva por conexión cifrada con el nodo verificado. Requiere LAN con el nodo. La credencial nueva no se muestra en panel ni se entrega al JavaScript del Shell. Se conserva el bloqueo y la sesión; el código no autoriza continuar ni abre mantenimiento. Contratos, acceso al asistente y respuestas perdidas siguen pendientes de diseño/prueba en T34; el código ordinario T12 conserva sus condiciones.

  **Estado al autorizar continuar (mantenedor, 2026-10-07; opción A, REQ-003-11):** se conserva el estado previo al bloqueo por revocación confirmado: activa vuelve activa, pausada vuelve pausada con el tiempo de pausa que le quedaba. El intervalo del bloqueo no consume ese tiempo ni añade una pausa por sesión/día (REQ-002-33). Autorizar continuar tras recuperar la identidad no equivale a reanudar una pausa; esta conserva su flujo ordinario. La credencial nueva por sí sola mantiene el bloqueo.

**Control remoto desde el panel**
- **REQ-003-20:** Comandos: bloquear, abrir sesión, cerrar sesión, enviar mensaje, reiniciar, apagar, encender (REQ-003-22) e iniciar como administrador (REQ-003-43). Los usan el encargado y el administrador; el dueño solo mira (decisión del mantenedor, 2026-10-02). «Bloquear» cierra la sesión existente y bloquea la PC; no pausa ni mantiene el cobro tras el cierre. Reiniciar y apagar con una sesión activa o pausada requieren confirmación, cierre de la sesión y después ejecución de la orden. Se aplican las reglas de cierre vigentes, también a las temporales (REQ-001-69). (Comportamientos de bloqueo/reinicio/apagado confirmados por el mantenedor, 2026-10-04.)
  Los mensajes son ventanas centradas con sonido, sin tomar foco ni bloquear teclas/clics, y se quitan solas a los 5 s. Se admiten con sesión activa o pausada y con PC libre, se rechazan en mantenimiento y se descartan si cambia el estado/sesión destinatario antes de mostrarse. (Mantenedor, 2026-10-04.)
- **REQ-003-21:** El panel muestra en vivo el estado de cada PC con estos colores: apagada o sin conexión en **gris**, libre en **verde**, en uso con cuenta en **celeste**, sesión temporal en **ámbar** y en mantenimiento (modo administrador) en **rojo**. En pausa, en **morado** (REQ-002-14). (Colores del mantenedor, 2026-10-02; los de los estados que ya existen se aplicaron en el panel antes de esta spec.)
- **REQ-003-22:** **Encender por red (Wake-on-LAN).** Desde el panel se enciende una PC apagada: el nodo envía el "paquete mágico" por la LAN a la dirección MAC de su tarjeta de red, que el agente registra al instalarse (REQ-003-50). Requiere tener Wake-on-LAN activado en la BIOS y en la tarjeta de red (PCIe). Si la PC no se conecta al nodo en **2 min**, el panel lo indica sin afirmar que esté averiada; el aviso desaparece si luego se conecta. (Plazo confirmado por el mantenedor, 2026-10-04.)

**Protección**
- **REQ-003-30:** Mientras Pope esté en primer plano o bloqueado, se inhiben la tecla Windows, Ctrl+Esc y Alt+F4. **Alt+Tab se inhibe solo sin sesión de cliente**; con temporal o cuenta se permite aunque Pope esté en primer plano. En uso activo alterna entre Pope y ventanas autorizadas del escritorio de uso, sin pausar automáticamente. En pausa o bloqueo por revocación, habilitar el atajo no cambia de escritorio ni permite volver al juego: se conserva el aislamiento y autorización de reanudación/continuación. (Mantenedor, 2026-10-07; ADR-0023.)
- **REQ-003-31:** Las directivas desactivan en Ctrl+Alt+Supr: Administrador de tareas, cambiar de usuario, cerrar sesión y cambiar contraseña.
- **REQ-003-32:** Si `Pope.ShellHost` se cierra o se cuelga, el agente lo relanza en < 3 s y la PC vuelve a quedar bloqueada si no había sesión.
- **REQ-003-33:** El estado bloqueado usa el escritorio separado (ADR-0009).
- **REQ-003-34:** Al cerrar o agotar una sesión, el agente cierra los juegos y procesos del cliente, sin reiniciar Windows; conserva Pope y los procesos necesarios del sistema. Durante la pausa las aplicaciones siguen abiertas (REQ-002-05). (Mantenedor, 2026-10-04.)

**Mantenimiento**
- **REQ-003-40:** Un técnico puede entrar en **modo mantenimiento** desde la pantalla de bloqueo ("Usuario técnico") **solo con su usuario y contraseña del personal**, sin código adicional. Así accede al escritorio de Windows con permisos de administrador. Solo se admiten los roles encargado y administrador, validados por el nodo; el dueño no puede entrar. La entrada local exige cerrar previamente cualquier sesión de cliente, activa o pausada, igual que la remota. (Código adicional retirado por el mantenedor el 2026-10-02; roles, validación y cierre previo confirmados el 2026-10-04.)
- **REQ-003-41:** Entrar y salir del modo mantenimiento genera eventos con actor y duración, visibles para el dueño.
- **REQ-003-43:** **Iniciar como administrador desde el panel.** El encargado o el administrador pone una PC en modo mantenimiento sin escribir nada en ella: la PC muestra el escritorio de Windows con permisos de administrador, como en REQ-003-40. Queda registrado igual (REQ-003-41, con quién lo inició desde el panel) y el mapa la pinta en rojo. Termina con "Terminar y bloquear" en la PC o desde el panel. Solo se permite con la PC libre: si hay una sesión activa o pausada, se debe cerrar antes mediante el flujo de cierre existente. (Decisión inicial del mantenedor, 2026-10-02; restricción de sesión confirmada el 2026-10-04.)
- **REQ-003-42:** Durante el mantenimiento, Pope **no le muestra al técnico el tiempo que lleva**: solo una **pestaña plegada arriba en el centro** ("Técnico", pequeña, para no tapar las barras de título ni los menús) que al pasar el ratón se despliega con la PC, quién entró y el botón "Terminar y bloquear". La duración se sigue registrando en el evento de salida (REQ-003-41). (Pestaña plegada: decisión del mantenedor, 2026-10-03; antes era una barra fija siempre desplegada.)
- **REQ-003-44:** Si se pierde la conexión con el nodo durante un mantenimiento ya autorizado, el modo técnico continúa y permite «Terminar y bloquear» sin red. La PC conserva la salida pendiente y la comunica al reconectar para registrarla una sola vez con su actor y duración. La pérdida de conexión no permite iniciar un nuevo mantenimiento sin validación del nodo. (Mantenedor, 2026-10-04.)
- **REQ-003-45:** El login técnico se bloquea por cuenta durante **1 min** al alcanzar **10 intentos fallidos consecutivos**, y el panel recibe un aviso por bloqueo. Un login correcto reinicia el contador y, al terminar el bloqueo, vuelve a cero; cambiar de PC no permite eludirlo. Este límite no cambia el login del personal en el panel. (Límite, contador y aviso confirmados por el mantenedor, 2026-10-04.)

**Instalación**
- **REQ-003-50:** Un instalador crea el usuario restringido, configura el inicio de sesión automático, aplica las directivas, instala el servicio y registra la PC (REQ-003-10).
- **REQ-003-51:** El instalador se puede desinstalar y deja Windows como estaba.

**Fondo de la pantalla de bloqueo**
- **REQ-003-70:** Desde el panel, el administrador sube una imagen (JPG, PNG o WebP) que pasa a ser el fondo de la pantalla de bloqueo de **todas** las PCs. También puede quitarla y volver al fondo por defecto de Pope.
- **REQ-003-71:** El nodo guarda la imagen en disco, no en la base de datos, junto con su huella SHA-256. Cada cambio (subir o quitar) genera un evento con actor (ADR-0008).
- **REQ-003-72:** El nodo avisa en vivo a las PCs conectadas. Las que estaban apagadas o sin conexión se enteran al reconectar, porque la conexión inicial les dice qué fondo toca.
- **REQ-003-73:** Cada PC descarga la imagen del nodo, comprueba la huella, la guarda en local y solo entonces la pone de fondo. Mientras descarga, la pantalla de bloqueo muestra un indicador de actualización con el progreso, **sin impedir iniciar sesión**. Si la descarga falla o la huella no coincide, conserva el fondo anterior y reintenta.
- **REQ-003-74:** Si llega un fondo nuevo con una sesión abierta, la PC lo descarga en segundo plano y lo aplica al volver a la pantalla de bloqueo, sin interrumpir al cliente.
- **REQ-003-75:** El fondo funciona sin internet: viaja solo por la LAN, y cada PC conserva su copia aunque el nodo no responda (REQ-003-04).
- **REQ-003-76:** El panel acepta imágenes JPG, PNG o WebP de hasta **10 MB (10 000 000 bytes)** y **40 millones de píxeles**; comprueba los encabezados antes de decodificar y muestra el motivo si exceden los límites. Las reduce, conservando la proporción, a un máximo de **1920×1080**. Envía al nodo una imagen WebP de hasta **2 MB (2 000 000 bytes)**; el nodo valida el archivo y no procesa imágenes grandes. (Límites y protección del navegador confirmados por el mantenedor, 2026-10-04.)

> **Propuesta para el plan (2026-10-02, a confirmar):** endpoints del nodo para el fondo.
>
> | Método y ruta | Quién | Qué hace |
> |---|---|---|
> | `PUT /lock-screen/background` | administrador | Sube la imagen (`multipart/form-data`, campo `file`). Comprueba el tipo por el contenido (no por la extensión) y el tamaño máximo; guarda el archivo con su SHA-256 como nombre; emite `lock_screen.background_changed`; avisa a las PCs. Devuelve `{ sha256, size, mimeType, uploadedAt, uploadedBy }`. |
> | `DELETE /lock-screen/background` | administrador | Vuelve al fondo por defecto; emite el mismo evento con `sha256: null` y avisa a las PCs. |
> | `GET /lock-screen/background` | personal | Datos del fondo actual (o `null`), para la vista previa del panel. |
> | `GET /lock-screen/background/:sha256` | PC registrada (o personal) | Descarga la imagen. Como el nombre es la huella, se sirve con caché `immutable`. La PC se autentica con su credencial (REQ-003-63), no con la cookie del personal. |
>
> - Canal PC: mensaje nuevo `lockBackground` (`{ sha256, size, mimeType }` o `null`), con su esquema `zod` en `@pope/shared`. Se envía al cambiar el fondo y tras el `hello` de cada PC.
> - El panel redimensiona y comprime la imagen en el navegador (a 1920×1080, con `<canvas>`) antes de subirla. Así el nodo no procesa imágenes ni necesita `sharp` (ADR-0011).
> - Dependencia nueva del servidor: `@fastify/multipart`, que hay que justificar en el plan (ADR-0011).
> - En el panel, la pantalla iría en `/fondo-de-bloqueo`, que no choca con `/lock-screen` en el proxy de Vite.

**Actualización al preparar el plan (2026-10-04):** REQ-003-76 confirma compresión en
el panel y subida WebP de 2 MB como máximo. El plan propone cuerpo binario `image/webp`,
como las fotos de productos, en lugar de multipart; ese cambio técnico se revisará con
el plan. La tabla anterior conserva la propuesta inicial, no un contrato aprobado.

## Requisitos no funcionales

- **REQ-003-60:** Consumo: agente < 50 MB de RAM y host < 60 MB, sin contar WebView2.
- **REQ-003-61:** Un comando del panel llega a la PC en < 1 s en la LAN.
- **REQ-003-62:** Compatible con Windows 10 y 11 x64 (Pro).
- **REQ-003-63:** La conexión agente–nodo va autenticada. Nada en la PC permite suplantar a otra PC.

> **Dato del mantenedor (2026-10-01):** las PCs de los clientes llevan los mismos componentes
> que el equipo de desarrollo (AMD Ryzen 5 5500) pero con **16 GB de RAM**. No es un
> requisito: sirve para dimensionar, y el rendimiento del Shell se puede probar en el equipo
> de desarrollo. Es distinto del servidor del local (i3-2120, 8 GB; ADR-0016).

> **Inventario preliminar (mantenedor, 2026-10-04):** 13 equipos; normalmente 12 utilizables
> por clientes porque el encargado usa uno con Windows completo en modo técnico. Windows
> 10 22H2 es probable en la mayoría y hay una PC indicada con Windows 11; falta verificar
> versiones y ediciones. Se dispone de una PC de pruebas y una VM. Juegos principales:
> Valorant, Counter-Strike 2, Call of Duty, Delta Force, League of Legends, Minecraft,
> Roblox y Blood Strike, además de juegos ocasionales pedidos por clientes; el catálogo
> y la revisión de esas excepciones pertenecen a la spec 004.

## Criterios de aceptación

- **CA-003-01** (REQ-003-01, REQ-003-03)
  - **Dado** una PC con Pope instalado
  - **Cuando** se enciende
  - **Entonces** aparece la pantalla de login de Pope sin mostrar en ningún momento el escritorio de Windows.
- **CA-003-02** (REQ-003-32)
  - **Dado** una PC bloqueada
  - **Cuando** se mata `Pope.ShellHost` de cualquier forma
  - **Entonces** en < 3 s vuelve la pantalla de bloqueo.
- **CA-003-03** (REQ-003-40, REQ-003-41)
  - **Dado** un técnico con usuario y contraseña del personal válidos
  - **Cuando** entra en mantenimiento
  - **Entonces** ve el escritorio de Windows y el panel muestra "PC 04 en mantenimiento por Luis".
- **CA-003-06** (REQ-003-22)
  - **Dado** la PC 07 apagada, con Wake-on-LAN activado y su MAC registrada
  - **Cuando** el encargado pulsa "Encender" en el panel
  - **Entonces** la PC arranca, se conecta al nodo y el mapa pasa de gris a verde.
- **CA-003-07** (REQ-003-43, REQ-003-21)
  - **Dado** la PC 04 libre
  - **Cuando** el encargado pulsa "Iniciar como administrador" en el panel
  - **Entonces** la PC muestra el escritorio de Windows, el mapa la pinta en rojo y queda el evento con el encargado como actor.
- **CA-003-04** (REQ-003-70, REQ-003-72, REQ-003-73)
  - **Dado** 10 PCs en la pantalla de bloqueo y 2 apagadas
  - **Cuando** el administrador sube un fondo nuevo desde el panel
  - **Entonces** las 10 muestran el indicador de actualización y luego el fondo nuevo; las 2 apagadas lo reciben al encender.
- **CA-003-05** (REQ-003-74)
  - **Dado** una PC con una sesión abierta
  - **Cuando** se sube un fondo nuevo
  - **Entonces** la sesión sigue sin cambios y el fondo nuevo aparece al cerrarla.
- **CA-003-08** (REQ-003-34, REQ-003-03)
  - **Dado** una PC en sesión con juegos y procesos del cliente abiertos
  - **Cuando** la sesión se cierra o agota
  - **Entonces** se muestra el bloqueo y esos procesos se cierran sin reiniciar Windows, manteniendo Pope y los procesos necesarios del sistema.
- **CA-003-09** (REQ-003-44, REQ-003-41)
  - **Dado** una PC en modo técnico autorizado
  - **Cuando** pierde conexión con el nodo y el técnico pulsa «Terminar y bloquear»
  - **Entonces** vuelve al bloqueo sin esperar la red y, al reconectar, la salida se registra una sola vez con actor y duración.
- **CA-003-10** (REQ-003-45)
  - **Dado** una cuenta de encargado o administrador con diez fallos consecutivos de login técnico, aunque procedan de distintas PCs
  - **Cuando** alcanza el décimo fallo
  - **Entonces** no admite nuevos intentos técnicos durante 1 min, avisa una sola vez al panel y reinicia el contador al terminar el bloqueo; un login correcto anterior al décimo fallo también lo reinicia.
- **CA-003-11** (REQ-003-10, REQ-003-11)
  - **Dado** un código de instalación generado por encargado o administrador
  - **Cuando** se consume para registrar una PC
  - **Entonces** no puede reutilizarse; si pasan 10 min sin consumirlo se rechaza por caducidad, y el dueño no puede generar códigos.

- **CA-003-12** (REQ-003-30; REQ-002-01, REQ-002-02, REQ-002-11)
  - **Dado** una PC con sesión activa, temporal o de cuenta, y un juego abierto
  - **Cuando** el cliente usa Alt+Tab para seleccionar Pope y después volver al juego
  - **Entonces** alterna en ambas direcciones sin detener el consumo automáticamente. Solo la cuenta ofrece Pausar y confirmación. Sin sesión se inhibe Alt+Tab; con pausa/revocación no permite llegar al juego del otro escritorio. Verificar sin Explorer, con juegos exclusivos/anticheat, antes de dar por compatible el mecanismo.

## Fuera de alcance

- Arranque sin disco (tipo SENET Boot).
- Actualización automática de los clientes desde el nodo (irá en una spec aparte).
- Consolas, VR y otros dispositivos.

## Preguntas abiertas

- [x] **Base del host del Shell (T08).** **Resuelta (mantenedor, 2026-10-07): opción A, WinForms + WebView2**, con interfaz React y host C# mínimo, según [ADR-0019](../../adr/0019-host-del-shell-en-winforms.md). El inventario Windows, las versiones de herramientas y el prototipo del escritorio separado siguen pendientes; esta elección no aprueba el resto del plan/tasks.

- [x] **Normalización del usuario en T07 (2026-10-05).** **Resuelta (mantenedor, 2026-10-07): opción A, conservar el recorte exterior antes de validar el usuario de login de cliente/técnico.** Exportar junto al JSON Schema las instrucciones y los caracteres exactos del `trim` de JavaScript para que C# normalice solo el usuario antes de validar; nunca la contraseña. Añadir fixtures compartidos que comprueben coincidencia, incluidos usuario solo con espacios y 64 letras con espacios exteriores. Los límites Unicode sí coinciden en las versiones instaladas, incluidos emojis.
  - **Histórico (2026-10-07):** el mantenedor dejó T07 pendiente de revisar el contrato y después aprobó la opción A; esa decisión resuelve el bloqueo. T07 sigue sin implementar.

- [x] **Inicio de Contratos y datos (2026-10-04).** El mantenedor autoriza T01–T07 y acepta ADR-0017; confirma canal v2 y retirada del provisional v1 al cambiar admisión. Solo este bloque queda aprobado para implementar; mecanismos Windows y preguntas de negocio ajenas siguen abiertos.
- [x] **Registro consumido con respuesta perdida.** **Resuelta (mantenedor, 2026-10-04): encargado/administrador genera otro código ligado a la misma PC, solo libre y sin mantenimiento**. Reemplaza la credencial sin duplicar PC ni reutilizar el código anterior; el hash SHA-256 no permite recuperar el secreto previo.
- [ ] ¿Qué versiones y ediciones de Windows tienen las PCs del local? **Inventario tentativo del mantenedor (2026-10-04): probablemente Windows 10 22H2 y una PC con Windows 11**; falta comprobar versión y edición exactas. REQ-003-62 mantiene el objetivo Pro hasta revisar ese dato.
  - **Indicación del mantenedor (2026-10-07): opción B**, dejar el inventario pendiente y continuar resolviendo decisiones de diseño. No confirma las versiones/ediciones tentativas ni la compatibilidad; comprobarlas antes de fijar las herramientas y ejecutar las tareas nativas dependientes.
- [x] ¿Cuántas PCs hay? **Resuelta (mantenedor, 2026-10-04): 13 equipos, normalmente 12 disponibles para clientes**, porque uno lo usa el encargado en modo técnico.
- [ ] ¿Tienen congelador de disco (Deep Freeze o similar)? **Dato del mantenedor (2026-10-04): no lo sabe todavía**; debe comprobarse antes de configurar actualizaciones, credenciales y datos persistentes.
- [x] ¿Wake-on-LAN para encender las PCs desde el panel? **Resuelta (mantenedor, 2026-10-02): sí** (REQ-003-22). Falta comprobar en el local que las placas y tarjetas de red lo admiten y activarlo en la BIOS.
- [x] **Modo administrador remoto con una sesión abierta (REQ-003-43).** **Resuelta (mantenedor, 2026-10-04): exigir cerrar la sesión antes**, también si está pausada. Se usa el cierre existente; en una temporal se pierde el tiempo restante (REQ-001-69).
- [ ] **Placeholders en el panel.** Hasta esta spec, el detalle de la PC muestra "Encender", "Reiniciar", "Apagar" e "Iniciar como administrador" desactivados ("Próximamente"), por decisión del mantenedor (2026-10-02).
- [x] **Distribución de WebView2 (ADR-0005).** **Resuelta (mantenedor, 2026-10-04): Evergreen con instalador completo sin conexión.** El instalador comprueba el runtime y lo instala si falta, sin depender de internet. Falta verificar Windows y congelador para preparar su política de actualización y persistencia; no se asume que toda PC con Windows 10 ya lo tenga.

Detectadas al revisar la conexión NestJS ↔ .NET ↔ WebView2 (2026-09-25). La cadena prevista es: `shell-ui` ⇄ puente de WebView2 ⇄ `Pope.ShellHost` ⇄ named pipe ⇄ `Pope.Agent` ⇄ WebSocket ⇄ nodo, con los mensajes de `packages/shared` (T08 de la spec 001) reenviados sin cambios.

- [ ] **Cifrado en la LAN (REQ-003-63).** Con `ws://`, la contraseña del cliente del mensaje `login` viaja en claro y cualquier equipo de la red (p. ej. un portátil en el Wi-Fi) podría capturarla. Propuesta: `wss://` con un certificado del nodo que el agente reconozca expresamente (fijado en la instalación).
- [ ] **Credencial de la PC (REQ-003-10, REQ-003-11).** ¿Dónde viaja? Propuesta: en la conexión inicial del WebSocket (cabecera, que `ClientWebSocket` permite), no dentro de `hello`. Solo la guarda el agente (LocalSystem), nunca el Shell ni el usuario restringido.
- [ ] **Seguridad del named pipe.** Agente y host corren con usuarios distintos, así que cualquier proceso del usuario restringido podría abrir el pipe. Propuesta: el agente comprueba que quien se conecta es el `Pope.ShellHost` que él lanzó (`GetNamedPipeClientProcessId`). Por el pipe pasa la contraseña del login: el C# nunca la registra (REQ-001-51).
- [ ] **Origen de la interfaz del Shell.** Si WebView2 cargara `shell-ui` desde el nodo, sin nodo no habría pantalla y no se cumpliría REQ-003-04. Propuesta: empaquetarla junto al host (`SetVirtualHostNameToFolderMapping`). Enlaza con las actualizaciones de los clientes (fuera de alcance).
- [ ] **Quién aplica el bloqueo al recibir `state`.** Según ADR-0009 cambia de escritorio el host, pero si el host muere el agente debe garantizar el bloqueo (REQ-003-32) y seguir la cuenta atrás sin red (ADR-0007). Ambos tendrán que entender `state`, `sessionEnded` y el tiempo restante; conviene acotar exactamente qué hace cada uno.
- [ ] **Validar el protocolo en C# (ADR-0002).** .NET no trae un validador de JSON Schema (solo exporta). Hará falta un paquete en el proyecto de tests (JsonSchema.Net o NJsonSchema), justificado en el plan, o generar las clases C# a partir del schema.
- [x] **Quién puede entrar en mantenimiento (REQ-003-40).** **Resuelta (mantenedor, 2026-10-04): encargado y administrador, validados por el nodo**. No se crea un rol técnico ni se admite al dueño. El límite confirmado es 10 fallos consecutivos, bloqueo de 1 min y un aviso al panel (REQ-003-45).
- [x] **Límites del fondo (REQ-003-70, REQ-003-76).** **Resuelta (mantenedor, 2026-10-04): entrada JPG/PNG/WebP hasta 10 MB, reducción sin deformar a máximo 1920×1080 y subida WebP hasta 2 MB**. Un fondo global y subida solo por administrador ya están en REQ-003-70. Falta verificar los monitores reales y cerrar los contratos técnicos del plan.
- [x] **Dirección del nodo.** **Resuelta (mantenedor, 2026-10-04): IP fija o reserva DHCP para el nodo**, configurada durante la instalación junto con su identidad de certificado. No se añade descubrimiento automático.
- [x] **Bloquear con una sesión abierta (REQ-003-20).** **Resuelta (mantenedor, 2026-10-04): cerrar la sesión y bloquear la PC**, con las reglas de cierre existentes. No es una pausa.
- [x] **Contador del login técnico.** **Resuelta (mantenedor, 2026-10-04): 10 fallos consecutivos por cuenta, bloqueo de 1 min y un aviso al panel por bloqueo** (REQ-003-45). El login correcto y el final del bloqueo reinician el contador; no cambia el login del panel.
- [x] **Revocación con sesión abierta.** **Resuelta parcialmente (mantenedor, 2026-10-04): conservar la sesión y bloquear el acceso cuando la PC reciba la revocación, hasta intervención del encargado**. No equivale a cerrar ni a pausar. Una PC sin red solo puede enterarse al reconectar.
- [x] **Consumo durante el bloqueo por revocación.** **Resuelta (mantenedor, 2026-10-07): opción A, detener el consumo de saldo y tiempo restante mientras el acceso esté bloqueado por revocación confirmada**, conservando la sesión hasta intervención del encargado. Un corte de red o fallo TLS no activa esta regla; no equivale a una pausa solicitada por el cliente ni a cerrar la sesión. La decisión del cobro permanece en el nodo.
- [x] **Comportamiento de recuperación tras revocación.** **Resuelta (mantenedor, 2026-10-07): opción A, revincular la misma PC con una credencial nueva y conservar la sesión**. La credencial revocada permanece invalidada. La PC sigue bloqueada y sin consumo hasta que el encargado autorice continuar; reconectar con la nueva credencial no desbloquea automáticamente. [ADR-0020](../../adr/0020-recuperacion-de-pcs-revocadas.md) registra la decisión. Es un flujo específico de T34: no cambia el requisito de PC libre/sin mantenimiento de la recuperación ordinaria de T12.
- [x] **Permisos de revocación y recuperación.** **Resuelta (mantenedor, 2026-10-07): opción A, encargado y administrador pueden revocar, revincular y autorizar continuar la sesión**. El dueño solo lee; el nodo valida sesión/rol por acción y registra cada cambio de estado con actor. [ADR-0021](../../adr/0021-permisos-de-revocacion-y-recuperacion.md) complementa ADR-0020.
- [x] **Entrega local de autorización de recuperación.** **Resuelta (mantenedor, 2026-10-07): opción A, código ligado a la PC revocada, un uso, 10 min, generado en panel por encargado/administrador e introducido físicamente en su asistente**. El servicio obtiene y custodia la credencial nueva por conexión cifrada con el nodo verificado; no se desbloquea ni expone el secreto al Shell. [ADR-0022](../../adr/0022-codigo-local-de-recuperacion-de-pcs.md) complementa ADR-0020/0021. No cambia T12.
- [x] **Estado previo al recuperar la PC revocada.** **Resuelta (mantenedor, 2026-10-07): opción A**, activa vuelve activa; pausada vuelve pausada con su tiempo restante. El bloqueo por revocación confirmado no consume ese tiempo ni añade una pausa por sesión/día (REQ-002-33, CA-002-09). La autorización de continuar no reanuda por sí sola una pausa. Sin implementación en este cambio documental.
- [ ] **Contratos y confirmación tras revocación.** Concretar contratos de recuperación, acceso al asistente y respuestas perdidas, recuperación del estado previo y sus intervalos conforme a la opción A, y cómo el nodo confirma el bloqueo y fija el instante efectivo del corte de consumo, incluidos acuses perdidos o desconexión durante la confirmación. El cierre automático por falta de latidos y la reconciliación actuales deben distinguir la revocación para no cerrar la sesión conservada. Comportamientos resueltos; diseño técnico/prueba pendientes antes de implementar T34.
- [x] **Reiniciar/apagar con sesión (REQ-003-20).** **Resuelta (mantenedor, 2026-10-04): pedir confirmación, cerrar la sesión y ejecutar la orden**, también si está pausada; el cierre de temporales conserva la regla REQ-001-69.
- [x] **Reiniciar/apagar durante mantenimiento.** **Resuelta (mantenedor, 2026-10-04): pedir confirmación, terminar el mantenimiento y ejecutar la orden**. Registrar la salida antes de reiniciar/apagar.
- [x] **Plazo de Wake-on-LAN (REQ-003-22).** **Resuelta (mantenedor, 2026-10-04): avisar si la PC no conecta en 2 min y quitar el aviso si conecta después**. No se considera diagnóstico de avería.
- [x] **Códigos de instalación (REQ-003-10).** **Resuelta (mantenedor, 2026-10-04): encargado y administrador pueden generarlos; un uso y caducidad de 10 min**.
- [x] **Cierre de sesión y aplicaciones abiertas.** **Resuelta (mantenedor, 2026-10-04): cerrar los juegos y procesos del cliente sin reiniciar Windows** (REQ-003-34). La pausa los conserva. La limpieza de perfiles, credenciales guardadas y configuración sigue requiriendo coordinación con la spec 004.
- [x] **Identidad Windows para mantenimiento.** **Resuelta (mantenedor, 2026-10-04): cuenta administradora Windows existente**, tras revisar las alternativas del plan. No se crea una cuenta nueva ni se eleva la del cliente. La propuesta técnica se documenta en ADR-0018.
- [ ] **Mecanismo de mantenimiento elevado.** Revisar ADR-0018 y concretar custodia/recuperación de credenciales, token con UAC, perfil, escritorio o sesión Windows independiente, y cierre exclusivo de los procesos de ese mantenimiento. Una contraseña del personal de Pope no es una credencial de Windows. La elección de la cuenta no demuestra todavía que ese mecanismo funcione.
- [x] **Mantenimiento sin nodo.** **Resuelta (mantenedor, 2026-10-04): mantener el modo técnico, permitir terminar y bloquear sin red, y registrar la salida al reconectar** (REQ-003-44). No autoriza entrada offline.
- [x] **Presencia física para emergencia.** **Resuelta (mantenedor, 2026-10-07): opción A, presencia física obligatoria delante de la PC afectada**, con intervención local de una persona autorizada; no se incorpora entrada remota de emergencia. La presencia no sustituye autenticación. [ADR-0024](../../adr/0024-presencia-fisica-para-emergencia.md) registra solo esta condición; mecanismo pendiente.
- [x] **Autenticación de emergencia.** **Resuelta (mantenedor, 2026-10-07): opción A, introducir físicamente las credenciales de la cuenta administradora local Windows existente**, validadas por Windows sin nodo ni servicio del agente. Sin clave de emergencia propia de Pope ni introducción automática del secreto custodiado. [ADR-0025](../../adr/0025-autenticacion-windows-para-emergencia.md) complementa ADR-0024; ruta administrativa pendiente de diseño y prueba.
- [x] **Quién puede usar la emergencia.** **Resuelta (mantenedor, 2026-10-07): opción B, administrador y encargado pueden usar las credenciales Windows para emergencia presencial**. Windows valida la cuenta local; no se presume validado un rol vigente de Pope sin nodo. [ADR-0026](../../adr/0026-permisos-del-acceso-de-emergencia.md) complementa ADR-0024/0025. Identificación y auditoría pendientes, especialmente si comparten cuenta Windows.
- [ ] **Fallo completo del agente y recuperación.** El mantenedor pide (2026-10-04) **diseñar un acceso de emergencia de Pope sin nodo**. Presencia física, autenticación Windows manual y permiso de administrador/encargado confirmados en ADR-0024/0025/0026; concretar alcance, identificación/auditoría y recuperación aun si el servicio no arranca, incluida la comprobación de intervención local. Requiere aprobar el mecanismo de seguridad en ADR. Es distinto del login técnico normal, que sigue validándose por el nodo, y de relanzar el host.
- [x] **Entrada técnica local con sesión de cliente.** **Resuelta (mantenedor, 2026-10-04): exige cerrar previamente la sesión también desde la PC**, incluida una pausa. La entrada no cierra la sesión automáticamente.
- [x] **Volver a Pope desde el juego.** **Resuelta (mantenedor, 2026-10-07): Alt+Tab permitido con temporal o cuenta, también con Pope en primer plano; inhibido solo sin sesión**. En uso activo permite volver a Pope y al juego, sin pausar automáticamente. Temporal sin botón Pausar; pausa/revocación conservan escritorio aislado y no permiten escapar al juego. [ADR-0023](../../adr/0023-alt-tab-con-sesion-de-cliente.md), CA-003-12; validar selector sin Explorer y juegos/anticheat en T09/T25. No declara compatibilidad ni aprueba ejecutar tareas nativas.
- [x] **Mensaje del encargado.** **Resuelta (mantenedor, 2026-10-04): ventana centrada con sonido, sin tomar foco ni impedir teclas/clics, se cierra sola a los 5 s**. Visible con sesión activa o pausada y con PC libre; rechazado durante mantenimiento. Ligado al estado/sesión destinatario, se descarta si cambia antes de mostrarse; no llega al cliente siguiente.
- [x] **Vigencia de órdenes nativas.** **Resuelta (mantenedor, 2026-10-04): 30 s para aceptar**, solo mientras siga vigente el estado/sesión destinatario. No reenviar reinicio/apagado aceptado ni presentar aceptación de Windows como prueba de apagado físico. El mantenimiento confirmado no tiene límite automático de duración.
- [x] **Entorno de validación.** **Resuelta (mantenedor, 2026-10-04): hay PC de pruebas y VM**; juegos anotados en el inventario preliminar. La VM sirve para instalación/recuperación; juego exclusivo, audio y anticheat se validan en la PC real. No modificar el Windows cotidiano para redactar el plan.
- [ ] **Detalle de las pruebas del local.** Confirmar resolución y número de monitores, versiones/ediciones de juegos (especialmente Call of Duty y Minecraft), MAC/Wake-on-LAN y versiones exactas de Windows antes de ejecutar la verificación final.
