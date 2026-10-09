# T10 · Ensayo mínimo de sesión Windows propia

- **Estado:** Aprobado para este ensayo mínimo (mantenedor, 2026-10-08: «confirmo»); ejecución pendiente
- **Fecha:** 2026-10-08
- **Cubre:** viabilidad previa de REQ-003-40/43; no cierra esos requisitos ni T10
- **Relacionado:** [ADR-0018](../../adr/0018-mantenimiento-con-cuenta-windows-existente.md), [ADR-0029](../../adr/0029-sesion-windows-de-mantenimiento-con-uac.md), [plan](plan.md), [tasks](tasks.md)

## Objetivo y resultado esperado

Resolver primero si Windows inicia y mantiene Explorer en una sesión propia de la
administradora existente, con UAC activo, perfil correcto y una herramienta elevada.
Conservar una sesión cliente estándar distinta y comprobar su continuidad al volver.
Esto evita construir un proveedor de credenciales antes de verificar el escritorio.

La entrada y vuelta Windows serán manuales en esta etapa. Un resultado positivo solo
demuestra viabilidad del escritorio y cambio manual de usuario; no demuestra entrada
remota sin teclear credenciales, retorno autónomo al bloqueo, aislamiento completo ni
recuperación tras muerte del servicio. Esas propiedades siguen pendientes en T10d2.

## Situación comprobada y límites

- VM objetivo: `22h2 pope`, UUID `954b5530-1c41-4970-810f-c35d5aa48b05`.
- Última ejecución válida: Windows 10 Home 22H2, 19045.2965, 8 GB, 4 vCPU;
  solo `vboxuser` habilitada y administradora, con UAC activo. Revalidar antes del ensayo.
- Consulta actual: VirtualBox informa VM en ejecución y Guest Additions 7.2.20.
  No hay snapshots. Una nueva lectura de inventario por Guest Control agota el plazo;
  no hay resultado actualizado de cuentas ni evidencia de que la VM esté congelada.
- No iniciar otra ejecución de autenticación ni interpretar el timeout como fallo del
  ensayo. Recuperar acceso de lectura antes de cualquier cambio; no reiniciar por defecto.
- El prototipo anterior conserva su evidencia parcial y el fallo de Explorer. Sus dos
  logons en SessionId 1 no demuestran dos sesiones Windows ni dos perfiles de usuario.

## Preparación propuesta para aprobación

El mantenedor confirma el ensayo propuesto el 2026-10-08. La autorización se limita
a esta VM, el snapshot y la cuenta estándar temporal con su retirada, conforme a los
pasos siguientes. No repetir esa solicitud de aprobación. El reinicio forzado de una
VM que no responde requiere resolver la recuperación por separado.

1. El mantenedor guarda su trabajo en la VM y la reserva para el ensayo. Inventariar
   cuentas, grupos, UAC, sesiones y recursos del prototipo mediante lecturas. Si Guest
   Control no responde, detener la preparación y resolver ese acceso por separado.
2. Crear un snapshot `Pope-T10-before-own-session-<UTC>` y registrar su UUID; comprobar
   que terminó correctamente antes de modificar Windows. Sin snapshot confirmado no
   crear cuentas ni cambiar sesiones. No restaurarlo automáticamente tras un error.
3. Crear **solo si no existe** `PopeT10Client`, cuenta estándar temporal del ensayo,
   miembro de Usuarios (SID S-1-5-32-545), nunca de Administradores. No reutilizar ni
   reemplazar una identidad del mismo nombre. Registrar GUID del ensayo y SID creado.
   La creación se hace desde una consola elevada dentro de la VM; la contraseña se
   introduce allí mediante entrada privada y se maneja como SecureString. No pasarla
   por chat, argumentos, archivos planos, logs ni Guest Control.
4. Mantener la administradora existente, su contraseña/perfil, UAC y proveedores Windows.
   No configurar shell, autologin, directivas SAS ni credenciales adicionales de Pope.
   La nueva cuenta es una fixture de ensayo, no una decisión de instalación de producto.
5. El mantenedor cierra por Windows su sesión inicial de `vboxuser` tras guardar su
   trabajo e inicia `PopeT10Client`. No terminar automáticamente esa sesión previa ni
   sus procesos. Confirmar que la administradora ya no tiene una sesión abierta.

La cuenta temporal tiene aprobación explícita: ADR-0018 prohíbe crear/habilitar
cuentas como consecuencia implícita del ensayo. Esta confirmación amplía únicamente la
preparación de pruebas, conserva la identidad administradora existente y no autoriza
instalar proveedores ni implementar el mecanismo propuesto en ADR-0029.

## Secuencia de observación

