# Spec 003: Arranque y bloqueo de la PC cliente

- **Estado:** Borrador
- **Fecha:** 2026-09-25
- **ADRs relacionados:** ADR-0005, ADR-0006, ADR-0007, ADR-0009, ADR-0010
- **Specs relacionadas:** 001, 002, 004

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
- **REQ-003-10:** Una PC nueva se registra con un **código de instalación** de un solo uso generado en el panel. El nodo le asigna un nombre (PC 01…).
- **REQ-003-11:** El nodo rechaza agentes no registrados o con credencial revocada.

**Control remoto desde el panel**
- **REQ-003-20:** Comandos: bloquear, abrir sesión, cerrar sesión, enviar mensaje, reiniciar, apagar, encender (REQ-003-22) e iniciar como administrador (REQ-003-43). Los usan el encargado y el administrador; el dueño solo mira (decisión del mantenedor, 2026-10-02).
- **REQ-003-21:** El panel muestra en vivo el estado de cada PC con estos colores: apagada o sin conexión en **gris**, libre en **verde**, en uso con cuenta en **celeste**, sesión temporal en **ámbar** y en mantenimiento (modo administrador) en **rojo**. En pausa, en **morado** (REQ-002-14). (Colores del mantenedor, 2026-10-02; los de los estados que ya existen se aplicaron en el panel antes de esta spec.)
- **REQ-003-22:** **Encender por red (Wake-on-LAN).** Desde el panel se enciende una PC apagada: el nodo envía el "paquete mágico" por la LAN a la dirección MAC de su tarjeta de red, que el agente registra al instalarse (REQ-003-50). Requiere tener Wake-on-LAN activado en la BIOS y en la tarjeta de red (PCIe). Si la PC no se conecta al nodo en unos minutos, el panel lo indica.

**Protección**
- **REQ-003-30:** Mientras Pope esté en primer plano o bloqueado, se inhiben la tecla Windows, Alt+Tab, Ctrl+Esc y Alt+F4.
- **REQ-003-31:** Las directivas desactivan en Ctrl+Alt+Supr: Administrador de tareas, cambiar de usuario, cerrar sesión y cambiar contraseña.
- **REQ-003-32:** Si `Pope.ShellHost` se cierra o se cuelga, el agente lo relanza en < 3 s y la PC vuelve a quedar bloqueada si no había sesión.
- **REQ-003-33:** El estado bloqueado usa el escritorio separado (ADR-0009).

**Mantenimiento**
- **REQ-003-40:** Un técnico puede entrar en **modo mantenimiento** desde la pantalla de bloqueo ("Usuario técnico") **solo con su usuario y contraseña del personal**, sin código adicional. Así accede al escritorio de Windows con permisos de administrador. (Cambiado el 2026-10-02 por el mantenedor: antes pedía además un código temporal generado en el panel.)
- **REQ-003-41:** Entrar y salir del modo mantenimiento genera eventos con actor y duración, visibles para el dueño.
- **REQ-003-43:** **Iniciar como administrador desde el panel.** El encargado o el administrador pone una PC en modo mantenimiento sin escribir nada en ella: la PC muestra el escritorio de Windows con permisos de administrador, como en REQ-003-40. Queda registrado igual (REQ-003-41, con quién lo inició desde el panel) y el mapa la pinta en rojo. Termina con "Terminar y bloquear" en la PC o desde el panel. (Decisión del mantenedor, 2026-10-02.)
- **REQ-003-42:** Durante el mantenimiento, Pope **no le muestra al técnico el tiempo que lleva**: solo una **pestaña plegada arriba en el centro** ("Técnico", pequeña, para no tapar las barras de título ni los menús) que al pasar el ratón se despliega con la PC, quién entró y el botón "Terminar y bloquear". La duración se sigue registrando en el evento de salida (REQ-003-41). (Pestaña plegada: decisión del mantenedor, 2026-10-03; antes era una barra fija siempre desplegada.)

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

## Requisitos no funcionales

- **REQ-003-60:** Consumo: agente < 50 MB de RAM y host < 60 MB, sin contar WebView2.
- **REQ-003-61:** Un comando del panel llega a la PC en < 1 s en la LAN.
- **REQ-003-62:** Compatible con Windows 10 y 11 x64 (Pro).
- **REQ-003-63:** La conexión agente–nodo va autenticada. Nada en la PC permite suplantar a otra PC.

> **Dato del mantenedor (2026-10-01):** las PCs de los clientes llevan los mismos componentes
> que el equipo de desarrollo (AMD Ryzen 5 5500) pero con **16 GB de RAM**. No es un
> requisito: sirve para dimensionar, y el rendimiento del Shell se puede probar en el equipo
> de desarrollo. Es distinto del servidor del local (i3-2120, 8 GB; ADR-0016).

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

## Fuera de alcance

- Arranque sin disco (tipo SENET Boot).
- Actualización automática de los clientes desde el nodo (irá en una spec aparte).
- Consolas, VR y otros dispositivos.

## Preguntas abiertas

