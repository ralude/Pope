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

## T09/T10 · prototipos pendientes

No se han creado/cambiado escritorios, instalado servicios, modificado UAC ni probado
credenciales de mantenimiento Windows. La VM Home vuelve a estar accesible, pero la
compatibilidad Pro sigue pendiente antes de la entrega; el mantenedor autoriza T09
con los resultados Home aceptados. T09 requiere también PC
real con juego exclusivo, monitores/audio/versiones registrados, ida/vuelta por Alt+Tab
sin Explorer y apps intactas. T10 debe demostrar token elevado, perfil, aislamiento y
salida exclusiva de mantenimiento, con ADR-0018 todavía Propuesto. Las verificaciones
son dependencias de T11–T20, no resultados que puedan inferirse de los fixtures C#.