| Paso | Acción | Comprobación |
|---|---|---|
| 1. Cliente | En `PopeT10Client`, iniciar la ventana de prueba no elevada y preparar un archivo ficticio propio | Token no administrador, integridad media, SessionId/logon/perfil; PID y hash de fixture registrados |
| 2. Separar | Cambiar de usuario por Windows, conservando la sesión cliente | Cliente desconectado, procesos vivos; no cerrar su sesión |
| 3. Administrador | Iniciar manualmente `vboxuser` con autenticación privada Windows | Sesión nueva ausente del inventario previo, SessionId distinto del cliente e identidad/perfil esperados |
| 4. Windows completo | Observar escritorio, menú Inicio, barra y Explorer durante al menos 30 s | Explorer vivo en esa sesión con token limitado; no confundir pertenencia a Administradores con elevación |
| 5. UAC | Abrir una herramienta nativa de observación mediante «Ejecutar como administrador» y aceptar UAC manualmente | Token administrativo completo, integridad alta y mismo usuario/sesión/perfil; sin ventanas SYSTEM |
| 6. Salir | Cerrar herramienta y la sesión administrativa de ensayo mediante Windows | Sus PIDs terminan; perfil/fixture administrativa conservados; no cerrar sesiones ajenas |
| 7. Volver | Volver manualmente a la sesión cliente y a la ventana de prueba | Mismo SessionId/logon/PID, fixture intacta y token limitado; registrar que el retorno sigue siendo manual |

La ventana de prueba sirve para observar continuidad. El bloqueo separado/WebView2
ya demostrado en T09 se integra con esta ruta en una etapa posterior; no declarar que
la ventana de observación reemplaza ese bloqueo. Tampoco probar aún muerte del broker:
el supervisor y el retorno autónomo necesitan un mecanismo aprobado previamente.

## Evidencia y condiciones de parada

Guardar UTC, versión real, identificador del ensayo y snapshot; por proceso registrar
SessionId, PID, integridad/elevación y comparaciones de identidad/logon/perfil. Exportar
solo datos técnicos sanitizados y resultado por comprobación; no perfiles, contraseñas,
capturas de autenticación ni informes completos sin inspeccionar.

Falla esta etapa si no hay separación de SessionId, Explorer termina, la herramienta
no eleva, el cliente pierde continuidad o cambia algún dato previo. Conservar el error
real y detenerse; no desactivar UAC, matar procesos por nombre ni reutilizar sesiones.
Un timeout de transporte deja el resultado desconocido: inspeccionar antes de repetir.

## Retirada y recuperación

Al terminar, volver a una sesión administrativa de recuperación de la VM. Confirmar
que la cuenta cliente creada corresponde al SID/GUID del ensayo y cerrar su sesión.
Retirar únicamente esa cuenta y los archivos/recursos identificados como propios. Si
no se puede acreditar pertenencia, no borrar. No tocar la cuenta/perfil de `vboxuser`.
La eliminación del perfil temporal exige comprobar su SID y ruta resuelta; no borrar
perfiles por nombre ni carpetas inferidas. Verificar retirada y UAC/grupos finales.

Si la limpieza no es demostrable o falla el retorno, ofrecer restaurar el snapshot
identificado, con consentimiento para descartar los cambios posteriores de la VM.
Guardar antes la evidencia sanitizada. Mantener el snapshot hasta revisar la retirada;
no eliminar snapshots preexistentes ni restaurar uno distinto por aproximación.

## Después de esta prueba

Si pasa, concretar y aprobar entrada automática, retorno autenticado y supervisor
independiente. Si falla, revisar primero el hecho observado. T10 permanece abierta y
T11 no empieza en ninguno de esos casos. Reutilizar el pipeline automático ya aprobado;
ejecutar las comprobaciones afectadas por cualquier código nuevo y la batería completa
al cierre efectivo de T10, según [AGENTS.md](../../../AGENTS.md).

### Restricciones técnicas investigadas para la etapa siguiente

- El COM host ordinario de .NET solo admite despliegue dependiente de runtime; no
  autocontenido. No adoptarlo sin resolver la distribución de ADR-0006.
  [COM desde .NET](https://learn.microsoft.com/en-us/dotnet/core/native-interop/expose-components-to-com).
- Native AOT puede publicar bibliotecas nativas y generar interop COM, pero descargar
  una biblioteca Native AOT con FreeLibrary no está soportado. Esto identifica una
  posible vía C# y una restricción de ciclo de vida; no demuestra compatibilidad con
  LogonUI ni autoriza otra herramienta de compilación.
  [Bibliotecas AOT](https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/libraries),
  [COM generado](https://learn.microsoft.com/en-us/dotnet/standard/native-interop/comwrappers-source-generation).
- Para el retorno, estudiar ejecutar la conexión bajo la identidad del cliente cuyo
  token conserva el servicio, sin custodiar otra contraseña. WTSConnectSession admite
  contraseña vacía para el mismo usuario/dominio; la impersonación no está demostrada
  como suficiente para esa condición ni para los permisos necesarios. Es una hipótesis
  por probar tras aprobación, no un bypass de autenticación ni una propiedad de SYSTEM.
  [Conexión WTS](https://learn.microsoft.com/en-us/windows/win32/api/wtsapi32/nf-wtsapi32-wtsconnectsessionw),
  [token de sesión](https://learn.microsoft.com/en-us/windows/win32/api/wtsapi32/nf-wtsapi32-wtsqueryusertoken).