- [ ] ¿Qué versión y edición de Windows tienen las PCs del local?
- [ ] ¿Cuántas PCs hay, y tienen congelador de disco (Deep Freeze o similar)?
- [x] ¿Wake-on-LAN para encender las PCs desde el panel? **Resuelta (mantenedor, 2026-10-02): sí** (REQ-003-22). Falta comprobar en el local que las placas y tarjetas de red lo admiten y activarlo en la BIOS.
- [ ] **Modo administrador remoto con una sesión abierta (REQ-003-43).** ¿Qué pasa si la PC tiene un cliente dentro? Propuesta: solo se permite con la PC libre; con sesión, el panel pide cerrarla antes (y en una temporal se pierde el tiempo, REQ-001-69).
- [ ] **Placeholders en el panel.** Hasta esta spec, el detalle de la PC muestra "Encender", "Reiniciar", "Apagar" e "Iniciar como administrador" desactivados ("Próximamente"), por decisión del mantenedor (2026-10-02).
- [ ] **WebView2 en Windows 10 (ADR-0005).** No viene de serie en Windows 10: llegó después por Windows Update y puede faltar (PCs sin actualizar, LTSC, WSUS, congelador de disco). Propuesta: el instalador (REQ-003-50) comprueba si está y, si no, lo instala con el instalador completo sin conexión de Microsoft (~150 MB). Decidir también si se usa la versión "Evergreen" (se actualiza sola) o una versión fija empaquetada con Pope, y confirmar hasta cuándo da Microsoft soporte a WebView2 en Windows 10. Depende de la pregunta anterior sobre la versión y edición de Windows de las PCs.

Detectadas al revisar la conexión NestJS ↔ .NET ↔ WebView2 (2026-09-25). La cadena prevista es: `shell-ui` ⇄ puente de WebView2 ⇄ `Pope.ShellHost` ⇄ named pipe ⇄ `Pope.Agent` ⇄ WebSocket ⇄ nodo, con los mensajes de `packages/shared` (T08 de la spec 001) reenviados sin cambios.

- [ ] **Cifrado en la LAN (REQ-003-63).** Con `ws://`, la contraseña del cliente del mensaje `login` viaja en claro y cualquier equipo de la red (p. ej. un portátil en el Wi-Fi) podría capturarla. Propuesta: `wss://` con un certificado del nodo que el agente reconozca expresamente (fijado en la instalación).
- [ ] **Credencial de la PC (REQ-003-10, REQ-003-11).** ¿Dónde viaja? Propuesta: en la conexión inicial del WebSocket (cabecera, que `ClientWebSocket` permite), no dentro de `hello`. Solo la guarda el agente (LocalSystem), nunca el Shell ni el usuario restringido.
- [ ] **Seguridad del named pipe.** Agente y host corren con usuarios distintos, así que cualquier proceso del usuario restringido podría abrir el pipe. Propuesta: el agente comprueba que quien se conecta es el `Pope.ShellHost` que él lanzó (`GetNamedPipeClientProcessId`). Por el pipe pasa la contraseña del login: el C# nunca la registra (REQ-001-51).
- [ ] **Origen de la interfaz del Shell.** Si WebView2 cargara `shell-ui` desde el nodo, sin nodo no habría pantalla y no se cumpliría REQ-003-04. Propuesta: empaquetarla junto al host (`SetVirtualHostNameToFolderMapping`). Enlaza con las actualizaciones de los clientes (fuera de alcance).
- [ ] **Quién aplica el bloqueo al recibir `state`.** Según ADR-0009 cambia de escritorio el host, pero si el host muere el agente debe garantizar el bloqueo (REQ-003-32) y seguir la cuenta atrás sin red (ADR-0007). Ambos tendrán que entender `state`, `sessionEnded` y el tiempo restante; conviene acotar exactamente qué hace cada uno.
- [ ] **Validar el protocolo en C# (ADR-0002).** .NET no trae un validador de JSON Schema (solo exporta). Hará falta un paquete en el proyecto de tests (JsonSchema.Net o NJsonSchema), justificado en el plan, o generar las clases C# a partir del schema.
- [ ] **Quién puede entrar en mantenimiento (REQ-003-40).** Sin el código del panel, cualquiera que conozca una contraseña del personal tendría el escritorio con permisos de administrador. Propuesta: solo el rol **administrador** (o un rol nuevo "técnico"), nunca el encargado ni el dueño, con el mismo bloqueo tras 5 intentos fallidos durante 5 min que los clientes (REQ-001-52).
- [ ] **Fondo de bloqueo (REQ-003-70).** ¿Tamaño máximo de la imagen (propuesta: 10 MB antes de comprimir)? ¿Qué resolución tienen los monitores del local? ¿Hace falta un fondo distinto por PC o por zona? (Por ahora, uno para todas.) ¿Lo sube solo el administrador o también el encargado?
- [ ] **Dirección del nodo.** ¿Cómo encuentra el agente al nodo? Propuesta: IP fija del nodo configurada por el instalador (REQ-003-50).
