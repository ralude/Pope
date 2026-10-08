# ADR-0018: Mantenimiento con una cuenta administradora Windows existente

- **Estado:** Aceptado (mantenedor, 2026-10-08; mecanismo pendiente de demostrar en T10)
- **Fecha:** 2026-10-04
- **Relacionado:** ADR-0005, ADR-0006, ADR-0017, spec 003

## Contexto

REQ-003-40 permite al encargado o administrador autenticarse con su cuenta del personal
de Pope para acceder a Windows completo. REQ-003-43 permite iniciarlo desde el panel
sin escribir nada en la PC. Esa autorización del nodo no otorga por sí misma un token
administrador de Windows y no debe elevar la cuenta cliente ni el host de WebView2.

Tras comparar las alternativas del plan, el mantenedor eligió **reutilizar una cuenta
administradora Windows existente** el 2026-10-04. El 2026-10-08 aprueba la ruta candidata; falta verificar cómo se
protege su credencial y se abre y cierra el entorno administrativo.

## Decisión

- Configurar en cada PC una cuenta local administradora ya existente, destinada al
  mantenimiento. Pope no crea otra ni modifica el grupo o los privilegios del cliente.
- El técnico configura esa identidad y su credencial localmente durante la instalación.
  No se solicitan contraseñas por chat ni se guardan en el nodo, en configuración plana,
  en argumentos de procesos, en el Shell React ni en el perfil WebView2.
- El agente custodia el secreto con protección de Windows y ACL restringida. Antes de
  habilitar el mecanismo, verificar almacenamiento, recuperación y sustitución de la
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

## Mecanismo aprobado para ensayar en T10 (2026-10-08)

- **Custodia:** blob DPAPI de máquina en `%ProgramData%\Pope\Maintenance\credential.bin`,
  con directorio/archivo sin herencia y DACL exclusiva de SYSTEM. El configurador local
  elevado recoge la credencial mediante entrada privada; nunca por chat, argumentos,
  React o logs. Configura el blob/ACL antes de habilitar el acceso. DPAPI de máquina
  exige esta ACL: no se interpreta el cifrado como permiso exclusivo del servicio.
- **Sustitución/recuperación:** el técnico vuelve a configurar localmente tras cambiar
  la contraseña o restaurar Windows. Escritura temporal protegida y sustitución atómica;
  conservar el blob anterior si falla. No exportar el secreto ni ofrecer recuperación
  desde el nodo. Una credencial inválida deja la PC bloqueada y requiere reconfiguración.
- **Token:** broker nativo de prueba como servicio SYSTEM, separado de WebView2, con
  operaciones fijas del ensayo; ningún ejecutor elevado configurable por el cliente.
  Probar `LogonUser` interactivo y el token elevado vinculado, duplicarlo como primario
  y asignarlo a la sesión de consola. Comprobar SID, elevación e integridad efectivos;
  si Windows no concede el token requerido, fallar y revisar la ruta, sin cambiar UAC.
- **Entorno candidato:** escritorio temporal propio dentro de `WinSta0`, con DACL para
  SYSTEM y el SID del **nuevo logon**, no el SID genérico de la cuenta. Conceder solo los
  permisos necesarios en la estación de ventanas y retirar únicamente las ACE propias.
  Cargar el perfil existente y su entorno con las APIs Windows; no reutilizar el perfil
  cliente ni borrar archivos. Registrar escritorio, SID/logon, perfil y token por proceso.
- **Salida candidata:** crear procesos suspendidos, asignarlos a un Job Object sin
  breakaway y reanudarlos. Al salir cerrar solo el job de ese mantenimiento, descargar
  únicamente la referencia al perfil adquirida por Pope, retirar permisos y volver al
  bloqueo. Verificar Explorer y herramientas/hijos en ese job: si Explorer reutiliza
  otro proceso o una herramienta escapa, no dar por probado el cierre ni matar por nombre.
- **Límites del ensayo:** probar cuenta/clave inválida, aislamiento desde el token
  cliente, continuidad de WebView2 sin elevar, fallo del broker y recuperación acotada.
  El prototipo no integra autorización del nodo ni acceso remoto de producto. Solo tras
  demostrar token/perfil/ACL/salida se decidirá si esta ruta basta o hay que proponer una
  sesión Windows independiente. No se afirma que las APIs garanticen el resultado.
- **Inventario VM leído (2026-10-08):** solo `vboxuser` habilitada, miembro de
  Administradores; cuenta integrada Administrador deshabilitada, `EnableLUA=1`.
  T09 utilizó el token no elevado de `vboxuser`; eso no equivale a una cuenta estándar
  de cliente. El ensayo debe identificar esa diferencia y demostrar permisos efectivos;
  no habilitar/crear cuentas ni alterar grupos como consecuencia implícita de esta revisión.

El mantenedor aprueba explícitamente esta ruta y pide continuar T10 el 2026-10-08.
La aprobación autoriza el prototipo; **no demuestra su funcionamiento** ni habilita
la integración antes de verificar las propiedades anteriores.

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

Fuentes de la propuesta T10: [DPAPI y alcance de máquina](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata),
[LogonUser](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-logonuserw),
[consulta del token](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-gettokeninformation),
[carga del perfil](https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-loaduserprofilew)
y [Job Objects y límites de herencia](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).
