# Mediciones 003 · cliente Windows

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
