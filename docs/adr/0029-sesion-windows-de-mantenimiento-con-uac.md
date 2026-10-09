# ADR-0029: Sesión Windows de mantenimiento con UAC

- **Estado:** Aceptado para alcance (mantenedor, 2026-10-08); entrada/retorno y recuperación siguen Propuestos
- **Fecha:** 2026-10-08
- **Relacionado:** ADR-0006, ADR-0009, ADR-0017, ADR-0018, spec 003, T10
- **Reemplaza:** el criterio de Explorer siempre elevado de ADR-0018; conserva su identidad/custodia y no acepta otro mecanismo de entrada

## Contexto

El prototipo T10 obtiene un token administrativo y demuestra custodia, aislamiento y
cierre de su ventana/hijo. Explorer termina al arrancar en el escritorio Win32 creado
por Pope dentro de la sesión cliente. La causa no está establecida. El mantenedor elige
revisar una sesión Windows independiente; no ha aprobado todavía otro mecanismo.

Se necesita Windows completo bajo la cuenta administradora existente, entrada local
autorizada por Pope y entrada remota sin teclear en la PC (REQ-003-40/43). Debe conservar
el perfil, cerrar solo el mantenimiento y volver a Pope sin elevar al cliente/WebView2.
La integración con nodo/panel y la emergencia siguen en sus tareas posteriores.

## Hechos de Windows y límites de la propuesta

1. Con UAC activo, el inicio normal de una cuenta administradora crea tokens limitado
   y administrativo; Explorer usa el limitado y las aplicaciones elevan según la política.
   Una sesión nueva no garantiza Explorer elevado. [Documentación de UAC](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/user-account-control/how-it-works).
2. `CreateProcessAsUser` crea un proceso en la sesión indicada por el token. La ruta
   usada en T10 no demuestra otra sesión Windows: sus dos logons están en SessionId 1.
   Proponer Winlogon como dueño del inicio es una hipótesis de diseño por probar, no
   una explicación del fallo anterior. [API de procesos](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessasuserw).
