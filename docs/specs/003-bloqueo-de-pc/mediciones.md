# Mediciones 003 · cliente Windows

## T15 · implementación local; ensayo SCM pendiente (2026-10-11)

REQ-003-02/63, ADR-0017; Windows 11 Pro 26H2/26300.9457, sin VM.

- T15a/b/c1/c2 implementadas: configuración estricta, HTTPS/certificado vigente/SAN,
  DPAPI de máquina, buffers borrados, DACL/propietario SYSTEM/administración,
  trabajo único cancelable y logs cerrados con dos archivos de hasta 64 KiB.
- Nueve tests nativos nuevos pasan; **343 nativos** sin omitidos. Pruebas de guardas
  autocontenidas rechazan inicio fuera de SCM/SYSTEM y ensayo sin elevación, sin instalar.
- Batería general completa correcta: formato/lint/tipos/build y **1 628 tests**, incluidos
  420 del servidor (evidencia PostgreSQL real reutilizada por caché), 54 simulador y
  343 nativos. Logs `tmp/t15-final-{format,lint,typecheck,build,test-pg}.log`.
- Ensayo preparado `b3181fdb63634f5eb24eef508f365a79`, manifiesto/hashes en
  `tmp/agent-service-b3181fdb63634f5eb24eef508f365a79/`. Lanzamiento UAC desde token medio:
  Windows devuelve **«El usuario ha cancelado la operación»** antes de iniciar el
  instalador elevado. No registrar resultado de custodia real, parada ni corrupción SCM.
  `sc query Pope.Agent.Test.b3181fdb63634f5eb24eef508f365a79` devuelve 1060 y la carpeta
  `ProgramData/PopeAgentTest-b3181fdb63634f5eb24eef508f365a79` no existe.
- **T15/T15c3 siguen abiertas:** reabrir el ensayo y aceptar UAC para comprobar
  SYSTEM/sesión 0, denegación del token medio, parada, corrupción y retirada.
  [Lanzador revisable](../../../apps/native/probes/test-agent-service.ps1).
  T16–T20 pendientes; T10 abierta. PostgreSQL temporal propio detenido al terminar.

## T14 · simulador autenticado (2026-10-11)

REQ-003-10/11/63, REQ-002-30; mismo entorno Windows de T12/T13, sin VM ni cambios del sistema.

- Registro real desde CLI con código por archivo y perfil `purpose: simulator`.
  UUID/nombre vienen del nodo; secreto aleatorio solo en perfil privado ignorado por Git.
  Ausencia de código/credencial en stdout/stderr de la CLI comprobada.
- Certificado no confiable y CA ajena rechazados antes del consumo; WSS con CA ajena
  también falla antes de hello. No se desactiva la validación ni se cambia confianza de Windows.
- Login, latidos, pausa/reanudación y reconexión `unknown` conservando la pausa y sesión
  del nodo verificados por el simulador real. Credencial falsa recibe 401.
- Integración pasa en PGlite y PostgreSQL 18.6; 54 tests de la herramienta pasan.
  Batería general completa: formato/lint/tipos/build y **1 619 tests**, incluidos
  **420 del servidor**, **54 del simulador** y **334 nativos**, sin omitidos.
  Logs ignorados `tmp/t14-real-{node,pglite}.log` y
  `tmp/t14-final-{format,lint,typecheck,build,test-pg}.log`.
- [Guía y comandos](../../../tools/agent-sim/README.md); `test:node` reproduce la integración.
  La dependencia de build del simulador pertenece solo a tests del servidor, sin añadir
  bibliotecas ni recursos de simulación al nodo entregado al local.

## T13 · canal autenticado en desarrollo (2026-10-11)

REQ-003-11/63; ADR-0017. Mismo Windows 11 Pro 26H2/26300.9457 de T12;
sin VM ni cambios del sistema.

- SHA-256 de Bearer verificado antes del upgrade; ausencia/formato/desconocida/revocada
  reciben 401 sin secreto. Identidad de hello ligada a la credencial, v2 obligatoria;
  identidad ajena y hello repetido cierran el canal.
- Rotación libre de T12 cierra la conexión vieja y rechaza su reconexión. Revalidación
  después del upgrade rechaza revocación previa al hello. La recuperación con copia
  desconocida devuelve la sesión del nodo sin inventar un reinicio/cierre.
- JSON/variantes malformadas y campos extra rechazados; secretos ausentes de logs.
  Frames binarios: 1003; más de 16 KiB: 1009; más de 32 trabajos: 1008.
  Salida limitada a 256 KiB y limpieza serializada al desconectar.
