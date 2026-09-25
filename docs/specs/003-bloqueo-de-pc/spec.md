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
- Como **técnico**, quiero salir al escritorio de Windows con una credencial especial para hacer mantenimiento.

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
- **REQ-003-20:** Comandos: bloquear, abrir sesión, cerrar sesión, enviar mensaje, reiniciar y apagar.
- **REQ-003-21:** El panel muestra en vivo el estado de cada PC: apagada o sin conexión, libre, en uso, en pausa o en mantenimiento.

**Protección**
- **REQ-003-30:** Mientras Pope esté en primer plano o bloqueado, se inhiben la tecla Windows, Alt+Tab, Ctrl+Esc y Alt+F4.
- **REQ-003-31:** Las directivas desactivan en Ctrl+Alt+Supr: Administrador de tareas, cambiar de usuario, cerrar sesión y cambiar contraseña.
- **REQ-003-32:** Si `Pope.ShellHost` se cierra o se cuelga, el agente lo relanza en < 3 s y la PC vuelve a quedar bloqueada si no había sesión.
- **REQ-003-33:** El estado bloqueado usa el escritorio separado (ADR-0009).

**Mantenimiento**
- **REQ-003-40:** Un técnico puede entrar en **modo mantenimiento** con credencial de personal y un código temporal generado en el panel. Así accede al escritorio de Windows con permisos de administrador.
- **REQ-003-41:** Entrar y salir del modo mantenimiento genera eventos con actor y duración, visibles para el dueño.

**Instalación**
- **REQ-003-50:** Un instalador crea el usuario restringido, configura el inicio de sesión automático, aplica las directivas, instala el servicio y registra la PC (REQ-003-10).
- **REQ-003-51:** El instalador se puede desinstalar y deja Windows como estaba.

## Requisitos no funcionales

- **REQ-003-60:** Consumo: agente < 50 MB de RAM y host < 60 MB, sin contar WebView2.
- **REQ-003-61:** Un comando del panel llega a la PC en < 1 s en la LAN.
- **REQ-003-62:** Compatible con Windows 10 y 11 x64 (Pro).
- **REQ-003-63:** La conexión agente–nodo va autenticada. Nada en la PC permite suplantar a otra PC.

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
  - **Dado** un técnico con código válido
  - **Cuando** entra en mantenimiento
  - **Entonces** ve el escritorio de Windows y el panel muestra "PC 04 en mantenimiento por Luis".

## Fuera de alcance

- Arranque sin disco (tipo SENET Boot).
- Actualización automática de los clientes desde el nodo (irá en una spec aparte).
- Consolas, VR y otros dispositivos.

## Preguntas abiertas

- [ ] ¿Qué versión y edición de Windows tienen las PCs del local?
- [ ] ¿Cuántas PCs hay, y tienen congelador de disco (Deep Freeze o similar)?
- [ ] ¿Wake-on-LAN para encender las PCs desde el panel?

Detectadas al revisar la conexión NestJS ↔ .NET ↔ WebView2 (2026-09-25). La cadena prevista es: `shell-ui` ⇄ puente de WebView2 ⇄ `Pope.ShellHost` ⇄ named pipe ⇄ `Pope.Agent` ⇄ WebSocket ⇄ nodo, con los mensajes de `packages/shared` (T08 de la spec 001) reenviados sin cambios.

- [ ] **Cifrado en la LAN (REQ-003-63).** Con `ws://`, la contraseña del cliente del mensaje `login` viaja en claro y cualquier equipo de la red (p. ej. un portátil en el Wi-Fi) podría capturarla. Propuesta: `wss://` con un certificado del nodo que el agente reconozca expresamente (fijado en la instalación).
- [ ] **Credencial de la PC (REQ-003-10, REQ-003-11).** ¿Dónde viaja? Propuesta: en la conexión inicial del WebSocket (cabecera, que `ClientWebSocket` permite), no dentro de `hello`. Solo la guarda el agente (LocalSystem), nunca el Shell ni el usuario restringido.
- [ ] **Seguridad del named pipe.** Agente y host corren con usuarios distintos, así que cualquier proceso del usuario restringido podría abrir el pipe. Propuesta: el agente comprueba que quien se conecta es el `Pope.ShellHost` que él lanzó (`GetNamedPipeClientProcessId`). Por el pipe pasa la contraseña del login: el C# nunca la registra (REQ-001-51).
- [ ] **Origen de la interfaz del Shell.** Si WebView2 cargara `shell-ui` desde el nodo, sin nodo no habría pantalla y no se cumpliría REQ-003-04. Propuesta: empaquetarla junto al host (`SetVirtualHostNameToFolderMapping`). Enlaza con las actualizaciones de los clientes (fuera de alcance).
- [ ] **Quién aplica el bloqueo al recibir `state`.** Según ADR-0009 cambia de escritorio el host, pero si el host muere el agente debe garantizar el bloqueo (REQ-003-32) y seguir la cuenta atrás sin red (ADR-0007). Ambos tendrán que entender `state`, `sessionEnded` y el tiempo restante; conviene acotar exactamente qué hace cada uno.
- [ ] **Validar el protocolo en C# (ADR-0002).** .NET no trae un validador de JSON Schema (solo exporta). Hará falta un paquete en el proyecto de tests (JsonSchema.Net o NJsonSchema), justificado en el plan, o generar las clases C# a partir del schema.
- [ ] **Dirección del nodo.** ¿Cómo encuentra el agente al nodo? Propuesta: IP fija del nodo configurada por el instalador (REQ-003-50).
