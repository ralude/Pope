# ADR-0017: Comunicación segura entre nodo, agente y Shell de Windows

- **Estado:** Aceptado (mantenedor, 2026-10-04)
- **Fecha:** 2026-10-04
- **Relacionado:** ADR-0002, ADR-0005, ADR-0006, ADR-0007, spec 003

## Contexto

El canal actual de desarrollo identifica una PC por `pcId` en `hello`, sin credencial,
y usa WebSocket sin TLS. No cumple todavía REQ-003-11 ni REQ-003-63: otra PC podría
presentar ese identificador y las contraseñas viajarían sin cifrar por la LAN.
El host y los juegos comparten el usuario restringido, mientras que el servicio corre
como LocalSystem. El puente no debe convertirse en una vía para ordenar operaciones
privilegiadas a partir de cualquier proceso de ese usuario.

El mantenedor pidió redactar esta propuesta el 2026-10-04. Autorizar su redacción no
equivale a aprobar el ADR ni a autorizar su implementación.

## Decisión propuesta

1. **TLS en la LAN.** Usar `wss://` para el agente y `https://` para registro y descargas.
   El instalador recibe por un medio confiable la identidad del nodo y su certificado
   o clave pública fijada. No se admite aceptar cualquier certificado ni confiar
   automáticamente en el primero recibido. La renovación debe tener un procedimiento
   documentado que mantenga el bloqueo si no puede verificarse la nueva identidad.
2. **Una credencial aleatoria por PC.** El código de instalación se consume de forma
   atómica y entrega una credencial de alta entropía. El nodo guarda su hash SHA-256;
   no es una contraseña humana. El servicio presenta la credencial en la cabecera de
   la conexión, nunca en la URL, los logs, el `hello` ni el JavaScript del Shell. El
   nodo obtiene la identidad desde la credencial y rechaza un `pcId` distinto.
   Revocar la credencial impide conexiones y descargas y cierra su canal existente.
3. **Custodia en el servicio.** Guardar la credencial y la configuración de confianza
   en almacenamiento protegido de Windows con ACL para LocalSystem y administración;
   el usuario cliente no puede leer ni modificar esos archivos. El instalador no
   copia secretos al perfil de WebView2. El mecanismo concreto de protección y
   recuperación se documentará antes de aprobar el plan.
4. **Pipe privado y host identificado.** ACL explícita, rechazo de clientes remotos y
   comprobación del PID del cliente mediante `GetNamedPipeClientProcessId`, contrastado
   con el proceso del host que el agente lanzó y supervisa. Verificar también su
   sesión y conservar la referencia al proceso para evitar reutilización del PID.
   Una ACL por usuario o comprobar solo la ruta del ejecutable no basta. Las
   solicitudes son mensajes tipados: no se admite ejecutar rutas, scripts o comandos
   arbitrarios enviados por el Shell.
5. **Interfaz local.** Empaquetar `shell-ui/dist` junto al host y servirla mediante un
   origen virtual de WebView2 mapeado a esa carpeta. Permitir el puente solo para ese
   origen; rechazar navegación externa, nuevas ventanas, descargas y herramientas de
   desarrollo en producción. El host usa el usuario restringido, sin elevación.
   No se ejecuta WebView2 dentro del servicio LocalSystem.
6. **Validación y límites.** Zod sigue definiendo los contratos y se exporta JSON
   Schema para las pruebas C#. Validar tipo, campos y tamaño antes de actuar en cada
   frontera. Mantener acotadas colas, mensajes y reintentos; limpiar los buffers de
   autenticación y evitar registrarlos. Las órdenes remotas tienen identificador y
   confirmación, para no repetir una operación tras reconectar.

## Alternativas consideradas

- **`ws://` en una LAN de confianza:** no evita captura de contraseñas ni suplantación.
- **Identificar por MAC o `pcId`:** sirven como datos de inventario; no autentican.
- **Dar la credencial al Shell:** cualquier exposición del JavaScript o del perfil
  permitiría reutilizarla fuera del servicio.
- **Cargar toda la interfaz desde el nodo:** con el nodo caído podría faltar incluso
  la pantalla que indica la desconexión.
- **Pipe autorizado solo por SID:** cualquier juego o proceso del mismo usuario
  podría intentar usarlo.

## Consecuencias

- El transporte y la identidad de la PC se verifican antes de aceptar un login.
- Un fallo de WebView2 no elimina la conexión, los latidos ni el estado del agente.
- La interfaz de bloqueo existe aunque el nodo no responda.
- Hay que gestionar certificados, revocación, recuperación e instalación offline.
- Cambia la admisión del protocolo: simulador y tests deben usar credenciales de
  prueba; no quedará una excepción de producción para agentes sin registrar.
- El pipe limita las operaciones privilegiadas, pero no demuestra por sí solo que
  cualquier aplicación del mismo usuario sea inocua. El bloqueo y las vías de escape
  siguen necesitando validación nativa y el trabajo de la spec 004.

Referencias: [seguridad de WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security),
[contenido local de WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/working-with-local-content)
y [PID del cliente de un pipe](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeclientprocessid).
