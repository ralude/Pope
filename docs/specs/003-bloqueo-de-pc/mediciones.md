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

## T08b · compatibilidad del inventario pendiente

| Entorno exigido | Evidencia | Estado |
|---|---|---|
| Windows 10 Pro 22H2 x64 | Build exacto de Windows, publicación autocontenida, fixtures, arranque de artefactos | Pendiente: el mantenedor instalará pronto la VM en VirtualBox |
| Windows 11 Pro 25H2 x64 | Build exacto de Windows, publicación autocontenida, fixtures, arranque de artefactos | Pendiente: acceso a PC/VM de esa versión |

La matriz oficial de [.NET 10](https://github.com/dotnet/core/blob/main/release-notes/10.0/supported-os.md)
no incluye Windows 10 Pro 22H2. El build en desarrollo no demuestra cumplimiento de
REQ-003-62; registrar resultado real sin confundir compatibilidad funcional con soporte
del fabricante. No cambiar framework/inventario/ADR sin resolver cualquier fallo.

## T09/T10 · prototipos pendientes

No se han creado/cambiado escritorios, instalado servicios, modificado UAC ni probado
credenciales Windows. La VM anunciada aún no está disponible. T09 requiere también PC
real con juego exclusivo, monitores/audio/versiones registrados, ida/vuelta por Alt+Tab
sin Explorer y apps intactas. T10 debe demostrar token elevado, perfil, aislamiento y
salida exclusiva de mantenimiento, con ADR-0018 todavía Propuesto. Las verificaciones
son dependencias de T11–T20, no resultados que puedan inferirse de los fixtures C#.