- Diez pruebas nuevas pasan en PGlite; 27 regresiones de sesiones/pausa/TLS pasan.
  Batería completa con PostgreSQL 18.6: **419 tests servidor**, **334 nativos**,
  **1 612 totales**, sin omitidos; formato, lint, tipos y build correctos.
  Logs ignorados: `tmp/t13-final-{format,lint,typecheck,build,test-pg}.log`.
  Dos workers y `--env-mode=loose` conservan el entorno de la base temporal.

## T12 · registro seguro en desarrollo (2026-10-11)

REQ-003-10/11, CA-003-11; ADR-0017. Sin VM ni cambios del sistema.

- Emisión solo con sesión de encargado/administrador; dueño y petición anónima
  rechazados. Registro público validado y respuestas con secretos `no-store`.
- Código RNG de 128 bits y credencial de 256 bits; solo SHA-256 en base de datos.
  Auditoría estricta sin códigos, credenciales ni hashes, vinculada por ID del código.
- Consumo/cambio de PC/credencial/evento en una transacción; doble consumo concurrente
  produce un registro y un evento. Fallo de auditoría deshace los cambios.
- Acepta a 599 999 ms; rechaza a 600 000 ms sin consumir. Asignación concurrente de
  nombres respeta nombres anteriores sin distinguir mayúsculas.
- Respuesta perdida: el código usado no se reutiliza; otro código ligado a la misma
  PC conserva nombre/posición, cambia MAC y revoca el hash anterior solo al consumir.
  Sesión activa (incluye pausa), mantenimiento abierto y reserva impiden recuperación.
- Once pruebas nuevas pasan en PGlite y PostgreSQL real, con bases temporales migradas
  y borradas por los tests; servidor PostgreSQL de desarrollo en `tmp/contracts003-pg`.
  Logs ignorados: `tmp/t12b-tests.log`, `tmp/t12c-tests.log` y `tmp/t12-pg.log`.
- Windows 11 Pro 26H2 **26300.9457**, PostgreSQL **18.6**, Node 24.21.0 y pnpm 12.4.2.
- Formato/lint/tipos/build completos correctos; batería general completa correcta:
  **409 tests del servidor** en PostgreSQL real y **334 nativos**, sin omitidos.
  Las primeras ejecuciones se detuvieron
  al detectar recreación lenta de PGlite y variables filtradas por Turborepo; ejecución
  final: `pnpm test --env-mode=loose` con `TEST_DATABASE_URL` local y dos workers.
  Logs completos en `tmp/t12-final-{format,lint,build-types,test-pg}.log`.

## T08a · preparación en desarrollo (2026-10-07)

REQ-003-02/60/62/63; ADR-0002/0006/0017/0019.

- Entorno observado mediante `Environment.OSVersion`: Windows NT **10.0.26300.0**, x64.
  No es evidencia de Windows 10 Pro 22H2 ni Windows 11 Pro 25H2 del local.
- SDK **10.0.401**, runtime **10.0.12**, framework `net10.0-windows` y RID `win-x64`.
- SDK descargado del sitio oficial y SHA512 comparado con `releases.json` antes de
  extraerlo en `tmp/`; sin instalación global, cambios de cuentas, shell o servicio.
- **334 tests C# pasan:** 333 fixtures T07 y cobertura válida/inválida de 19 contratos.
  Normalización ECMAScript exportada, contraseña intacta, formatos activos y Unicode;
  sin duplicar reglas de saldo/cobro. No se ha desactivado ningún caso incompatible.
- `dotnet build Pope.slnx -c Release --no-restore -warnaserror`: **0 advertencias, 0 errores**.
  La referencia WPF automática de WebView2 se excluye porque el host solo usa WinForms.
- Publicación autocontenida de Agent y ShellHost en `dist/agent`/`dist/host`, con lock
  de NuGet bloqueado; ambos `--check-build` devuelven **0** en el entorno de desarrollo.
  No se muestra UI ni se registra/arranca un servicio en esa comprobación.
