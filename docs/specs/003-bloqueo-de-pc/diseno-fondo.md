# Diseño del fondo: del agente al Shell

- **Estado:** Aprobado por el mantenedor (2026-10-24), con lectura para `BUILTIN\Users`.
  **Revisado y aprobado de nuevo el 2026-10-26** tras la prueba acotada: la imagen se sirve desde un
  segundo host mapeado a la carpeta de fondos, no desde `WebResourceRequested` (frase 4, alternativas
  descartadas, seguridad y verificación).
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
4. El **host** mapea `https://background.pope.invalid/` a esa carpeta con
   `SetVirtualHostNameToFolderMapping` (`DenyCors`, solo lectura), igual que ya mapea el host del
   Shell a sus archivos. Solo la mapea si existe (WebView2 lanza si no): la crea el agente al
   arrancar, antes de lanzar el host. No hay código del host que sirva archivos ni construya
   rutas. `HostBoundary.Allows` sigue aceptando solo el host del Shell, así que a ese otro host
   no se puede navegar ni se aceptan mensajes suyos; solo se carga como imagen.
5. El **Shell** pone `https://background.pope.invalid/<sha256>.webp` de fondo en la pantalla de
   bloqueo; si no carga, usa el fondo por defecto de Pope. Su CSP añade exactamente ese host a
   `img-src`. Como ya hace con `state`, el host repite el último `lockBackground` cuando el
   Shell envía `ready` (por ejemplo, tras recargar la página).

## Cambio tras la prueba acotada (2026-10-26)

La versión aprobada el 2026-10-24 servía la imagen desde el `WebResourceRequested` del host
mapeado del Shell. La sonda `--lock-background-proof` (WebView2 155.0.4283.62, Windows 11
10.0.26300) lo descartó:

| Pregunta | Resultado |
|---|---|
| ¿`WebResourceRequested` se lanza para un host con `SetVirtualHostNameToFolderMapping`? | **No.** El manejador solo vio `handler.pope.invalid` (sin mapear); nunca los hosts mapeados, ni la carga de `index.html` |
| ¿Funciona el manejador con un host sin mapear? | Sí |
| ¿Un segundo host mapeado a una carpeta aparte sirve la imagen a un `<img>`? | Sí; un archivo inexistente falla limpio (`onerror`) |
| ¿Se puede mapear una carpeta que no existe? | **No:** lanza `DirectoryNotFoundException` |

Con la ventana real del Shell (`--shell-host-proof`) apareció además que la CSP del Shell
(`img-src 'self' data:`) bloqueaba la imagen; por eso se añade el host de fondos a `img-src`.

## Qué entra en cada historia

| Historia | Parte de este diseño |
|---|---|
| 1 | Descarga, verificación, carpeta con sus permisos, aviso por la tubería, mapeo del host de fondos y fondo en el Shell. Al sustituir el fondo, borra el archivo anterior: queda uno como mucho |
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
| Servir la imagen desde `WebResourceRequested` del host mapeado del Shell | WebView2 no lanza ese evento para los hosts mapeados (prueba acotada, 2026-10-26) |
| Un host sin mapear servido por `WebResourceRequested` | Habría que cambiar `HostBoundary` y escribir en C# el código que sirve archivos y valida rutas; el mapeo hace lo mismo sin código |

## Seguridad

- El usuario cliente puede leer el fondo (ya lo ve en pantalla), pero no escribirlo, borrarlo
  ni crear archivos en la carpeta.
- El host no construye ninguna ruta con texto del Shell: el mapeo de WebView2 resuelve los
  nombres dentro de la carpeta fija. La huella que llega del nodo sí se usa como nombre de
  archivo, y la valida el agente (`BackgroundFiles.IsHash`: 64 hexadecimales ASCII en minúscula).
- Al host de fondos solo se le piden imágenes: `DenyCors` impide leerlo con `fetch`, y
  `HostBoundary.Allows` lo rechaza, así que `NavigationStarting` cancela cualquier navegación a él.
  La CSP del Shell añade ese único host a `img-src` y no abre ningún otro origen.
- Los permisos se fijan con `DirectorySecurity` de .NET, sin P/Invoke nuevo. El agente
  comprueba los permisos de la carpeta antes de usarla, como ya hace la custodia, y rechaza
  enlaces simbólicos o de unión.
- Permisos para Usuarios y no para la cuenta cliente: esa cuenta la crea el instalador (T49),
  que aún no existe, y leer una imagen pública no da nada a otro usuario local.

## Verificación

- **Prueba acotada (hecha, 2026-10-26):** `WebResourceRequested` no se lanza para un host mapeado;
  de ahí el segundo host mapeado. Queda en la sonda `--lock-background-proof` y en la etapa
  «fondo» de `--shell-host-proof`, que usa la ventana real del Shell: repite el aviso al enviar
  `ready`, la imagen carga del host de fondos, un archivo inexistente falla limpio y navegar a
  ese host se cancela.
- Tests C#: validación del nombre (traversal, mayúsculas, dígitos no ASCII, longitud), huella o
  tamaño erróneos sin renombrar, sustitución atómica, descriptor de seguridad de la carpeta y
  rechazo de enlaces (en una carpeta temporal, sin tocar `ProgramData`), descarga con la
  credencial por TLS fijado, y que `HostBoundary` no admite el host de fondos.
- A mano en WebView2 (T46) en el Windows de desarrollo.
- En la VM, con la cuenta cliente estándar: lee el fondo y no puede escribir en la carpeta.

## Decisiones del mantenedor (2026-10-24)

1. Diseño aprobado.
2. Lectura para todos los usuarios locales (`BUILTIN\Users`), no solo para la cuenta cliente,
   mientras no exista el instalador.
3. T43–T46 autorizadas como las cinco historias de arriba, empezando por la 1.

## Decisiones del mantenedor (2026-10-26)

4. Tras la prueba acotada, el host sirve el fondo desde un segundo host mapeado,
   `background.pope.invalid`, y no desde `WebResourceRequested`. Se amplía el `img-src` de la CSP
   del Shell solo con ese host.
5. La carpeta de fondos es `%ProgramData%\Pope\Background` para el servicio de producción; los
   servicios de prueba del SCM usan una subcarpeta `Background` de su raíz. El agente la prepara
   con propietario SYSTEM antes de lanzar el host; el host la mapea solo si existe.
