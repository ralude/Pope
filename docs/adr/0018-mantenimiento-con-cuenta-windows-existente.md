# ADR-0018: Mantenimiento con una cuenta administradora Windows existente

- **Estado:** Propuesto (identidad elegida por el mantenedor; mecanismo pendiente de revisión)
- **Fecha:** 2026-10-04
- **Relacionado:** ADR-0005, ADR-0006, ADR-0017, spec 003

## Contexto

REQ-003-40 permite al encargado o administrador autenticarse con su cuenta del personal
de Pope para acceder a Windows completo. REQ-003-43 permite iniciarlo desde el panel
sin escribir nada en la PC. Esa autorización del nodo no otorga por sí misma un token
administrador de Windows y no debe elevar la cuenta cliente ni el host de WebView2.

Tras comparar las alternativas del plan, el mantenedor eligió **reutilizar una cuenta
administradora Windows existente** el 2026-10-04. Falta aprobar y verificar cómo se
protege su credencial y se abre y cierra el entorno administrativo.

## Decisión propuesta

- Configurar en cada PC una cuenta local administradora ya existente, destinada al
  mantenimiento. Pope no crea otra ni modifica el grupo o los privilegios del cliente.
- El técnico configura esa identidad y su credencial localmente durante la instalación.
  No se solicitan contraseñas por chat ni se guardan en el nodo, en configuración plana,
  en argumentos de procesos, en el Shell React ni en el perfil WebView2.
- El agente custodia el secreto con protección de Windows y ACL restringida. Antes de
  aprobar el mecanismo, fijar almacenamiento, recuperación y sustitución de la
  contraseña si el administrador la cambia fuera de Pope. Una contraseña no válida
  impide abrir mantenimiento y produce un error operativo, sin fallback a LocalSystem.
- El nodo valida personal/rol o la orden remota y comprueba que la PC no tenga sesión
  de cliente. El agente acepta una autorización para esa PC y ese mantenimiento;
  no expone un ejecutor general de programas elevados al host o a los juegos.
- Abrir un entorno administrativo bajo la identidad configurada, separado del cliente.
  Verificar que el token sea realmente elevado con UAC activo, que Explorer y las
  herramientas usen el perfil correcto y que los permisos del escritorio no permitan
  escapar desde procesos del cliente. No desactivar UAC, cambiar el grupo del usuario
  cliente ni mostrar ventanas como LocalSystem para conseguirlo.
- El host WebView2 continúa sin elevación; la pestaña técnica no concede permisos por
  sí misma. Se conserva el actor de Pope que autorizó la entrada, distinto de la
  identidad Windows usada para ejecutar las herramientas.
- Al terminar, cerrar el entorno y todos sus procesos administrativos y volver al
  bloqueo. Como es una cuenta existente, no terminar procesos ajenos a ese mantenimiento
  ni borrar su perfil. El prototipo debe comprobar la separación de procesos y la salida
  antes de habilitar el acceso remoto.
- Sin red, un mantenimiento ya autorizado continúa y permite terminar/bloquear;
  la salida pendiente se registra una sola vez al reconectar (REQ-003-44). No se admite
  una nueva entrada offline usando el secreto custodiado por el agente.
- La desinstalación elimina únicamente los secretos y cambios propios de Pope;
  **conserva la cuenta administradora existente**, su contraseña y sus archivos.

## Alternativas consideradas

- **Cuenta administradora creada por Pope:** separa mejor el perfil, pero crea otra
  identidad y obliga a gestionarla. El mantenedor prefirió la existente.
- **Login administrativo manual en Windows:** evita guardar esa credencial en el agente,
  pero añade un paso local y cambia la entrada remota de REQ-003-43.
- **Elevar al cliente o ejecutar Explorer como LocalSystem:** rompe la separación de
  privilegios y expone el equipo; no se propone.

## Consecuencias

- Se reutilizan las herramientas y el perfil administrativo que el local ya tenga.
- Pope depende de la disponibilidad, contraseña y políticas de esa cuenta. Hay que
  verificar su inventario, sin asumir que todas las PCs comparten credenciales.
- El perfil puede contener archivos y datos previos; Pope no los limpia como si fueran
  los del cliente ni los borra al desinstalar.
- El prototipo elegirá y documentará si se requiere una sesión Windows independiente
  o basta un escritorio aislado bajo la otra identidad. Crear un proceso con otra
  cuenta no demuestra que el escritorio completo esté elevado ni aislado.
- Si el prototipo no cumple elevación, aislamiento y salida limpia, se revisa este ADR
  y el plan antes de implementar; no se cambia a otra cuenta sin decisión del mantenedor.

Referencias: [UAC y tokens](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/user-account-control/how-it-works),
[procesos con otra identidad](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createprocesswithlogonw)
y [privilegios del host WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security).