- `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan con
  el paquete nativo integrado: **1 581 tests**, incluidos los 334 C# (el resto se
  verificó en esta sesión y se reutilizó desde caché al integrar el workspace).

## T08b · resultados Home aceptados; compatibilidad Pro pendiente

**Aprobación posterior (mantenedor, 2026-10-08):** acepta las pruebas Home de este
informe como válidas para cerrar T08b/T08 y continuar T09. Sustituye el gate anterior;
las notas preliminares de abajo conservan el alcance existente cuando se ejecutaron.
No se han probado los Windows Pro del inventario; se verificarán antes de la entrega.

| Entorno exigido | Evidencia | Estado |
|---|---|---|
| Windows 10 Pro 22H2 x64 | Build exacto de Windows, publicación autocontenida, fixtures, arranque de artefactos | Pendiente: la VM Home supera las comprobaciones preliminares, sin sustituir Pro |
| Windows 11 Pro 25H2 x64 | Build exacto de Windows, publicación autocontenida, fixtures, arranque de artefactos | Pendiente: acceso a PC/VM de esa versión |

La matriz oficial de [.NET 10](https://github.com/dotnet/core/blob/main/release-notes/10.0/supported-os.md)
no incluye Windows 10 Pro 22H2. El build en desarrollo no demuestra cumplimiento de
REQ-003-62; registrar resultado real sin confundir compatibilidad funcional con soporte
del fabricante. No cambiar framework/inventario/ADR sin resolver cualquier fallo.

### VM Home · preparación y acceso (2026-10-07)

- VirtualBox **7.2.20 r175154**, VM «22h2 pope», UUID
  `954b5530-1c41-4970-810f-c35d5aa48b05`, Guest Additions de la misma versión.
  Configuración observada: **8192 MB**, **2 vCPU**, red NAT.
- Guest Control permitió lecturas autenticadas iniciales: registro `ProductName=Windows
  10 Home`, `EditionID=Core`, `DisplayVersion=22H2`, build **19045.2965**; CIM confirma
  `Microsoft Windows 10 Home`, SKU **101**, arquitectura x64. Sin `dotnet` en PATH.
- El mantenedor autoriza **Home solo para pruebas preliminares**; no es evidencia de
  cumplimiento de REQ-003-62 en las ediciones Pro del inventario.
- Preparados en `tmp/` (ignorado): publicaciones autocontenidas, los tests compilados y
  fixtures T07, manifest SHA256, SDK portable con SHA512 y runner. El runner comprobará
  primero el arranque `--check-build` sin SDK y después los 334 tests del protocolo.
  No instala servicios ni SDK global; no modifica cuentas, UAC o escritorios.
- **No se han ejecutado esos artefactos ni los tests dentro de la VM.** Los intentos de
  crear/copiar archivos y abrir procesos no iniciaron sesión de Guest Control
  (`starting`/`VERR_DUPLICATE`). La captura muestra CPU al 100%; el log de VirtualBox
  registra latidos intermitentes y retrasos de ejecución.
- Recuperación intentada: snapshot en vivo detenido al guardar estado, cancelado por
  `IProgress.Cancel()` y vuelta a `running`; **ningún snapshot completado**. El reinicio
  normal mediante Guest Additions falla con `VERR_DUPLICATE`. La solicitud ACPI de apagado
  se acepta, pero la VM sigue `running` en la comprobación posterior. Sin reset forzado.
- Siguiente paso: recuperar Windows/Guest Additions y ejecutar el paquete preparado.
  La credencial se conserva solo en un archivo ignorado con ACL restringida; los comandos
  usan `--passwordfile`, sin imprimirla ni incorporarla al repositorio.

### VM Home · ejecución preliminar (2026-10-08)

REQ-003-02/62/63; evidencia preliminar, sin cierre de T08b ni aprobación de REQ-003-62.

- El mantenedor informa de que la VM vuelve a estar disponible. Guest Control permite
  ejecutar y copiar archivos con la cuenta existente. VirtualBox/Guest Additions siguen
  en **7.2.20 r175154**, misma VM/UUID; **8192 MB y ahora 4 vCPU**, red NAT.
- El runner identifica **Windows 10 Home 22H2 x64**, `EditionID=Core`, build
  **19045.2965**. Inicio del informe: **2026-10-08T14:18:24.8666668Z**.
- Paquete preparado en la sesión anterior, ejecutado en
  `C:\Users\vboxuser\Pope-T08b-20261008\`. SHA256 de los dos ejecutables, DLL de tests y
  fixtures comprobados contra su manifest antes de ejecutar. Los ejecutables y JSON
  del protocolo coinciden con los del workspace; no se compila en el invitado.
- **Agent y ShellHost `--check-build`: código 0**, antes de extraer el SDK portable;
  no había `dotnet` en PATH. Se comprueba el arranque de las publicaciones autocontenidas,
  sin inicializar WebView2 ni mostrar UI. No demuestra el bloqueo ni el host operativo.
- SDK portable **10.0.401**, SHA512 comprobado antes de extraer, runtime **10.0.12**.
  `dotnet vstest` sobre el DLL preparado: **334/334 correctos**, cero fallos y cero
  omitidos; 333 fixtures T07 más cobertura de los 19 contratos. Código de salida **0**.
- Informes recogidos en `tmp/vm-t08b/result-smoke.json`, `result.json` y `protocol.trx`
  (ignorados por Git). El TRX confirma 334 ejecutados/correctos y runtime 10.0.12.
  Credencial fuera de Git y de los informes; usada exclusivamente mediante archivo.
- `pnpm format`, `pnpm lint`, `pnpm typecheck` y `pnpm test` correctos antes de registrar
  la evidencia. Turborepo reutiliza la caché de los paquetes sin cambios de producto;
  los 334 tests del invitado se ejecutan realmente y tienen su TRX independiente.
- Sin instalación global de SDK/runtime, servicio, cambios de cuentas, shell, UAC o
  escritorios. El bloqueo anterior de Guest Control queda resuelto. La siguiente
  verificación sigue siendo ejecutar artefactos/contratos en **ambos Windows Pro**;
  T08b y el grupo T08 permanecen abiertos, sin avanzar a T09–T20.
  El mantenedor confirma que por ahora solo está disponible la VM Home.

## T09/T10 · prototipos nativos

### T09a · herramienta preparada (2026-10-08)

- `Pope.DesktopProbe`: proceso independiente del producto, WinForms y WebView2 ya
  fijados, sin nuevas dependencias externas. Las llamadas Win32 llevan comentarios.
- Creación temporal con DACL explícita; procesos con `STARTUPINFO.lpDesktop` desde el
  arranque, antes de crear ventanas. Una instancia STA y perfil WebView2 por escritorio.
  Token elevado rechazado; evidencia de escritorio/PID/entrada/latidos y captura PNG.
- Build Release de la solución: **0 avisos y 0 errores**. Publicación autocontenida
  `win-x64` y `--check-build` correctos en desarrollo, sin mostrar ventanas allí.
- Consulta de Guest Control en VM: proceso en **sesión 1 interactiva**, mismo usuario
  que Explorer; runtime WebView2 **154.0.4258.62** ya instalado. No se instala runtime.
- No se han ejecutado todavía cambios de escritorio ni dado por comprobadas ACL,
  aislamiento, Alt+Tab o juego exclusivo; T09b/T09c y el grupo T09 siguen abiertos.

### T09b · escritorio y entrada verificados en VM (2026-10-08)

- Home 22H2, sesión 1 no elevada, WebView2 154.0.4258.62. Dos ejecuciones correctas:
  `run-20261008-145600` y final `run-20261008-145830` (14:58:30 UTC), salida **0**.
- DACL efectiva protegida, solo usuario/SYSTEM; ningún Explorer en los escritorios
  temporales. WebView2 renderiza en ambos, en procesos/STA distintos; escritorio
  inicial/actual idéntico. Alt+Tab alterna Pope (PID 3192) / app (968) sin Explorer.
- App recibe teclas/clics en uso; en bloqueo ambos contadores quedan intactos y su
  latido avanza. Bloqueo recibe las teclas/clics de prueba y Alt+Tab no alcanza la app.
  Al volver recibe entrada, conserva PID y las tres ventanas siguen ejecutándose.
  Informe `Passed=true`, `Restored=true`; capturas de pantalla completa inspeccionadas.
- WebView2 necesitó heredar **un único handle de escritorio** al crear cada proceso;
  los persistentes no son heredables. Sin esa herencia, la inicialización no terminaba.
  El reemplazo de archivos de diagnóstico produjo `UnauthorizedAccessException` en
  la VM; se usa JSONL acotado por duración y se evita el diálogo modal de excepción.
- Evidencia local ignorada: `tmp/t09b-evidence/` (informe, tres JSONL y cuatro PNG).
  Fuente reproducible en `Pope.DesktopProbe`; sin servicios ni cambios de cuenta/UAC.
  Escritorios destruidos al terminar; watchdog independiente restaura a los 120 s.

### T09c · juego exclusivo verificado en VM (2026-10-08)

- Paquetes portátiles oficiales: Chocolate Doom **3.1.1** + Freedoom **0.13.0**, fase 1
  E1M1 sin monstruos ni sonido. SHA256 de los ZIP comprobados antes de extraer:
  Chocolate `58c34c61ae954493fce5ff01fd553898240a0de25658aa97b43ac9510c49581f`,
  Freedoom `3f9b264f3e3ce503b4fb7f6bdcb1f419d93c7b546f4df3e874dd878db9688f59`.
- Ejecución final `game-run-20261008-152316`, **15:23:17 UTC**, salida **0**.
  Modo inicial **1920×955**, juego **800×600** antes/después del bloqueo. Configuración
  `fullscreen=1`, dimensiones explícitas y renderizador software: fuente 3.1.1 utiliza
  `SDL_WINDOW_FULLSCREEN` en esta rama, frente a `FULLSCREEN_DESKTOP` sin dimensiones.
- Alt+Tab: juego → Pope (PID 1844) → juego (1840), sin Explorer. PID del juego intacto
  durante bloqueo y retorno; la app auxiliar se oculta tras T09b para dejar esos dos
  participantes en el selector. Windows minimiza el juego al perder foco; restaurar
  esa ventana conserva la partida y recupera el renderizado, sin relanzar el juego.
- Demo Doom 1.9: **372 tics**, **196** entre marcas de bloqueo/retorno; **0** con
  movimiento y **0** con disparos. Movimiento antes y movimiento/disparo después
  sirven como controles positivos. Bloqueo recibe teclas/clics y Alt+Tab no alcanza
  al juego. Informe `GamePassed=true`, `Passed=true`, `Restored=true`.
- Evidencia local ignorada: `tmp/t09c-evidence/`, informe/demo/configuraciones/JSONL
  y tres capturas de pantalla. Fuente reproducible `GameProbe.cs`; no se instala juego
  ni servicio. La VM se congeló entre T09b y la transferencia; ACPI no respondió y se
  reinició la VM aislada, recuperando Guest Control. No se atribuye una causa sin prueba.
- El mantenedor acepta la VM para **cerrar T09 y avanzar**, conservando pruebas físicas
  con juegos reales/anticheat en **T25/T56 antes de entrega**. Audio no probado; tampoco
  demuestra compatibilidad del inventario Pro. T10/ADR-0018 sigue pendiente de mecanismo.

Fuentes del juego: [descarga de Chocolate Doom](https://www.chocolate-doom.org/wiki/index.php/Downloads),
[Freedoom](https://freedoom.github.io/download.html), [modo gráfico de 3.1.1](https://github.com/chocolate-doom/chocolate-doom/blob/chocolate-doom-3.1.1/src/i_video.c)
y [formato de grabación](https://github.com/chocolate-doom/chocolate-doom/blob/chocolate-doom-3.1.1/src/doom/g_game.c).

### T10 · preparación y revisión pendiente (2026-10-08)

Consulta de solo lectura por Guest Control: única cuenta habilitada `vboxuser`, miembro
de Administradores; integrada Administrador deshabilitada; `EnableLUA=1`, sesión 1.
No se crean/habilitan cuentas ni se modifica UAC. T09 usó el token no elevado de esa
cuenta; no prueba los permisos de una identidad cliente estándar. ADR-0018 ahora detalla
la ruta candidata de custodia/token/escritorio/perfil/salida para revisión humana;
sigue **Propuesto**, sin prototipo T10 implementado ni prueba de elevación realizada.

### T10 · aprobación, prototipo y gate fallido (2026-10-08)

- ADR-0018 aceptado explícitamente; prototipo aislado `Pope.DesktopProbe`, sin autorización
  del nodo ni acceso remoto de producto. Build sin avisos; formato, lint, tipos y tests
  del workspace pasan. SDK 10.0.401/runtime 10.0.12, mismo WebView2 de T09.
- Paquete autocontenido ZIP **52 182 221 bytes**, SHA256
  `a4832b393467502cdf894d7bf069274739e42b0903fdc408626c93658ac1a081`.
  DLL del prototipo SHA256
  `56f0791612c1727a0d00669198343b0b203de7abad95718a452db1f4c5450098`.
  Ambos coinciden en host/VM. Arranque, fixture DPAPI/Unicode/corrupción y lectura del
  token limitado pasan sin instalar SDK. La primera orden de arranque por Guest Control
  agota espera de stdout, pero el runner sigue y termina; no se repite la autenticación UI.
- Ejecución `6b0b8eee385344e6ae18a3fd9d2dec83`, **16:17:56.1749172 UTC**.
  El mantenedor completa UAC y entrada privada local. No contraseña en chat/argumentos
  ni logs. Servicio SYSTEM en sesión 0; ayudante sin GUI en sesión 1; ventanas bajo sus
  tokens de usuario. Token administrativo completo (tipo 2), integridad **12288**;
  cliente sin elevación, **8192**. Misma cuenta Windows, logons distintos en sesión 1.
- Propietario SYSTEM y DACL exclusiva SYSTEM comprobados en directorio/blob. Reemplazo
  corrupto conserva el anterior; reemplazo válido funciona. Un usuario inexistente y
  una única contraseña ficticia tras login válido devuelven **1326**. Política consultada:
  bloqueo tras **10** intentos; no se cambia ni se repiten fallos sobre la cuenta real.
- Cliente no puede leer/cambiar el escritorio administrativo, leer el blob ni duplicar
  el token elevado. Ventana/hijo coinciden en token, logon, escritorio y perfil esperado;
  ambos pertenecen al job y terminan al cerrarlo. WebView2 continúa vivo y sin elevación.
  Fixture previa del perfil y procesos previos se conservan.
- **Falla Explorer:** el proceso lanzado termina a los 5 s de observación. No hay prueba
  de Explorer vivo bajo ese token/escritorio/job; no demuestra Windows completo. El
  código de salida no se registró en esta ejecución; no se afirma que haya delegado.
  Consulta de Application/1000 de los últimos 20 min: **0** fallos de Explorer registrados,
  lo que tampoco identifica la causa. `NormalPassed=false`, ayudante/instalador salen **1**.
- La fase posterior de muerte del broker **no se ejecuta** por el gate anterior; retorno
  externo/fallo todavía no aprobados. Retorno a bloqueo y escritorio original correctos;
  credencial, servicio y árbol temporal retirados. Comprobación posterior confirma raíz
  ausente, servicio ausente y cero procesos del prototipo; **1 Explorer previo sigue vivo**.
- La revisión automática rechaza exportar informes completos/capturas por contenido
  potencialmente sensible. Se inspeccionan y extraen dentro de la VM solo resultados
  técnicos (booleans, niveles y códigos), guardados en `tmp/t10-evidence/result-sanitized.json`.
  Informes/PNG completos quedan en la VM; no se exportan credenciales ni perfiles WebView2.
- **Conclusión:** T10 abierta, 9/59 grupos. Revisar arranque/causa de Explorer y ADR/plan
  antes de integrar o avanzar T11. No prueba Windows completo, fallo del broker, cuentas
  cliente estándar/perfiles de cuentas distintas ni compatibilidad Pro del inventario.

### T10 · pipeline completado con la estrategia aprobada (2026-10-08)

- El mantenedor aprueba actualizar `AGENTS.md`: comprobaciones pertinentes por commit,
  batería completa por tarea y Windows de desarrollo antes de transferir a la VM.
  Pide completar ahora solo el pipeline pendiente de T10; la siguiente revisión elegida
  es una sesión Windows independiente, sin aceptar todavía otro mecanismo.
- Formato nativo (`dotnet format ... --no-restore`) y `pnpm format` correctos.
  `pnpm lint` y `pnpm typecheck` completos pasan; se reutilizan resultados de Turborepo
  para entradas sin cambios. El build nativo de typecheck cuenta también como build,
  porque ambos scripts ejecutan la misma compilación Release; cero errores/avisos.
  `pnpm build --filter=!@pope/native` completa la compilación de los cinco paquetes TS,
  reutilizando caché. Sigue el aviso previo de tamaño de chunk del panel.
- Tests ejecutados: **1 581 correctos** en total. Los cinco paquetes TS pasan:
  shared **646**, servidor **391**, panel **110**, Shell **52** y simulador **48**.
  Los **334** tests nativos pasan, sin omitidos, con
  `dotnet test apps/native/Pope.slnx -c Release --no-build --no-restore`, usando los
  artefactos ya compilados. La batería TS se ejecuta con
  `pnpm test --filter=!@pope/native`; no se recompila el nativo para repetir sus tests.
- En el Windows 11 de desarrollo, el registro informa **26H2, 26300.9457**.
  `--credential-check` pasa con datos ficticios en memoria (DPAPI/Unicode/corrupción
  y rechazo de custodia fuera de SYSTEM); `--token-check` pasa con token no elevado,
  integridad **8192**, sesión **1**. Resultado sanitizado en
  `tmp/t10-final-host-sanitized.json`. Sin entrada de contraseña real, instalación
  de servicio ni cambios de cuentas, grupos, UAC, directivas o sesión del equipo.
- Logs del pipeline ignorados en `tmp/t10-final-*.log`. La evidencia funcional de VM
  anterior conserva su validez y sus límites; no se vuelve a publicar/transferir ni
  repetir esa ejecución porque no cambió el mecanismo que falló.
- **Pipeline automático completo; T10 funcional abierta.** Explorer sigue sin demostrar
  Windows completo en la VM, y la fase de muerte del broker sigue sin ejecutar.
  No avanzar T11 ni marcar T10/T10d2 completas. La prueba de desarrollo no sustituye
  Windows 11 Pro 25H2 del local ni Windows 10 Pro 22H2.

### T10 · preparación de sesión propia y acceso a VM (2026-10-08)

- VirtualBox informa `22h2 pope` en ejecución; consulta de Guest Additions devuelve
  7.2.20. La lista de snapshots indica que no hay ninguno; no se crea uno en esta etapa.
- La nueva lectura de inventario mediante Guest Control, con plazo de 25 s, falla con
  `VERR_TIMEOUT` al leer salida del proceso. Se cancela la espera del host; el cierre
  de la sesión Guest Control también devuelve timeout. La orden solo leía inventario.
  No hay JSON nuevo ni prueba de modificación de Windows o de congelación de la VM.
- No actualizar el inventario de cuentas desde esa orden: sigue siendo evidencia previa
  el único usuario habilitado/administrador. Recuperar lecturas antes del ensayo.
- [Ensayo mínimo Propuesto](ensayo-sesion-windows.md): snapshot verificado y cuenta
  cliente estándar temporal requieren autorización; entrada/retorno manuales solo
  comprueban viabilidad del escritorio, no REQ-003-40/43 completos. Ningún cambio de
  cuentas, grupos, UAC, políticas, sesiones Windows o proveedor realizado aquí.
- Cambio documental; revisión de contenido/enlaces/diff, sin repetir compilaciones ni
  los 1 581 tests ya ejecutados sobre el mismo código. T10/T10d2 siguen abiertas.

### T10 · recuperación autorizada y asistente de cuenta temporal (2026-10-09 UTC)

- «Confirmo» aprueba el ensayo y su preparación (2026-10-08 local). El mantenedor
  informa Windows VM sin respuesta y autoriza explícitamente reinicio forzado.
- Primer intento de snapshot en vivo devuelve `VBOX_E_INVALID_VM_STATE`, sin resultado.
  Snapshot normal completado: `Pope-T10-before-own-session-20261009-035332`, UUID
  `3f484244-5a23-44cc-aaa0-72461724216c`. Luego se ejecuta reset solo de esta VM.
- Guest Control vuelve a responder. Inventario del **2026-10-09T03:59:16.5462407Z**:
  VirtualBox, Home/Core 22H2, 19045.2965, una cuenta habilitada administradora,
  `PopeT10Client` ausente, EnableLUA=1, sesión de lectura 1 y prototipo anterior disponible.
- Snapshot con Windows operativo completado: UUID `0535d231-c5b4-4c22-b0bf-cd3483d99ebc`;
  es la referencia previa a la creación de cuenta. El snapshot anterior se conserva.
- Preparador PowerShell limitado a UUID/modelo de esta VM y administradora elevada:
  contraseña privada como SecureString, cuenta Usuarios, grupos/UAC previos conservados,
  manifiesto sin secreto con escritura exclusiva SYSTEM/Administradores. Si falla,
  deshabilita únicamente la cuenta creada con el SID/marcador del ensayo.
- AST correcto y rechazo del Windows cotidiano antes de escrituras comprobado. La
  primera lectura CIM en sandbox no tiene permisos; la comprobación elevada de solo
  lectura termina con el rechazo esperado. Sin ejecutar creación de cuentas en el host.
  No cambia C# ni entradas del pipeline anterior; no repetir tests/compilación de producto.

### T10 · cuenta temporal e instrumentos de observación (2026-10-09 UTC)

- El mantenedor completa UAC/entrada privada y confirma «Cuenta estándar creada y
  comprobada». Lectura posterior del ensayo `7d26df55ba4248e09e985fd18f03439a`:
  Stage=Ready, StandardVerified/Enabled/SidMatches/MarkerMatches/IsUsers=true,
  IsAdministrator=false, grupo administrativo intacto y EnableLUA=1.
- Observador nativo de cliente, administrador limitado y herramienta elevada con UAC
  manual. Comprueba perfil/token y Explorer por PID/inicio/imagen durante 30 s; conserva
  muestra inicial del cliente y copia técnica desde la herramienta alta. Archivos
  ficticios propios y límites de 15 min; no cambia ni cierra sesiones automáticamente.
- Formato y compilación nativos correctos, cero avisos; **334 tests** pasan sin omitidos.
  `--process-token-check` en desarrollo confirma consulta Win32 del proceso coherente
  con WindowsIdentity: no elevado, integridad 8192, sesión 1. No se abre GUI de ensayo
  ni se altera Windows del equipo cotidiano. Publicador PowerShell: AST y guard del
  host correctos. No repetir checks TS: no cambian sus entradas.
- Publicación autocontenida correcta con dependencias bloqueadas. El primer intento
  `--no-restore` falla NETSDK1112 por configuración de paquetes de runtime; la restauración
  correspondiente a self-contained resuelve el empaquetado. Sin dependencias nuevas.
  Ensayo manual, lectura de evidencia y retirada pendientes; no cierra T10.

### T10 · publicación y arranque cliente por verificar (2026-10-09 UTC)

- Publicación transferida y preparada con UAC humano: `deployment.json` presente,
  accesos Cliente/Administrador con destino y argumentos fijos correctos. SHA256 EXE
  `88D8481D487F7CD953C6E6FE4D8F3D0DF7440E5A9DBF14EE38A2D79E2C62E6A9` y DLL
  `4B596FFD5802BBD32F24DB17BEB60154B3021C1F0A90E9A9B76F14F84701FF16`
  coinciden con la publicación comprobada del host.
- El mantenedor comunica «Ventana Cliente abierta». Lecturas posteriores no encuentran
  `Pope.DesktopProbe` ni `client.json` (ObjectNotFound); no hay eventos Application
  1000/1026 del prototipo en la ventana consultada de 45 min. Esto no establece causa
  de cierre ni prueba un fallo del observador. No exportar perfiles ni informes completos.
- Explorer observado: PID 9484/sesión 2 y PID 10484/sesión 1; este último pertenece
  al SID de vboxuser. La sesión administrativa previa no consta cerrada: no reutilizarla
  como evidencia de inicio nuevo ni cerrarla automáticamente.
- El mantenedor informa Windows preparando la cuenta y luego «ya funciona». Pendiente
  verificar ventana cliente viva e informe, cerrar manualmente la sesión previa y
  continuar observación/retirada. Cuenta temporal y snapshots se conservan. Sin código
  nuevo; revisión documental, sin repetir compilación ni tests. T10 permanece abierta.

### T11 · HTTPS/WSS del nodo (2026-10-09)

- Fastify/Node sirven HTTPS/WSS sobre el mismo puerto, TLS mínimo 1.2; validan PEM,
  vigencia y correspondencia antes de abrir PostgreSQL. HTTP local solo en loopback.
- Prueba acotada: 14 tests config/transporte pasan; siete nuevos con HTTPS/WSS reales,
  certificado ajeno/SAN erróneo/protocolo antiguo rechazados, certificado caducado,
  clave distinta y PEM corrupto/excesivo rechazados al arrancar. Cookies Secure y
  credenciales ficticias ausentes de logs. Certificados efímeros, sin CA/internet.
- `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` correctos.
  Total 1 588 tests: 1 254 TS (398 servidor) y 334 nativos; cero fallos/omitidos.
  Build nativo también satisface su comprobación de tipos, sin cambio C#.
  Pruebas repetidas solo para el helper corregido; logs en `tmp/t11-*.log` (ignorados).
- Sin dependencias nuevas, claves versionadas, cambios de Windows ni integración
  del mantenimiento T10. Registro/autenticación y confianza del agente en T12–T16.

### T18 · pipe real en Windows de desarrollo (2026-10-11)

- Windows 11 Pro 26H2, build 26300.9457; sin VM, servicio instalado ni cambios de
  cuentas, shell, autologin, UAC o directivas. Procesos de ensayo propios cerrados.
- Impostor con el mismo SID/logon rechazado antes de recibir estado. El handle retenido
  de un proceso terminado rechaza su PID; no se fuerza la reutilización del número,
  la comparación exige además el objeto de kernel vivo. Cliente remoto loopback,
  frame truncado y cola de 32 excedida rechazados en pipes Windows reales.
- Correlación de requestId preservada; buffers de cola descartados y borrados. El
  bridge filtra órdenes/ACK, publica estado con edad y no expone credenciales.
- Formato, lint, tipos, test y build completos pasan: 1 666 tests, incluidos 373
  nativos y 420 servidor sobre PostgreSQL real. Logs ignorados `tmp/t18-*.log`.
  Lanzamiento/supervisión quedan en T22; salida durable en T40; SCM pendiente T15.

### T19 · interfaz local de producto en WebView2 (2026-10-11)

- `Pope.DesktopProbe --shell-host-proof` instancia la misma ShellWindow de producto,
  en ventana aislada del escritorio cotidiano: token medio, sin SCM ni cambios del
  shell de Windows. WebView2 Evergreen 154.0.4258.62, Windows 11 Pro 26H2/26300.9457.
- Assets/fuentes del paquete cargan sin nodo; captura `shell.png` revisada en
  `tmp/t19-host-718c6a9f37164863ad15c86adf9bc6d1` (ignorado), informe Passed=true.
  Error offline correlacionado; hello/campo credential de JS rechazados. Navegación,
  popup y descarga reales cancelados; receptor TCP local no acepta conexiones del
  fetch bloqueado. Herramientas/autorrelleno/host objects/atajos desactivados.
- Snapshot de edad 7 s se entrega con al menos 8 s tras otro ready. La credencial de
  PC nunca se proporciona a la ventana. El adaptador React definitivo queda en T20;
  el canal provisional del bundle no puede salir a red por CSP.
- Formato/lint/tipos/test/build completos correctos: 1 667 tests (374 nativos).
  Build incluye shell-ui/dist en host/probe. No demuestra instalación/autologin T54,
  supervisión T22, SCM T15 ni compatibilidad en las versiones Pro del local.