3. Un Credential Provider V2 puede entregar credenciales a Winlogon/LSA; Windows valida
   la identidad. `GetCredentialCount` permite un intento automático con la credencial
   predeterminada. Esto no prueba que el cambio de usuario y sesión funcione sin
   interacción en nuestras PCs. [Proveedores](https://learn.microsoft.com/en-us/windows/win32/secauthn/credential-providers-in-windows),
   [envío automático](https://learn.microsoft.com/en-us/windows/win32/api/credentialprovider/nf-credentialprovider-icredentialprovider-getcredentialcount),
   [serialización](https://learn.microsoft.com/en-us/windows/win32/api/credentialprovider/nf-credentialprovider-icredentialprovidercredential-getserialization).
4. Desde Windows 10, `CPUS_LOGON` también puede desbloquear/reutilizar una sesión.
   Hay que medir SessionId, usuario y logon reales; no basta un SID de logon nuevo.
   [Escenarios de autenticación](https://learn.microsoft.com/en-us/windows/win32/api/credentialprovider/ne-credentialprovider-credential_provider_usage_scenario).
5. WTS ofrece desconexión sin cierre, conexión entre sesiones existentes y cierre de
   una sesión concreta. Conectar exige credenciales/permisos según el contexto;
   ninguna de esas llamadas demuestra por sí sola creación, entrada y retorno completo.
   [Desconectar](https://learn.microsoft.com/en-us/windows/win32/api/wtsapi32/nf-wtsapi32-wtsdisconnectsession),
   [conectar](https://learn.microsoft.com/en-us/windows/win32/api/wtsapi32/nf-wtsapi32-wtsconnectsessionw),
   [cerrar sesión](https://learn.microsoft.com/es-es/windows/win32/api/wtsapi32/nf-wtsapi32-wtslogoffsession).

## Decisión de alcance aceptada

Usar **una sesión Windows propia de la cuenta administradora, con el escritorio
normal de Windows y UAC activo**. Explorer permanece con el token limitado de esa
cuenta; las herramientas que lo necesitan deben demostrar elevación efectiva mediante
el flujo UAC de Windows. No desactivar UAC ni abrir escritorio/herramientas como SYSTEM.

El mantenedor responde explícitamente **«Windows normal con UAC (recomendado)»** a la
pregunta de alcance el 2026-10-08. Esto cambia el criterio de Explorer elevado de
ADR-0018: acepta el comportamiento normal, incluidos los diálogos UAC que puedan exigir
las políticas al usar herramientas. La entrada al mantenimiento sigue sin introducir
otra contraseña en la PC; la configuración inicial es distinta. La respuesta acepta
solo el alcance, no los componentes, políticas o credenciales aún por diseñar.

Conservar identidad Windows existente, custodia local DPAPI/ACL SYSTEM, configuración
privada, sustitución atómica y eliminación exclusiva de secretos propios. Pope no crea
otra administradora ni cambia permisos del cliente. El nodo conserva autorización,
actor, PC libre y prohibición de nueva entrada offline; no recibe credenciales Windows.

No dar esta ruta por implementable hasta resolver y probar lo siguiente.

### Entrada candidata

1. Antes de salir de Pope, comprobar PC libre, autorización vigente y bloqueo preparado.
   Registrar sesión cliente, usuario, logon y sesiones previas. Rechazar si la identidad
   administradora ya tiene una sesión Windows abierta; no reutilizarla ni cerrarla.
2. Preparar una solicitud local de un uso ligada al mantenimiento/identidad/sesión.
   El servicio custodia la contraseña; React no la ve. El prototipo usa una autorización
   de ensayo fija, sin implementar todavía el flujo de negocio del nodo.
3. Estudiar transición a LogonUI y proveedor V2 propio para presentar la credencial a
   Windows. El proveedor solo responde al servicio autenticado y a la solicitud vigente;
   no publica un login administrador permanente ni modifica los proveedores del sistema.
   Limitarlo al inicio/desbloqueo de Windows; no usarlo para contestar automáticamente
   a diálogos UAC/CredUI ni entregar el secreto a aplicaciones.
   Identidad de pares, transporte, caducidad y borrado de buffers deben revisarse antes
   de construir este componente. Mantener disponible autenticación normal de Windows.
4. Confirmar en la consola una sesión administrativa nueva, distinta de la cliente y
   ausente en el inventario previo. Windows inicia su perfil/Explorer. Lanzar una pestaña
   técnica nativa sin elevar WebView2, con «Terminar y bloquear» ligado a esa sesión.
   Solo confirmar éxito después de comprobar escritorio, identidad y herramientas.

La transición a LogonUI está pendiente de resolver. `SendSAS` exige una política local
que permita SAS por software; no se aprueba ni cambia como consecuencia de esta revisión.
La documentación del proveedor tampoco garantiza la transición. [SendSAS](https://learn.microsoft.com/en-us/windows/win32/api/sas/nf-sas-sendsas).

El [ejemplo V2 de Microsoft](https://github.com/microsoft/Windows-classic-samples/tree/main/Samples/CredentialProvider)
usa C++. No demuestra que necesitemos ese lenguaje, pero sí identifica otra superficie
nativa y de instalación. ADR-0006 sigue vigente: no añadir C++, COM u otra herramienta
sin una decisión específica y un plan aprobado; no se presupone soporte de .NET en LogonUI.

### Salida y recuperación candidatas

- Mantener la sesión cliente bloqueada/desconectada, con sus procesos y datos intactos.
  Antes de terminar el entorno administrativo, preparar el retorno al bloqueo de Pope.
- Solicitar cierre únicamente de la sesión creada para este mantenimiento. Revalidar
  usuario, SessionId, logon y ejecución de Windows: un ID guardado puede reutilizarse.
  No cerrar sesiones previas, matar por nombre ni borrar el perfil administrativo.
- Probar retorno mediante conexión a la sesión cliente existente o autenticación de
  esa identidad. No asumir que SYSTEM evita los requisitos de contraseña de WTS.
  Si hace falta custodiar otra credencial Windows, proponer su alcance y recuperación
  antes de implementarlo; el secreto administrativo no sirve para el usuario cliente.
- Un supervisor debe poder bloquear/cerrar el mantenimiento propio tras fallo del
  servicio. Su diseño y permisos quedan pendientes: la vigilancia dentro del mismo
  servicio no demuestra recuperación si ese proceso muere.
- Una salida normal no termina hasta comprobar procesos administrativos cerrados y
  Pope bloqueado visible. Quedarse en LogonUI es un fallo de retorno, aunque impida
  acceso al escritorio; no basta para cerrar T10. Salir debe funcionar sin nodo;
  el registro durable/idempotente se integra en las tareas correspondientes.

## Pruebas previas a completar el mecanismo

| Etapa | Evidencia necesaria | Límite |
|---|---|---|
| 1. Viabilidad del escritorio | En VM, sesión propia, Explorer vivo/perfil correcto y herramienta elevada con UAC | Un inicio Windows manual sirve solo para estudiar el escritorio; no cumple entrada remota ni cierra T10 |
| 2. Entrada y retorno autónomos | Desde el ensayo autorizado hasta Windows y de vuelta a Pope sin escribir credenciales en la PC | No construir el proveedor ni cambiar políticas sin aprobación; medir reutilización/races de sesiones |
| 3. Aislamiento y fallos | Cliente estándar separado, credencial inválida, sesión administrativa previa, fallo del servicio, cierre exclusivo y datos conservados | Hoy la VM solo tiene vboxuser administradora; preparar otra identidad cliente requiere autorización explícita |
| 4. Cierre T10 | Evidencia por REQ-003-40/43, batería completa pertinente y revisión del mecanismo demostrado | Mantener T10/T10d2 abiertas y no avanzar T11 mientras falle cualquiera de las propiedades |

Pruebas de escritorio/sesión/políticas en VM aislada, con snapshot antes de cambios
aprobados. En Windows 11 cotidiano solo lecturas, compilación y comprobaciones reversibles.
Reutilizar lo ya probado de custodia cuando no cambie; repetir lo afectado por la nueva
ruta. La compatibilidad del inventario Pro sigue siendo obligatoria antes de entrega.

## Alternativas consideradas

- **Mantener Explorer y todo el entorno siempre elevados:** conserva el criterio de
  ADR-0018; la sesión Windows normal no lo satisface. Exige otra investigación, sin
  considerar desactivar UAC como solución.
- **Cambiar de usuario manualmente:** útil para una prueba inicial; añade pasos locales
  y no cumple REQ-003-40/43 como mecanismo de producto.
- **Solo llamar WTSConnectSession:** no resuelve crear la sesión ni autenticar/retornar.
- **Reintentar el escritorio/logon anterior:** requiere diagnosticar Explorer; el
  mantenedor eligió revisar primero esta alternativa. El prototipo previo se conserva.

## Consecuencias y decisiones pendientes

- La separación por sesión permitiría estudiar el inicio normal que gestiona Windows,
  pero no está demostrado que satisfaga entrada remota, elevación o recuperación.
- Aumenta el trabajo nativo y de instalación respecto a la ruta anterior. Conviene
  probar primero el escritorio y la vuelta antes de completar un proveedor o instalador.
- **Alcance confirmado:** escritorio normal de una cuenta administradora con UAC;
  no se exige Explorer siempre elevado. Las herramientas deben demostrar elevación.
- **Diseño pendiente:** transición a LogonUI, proveedor/lenguaje,
  autenticación de retorno, supervisor independiente y preparación reversible de VM.
- Este ADR está aceptado solo para el alcance. Las políticas, componentes y nuevas
  credenciales aún abiertos siguen pendientes de diseño, aprobación y prueba.
