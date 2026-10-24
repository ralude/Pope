# Diseño del fondo: del agente al Shell

- **Estado:** Aprobado por el mantenedor (2026-10-24), con lectura para `BUILTIN\Users`.
- **Cubre:** REQ-003-63, REQ-003-72, REQ-003-73, REQ-003-74, REQ-003-75; CA-003-04, CA-003-05.
- **Parte de:** T45 y T46 de [tasks](tasks.md); completa la sección «Fondo» del [plan](plan.md),
  que deja abierto cómo llega la imagen a la interfaz.
- **Responde a:** la duda 2 al afinar la primera historia del fondo: el protocolo define el
  progreso (`backgroundProgress`), pero no cómo recibe el Shell la imagen que descargó el agente.

## Decisiones ya tomadas (mantenedor, 2026-10-24)

- La subida al nodo usa **cuerpo binario `image/webp`**, como las fotos de productos, sin
  multipart ni dependencias nuevas.
- T43–T46 se implementan como **historias verticales**, con un commit por capa dentro de cada
  una:
  1. Como administrador, quiero subir una imagen desde el panel y que las PCs conectadas la
     muestren en la pantalla de bloqueo, para personalizar el local.
  2. Como administrador, quiero quitar el fondo y volver al de Pope, para deshacer un cambio.
  3. Como cliente, quiero poder iniciar sesión mientras la PC descarga un fondo nuevo, viendo su
     progreso, para no tener que esperar.
  4. Como cliente con sesión abierta, quiero que un fondo nuevo no me interrumpa y aparezca al
     volver al bloqueo.
  5. Como administrador, quiero que las PCs apagadas, sin nodo o con una descarga fallida
     conserven su fondo y se pongan al día al reconectar, para que todas acaben iguales.

  T47 (simulador) queda como tarea aparte, después de estas historias.

## El problema

Tres restricciones del código actual impiden el camino obvio:

| Restricción | Dónde | Consecuencia |
|---|---|---|
| El host y el Shell no tienen la credencial de la PC | REQ-003-63, `ShellWindow` | No pueden descargar del nodo; solo el agente puede |
| La carpeta del agente es de custodia | `%ProgramData%\Pope\Agent`, `AgentCustody` (solo SYSTEM y administradores, cifrada) | El host, que corre como el usuario cliente, no puede leer nada de ahí |
| La tubería agente ↔ host acepta frames de 16 KB y una cola de 32 | `ProtocolValidation.MaximumBytes`, `PipeFrames` | Una imagen de 2 MB no cabe en un mensaje |

## Propuesta en cinco frases

1. El **agente** descarga la imagen con su credencial a un archivo temporal dentro de una
   carpeta nueva, `%ProgramData%\Pope\Background\`, comprueba la huella SHA-256 y el
   tamaño anunciado, y solo entonces la renombra a `<sha256>.webp`.
2. Esa carpeta no hereda los permisos de `ProgramData`: **SYSTEM y administradores** tienen
   control total y **Usuarios** (`BUILTIN\Users`) solo lectura. La imagen no es secreta (se ve
   en pantalla), así que no se cifra ni va a la custodia, pero nadie sin privilegios puede
   cambiarla.
3. El agente avisa al host por la tubería con el mensaje **`lockBackground` que ya existe**
   (revisión y metadatos), pero **solo cuando el archivo está verificado en local**. El aviso del
   nodo lo consume el agente y no lo reenvía tal cual: en la tubería, `lockBackground` pasa a
   significar «este fondo ya está en esta PC». Mientras descarga, envía `backgroundProgress`
   (historia 3).
4. El **host** sirve la imagen a WebView2 en
   `https://shell.pope.invalid/lock-background/<sha256>.webp` desde el `WebResourceRequested`
   que ya tiene: acepta solo un nombre de 64 caracteres hexadecimales en minúscula, abre ese
   único archivo de la carpeta y responde `image/webp`; cualquier otra ruta bajo
   `/lock-background/` da 404. No hay otro nombre de host, así que `HostBoundary` no cambia.
5. El **Shell** pone esa URL de fondo en la pantalla de bloqueo; si no carga, usa el fondo por
   defecto de Pope. Como ya hace con `state`, el host repite el último `lockBackground` cuando
   el Shell envía `ready` (por ejemplo, tras recargar la página).

## Qué entra en cada historia

| Historia | Parte de este diseño |
|---|---|
| 1 | Descarga, verificación, carpeta con sus permisos, aviso por la tubería, ruta del host y fondo en el Shell. Al sustituir el fondo, borra el archivo anterior: queda uno como mucho |
| 2 | `lockBackground` con `background: null`: el Shell vuelve al fondo por defecto y el agente borra el archivo |
| 3 | `backgroundProgress` durante la descarga, sin bloquear el login |
| 4 | Distinguir revisión descargada y aplicada: como mucho dos archivos (el aplicado y el último descargado) |
| 5 | Guardar en la carpeta qué revisión está aplicada para mostrarla al arrancar sin nodo, comprobar la huella al arrancar, reintentar con límites y conservar el anterior ante un fallo |

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| El host descarga del nodo | Necesitaría la credencial de la PC; rompe REQ-003-63 |
| Enviar la imagen troceada por la tubería | Unos 125 frames por imagen en una cola de 32, la imagen entera en memoria del host y más C# |
| Pasarla al Shell como `data:` por `PostWebMessage` | 2,7 MB de JSON en base64, copiados varias veces; supera de largo el límite de los mensajes |
| Copiarla en la carpeta `shell` de la instalación | Mezcla datos con binarios instalados; complica actualizar y desinstalar (T48–T52) |
| Mapear la carpeta a otro nombre de host virtual | Cambia `HostBoundary` y expone la carpeta entera; `WebResourceRequested` ya filtra todo |

## Seguridad

- El usuario cliente puede leer el fondo (ya lo ve en pantalla), pero no escribirlo, borrarlo
  ni crear archivos en la carpeta.
- El host nunca construye una ruta con texto del Shell sin validarlo: solo acepta el patrón de
  64 caracteres hexadecimales y resuelve el archivo dentro de la carpeta fija.
- Los permisos se fijan con `DirectorySecurity` de .NET, sin P/Invoke nuevo. El agente
  comprueba los permisos de la carpeta antes de usarla, como ya hace la custodia, y rechaza
  enlaces simbólicos o de unión.
- Permisos para Usuarios y no para la cuenta cliente: esa cuenta la crea el instalador (T49),
  que aún no existe, y leer una imagen pública no da nada a otro usuario local.

## Verificación

- **Primero, una prueba acotada** (incertidumbre técnica principal): comprobar que
  `WebResourceRequested` atiende una ruta del host mapeado con
  `SetVirtualHostNameToFolderMapping` y que su respuesta sustituye a la del mapeo. Si no, la
  alternativa es atender `/lock-background/` antes de que llegue al mapeo o revisar este diseño
  contigo.
- Tests C#: validación del nombre (traversal, mayúsculas, longitud), huella errónea sin renombrar,
  sustitución atómica y descriptor de seguridad de la carpeta (en una carpeta temporal, sin
  tocar `ProgramData`).
- A mano en WebView2 (T46) en el Windows de desarrollo.
- En la VM, con la cuenta cliente estándar: lee el fondo y no puede escribir en la carpeta.

## Decisiones del mantenedor (2026-10-24)

1. Diseño aprobado.
2. Lectura para todos los usuarios locales (`BUILTIN\Users`), no solo para la cuenta cliente,
   mientras no exista el instalador.
3. T43–T46 autorizadas como las cinco historias de arriba, empezando por la 1.
