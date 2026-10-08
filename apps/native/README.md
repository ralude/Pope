# Cliente Windows · base de T08

Servicio `Pope.Agent`, host WinForms `Pope.ShellHost` y tests de compatibilidad con los
contratos Zod exportados. REQ-003-02/60/62/63; ADR-0002/0006/0017/0019.

**Estado:** T08a completa; compatibilidad T08b pendiente. No hay bloqueo, conexión, puente ni servicio operativos.
El inicio ordinario de ambos ejecutables devuelve un error deliberado hasta sus tareas
de implementación; `--check-build` solo comprueba que arranca el artefacto. No usar estos
binarios como Shell de Windows ni instalarlos en el local. T08b verifica el inventario;
T09/T10 prueban mecanismos nativos antes de integrar T11–T20.

## Herramientas

Desarrollo en Windows x64, Node 24/pnpm 12 y SDK .NET **10.0.401**. `global.json` permite
solo parches estables de esa banda. El SDK compila únicamente en desarrollo; el nodo local
no lo necesita. Publicación autocontenida, sin trimming ni single-file por ahora.
El runtime Evergreen WebView2 se distribuye offline en su tarea de instalación; T08 no
lo instala ni abre un navegador. Un ejecutable autocontenido incluye .NET, no WebView2.

En esta sesión el SDK oficial se descargó, verificó con SHA512 de sus metadatos y extrajo
en `tmp/native-toolchain/dotnet/`, ignorado por Git. Para reutilizarlo en PowerShell desde
la raíz, sin cambiar el PATH permanente:

```powershell
$env:PATH = "$PWD/tmp/native-toolchain/dotnet;$env:PATH"
$env:DOTNET_CLI_HOME = "$PWD/tmp/native-toolchain/cli"
$env:NUGET_PACKAGES = "$PWD/tmp/native-toolchain/packages"
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
```

También se puede usar un SDK oficial instalado que resuelva `global.json`. NuGet tiene
una sola fuente explícita, nuget.org; versiones directas y transitivas fijadas en
`packages.lock.json`. Cambiar una versión requiere revisar el plan y regenerar su lock.

## Comandos desde la raíz

```powershell
pnpm --filter @pope/native build
pnpm --filter @pope/native lint
pnpm --filter @pope/native typecheck
pnpm --filter @pope/native test
pnpm --filter @pope/native publish:agent
pnpm --filter @pope/native publish:host
./apps/native/dist/agent/Pope.Agent.exe --check-build
./apps/native/dist/host/Pope.ShellHost.exe --check-build
```

Los scripts pasan por la CLI de `dotnet`; Turborepo espera al build de `@pope/shared`.
`pnpm build/lint/typecheck/test` también incluyen el paquete nativo, por lo que requieren
el SDK en PATH. Formato C#: desde `apps/native`, `dotnet format Pope.slnx --no-restore`;
Prettier solo formatea los archivos que reconoce, no C# ni XML.

Publicación en `apps/native/dist/{agent,host}/`, ignorada por Git; nunca subir binarios.
Para comprobar la restauración reproducible desde `apps/native`:

```powershell
dotnet restore Pope.slnx --locked-mode
dotnet build Pope.slnx -c Release --no-restore -warnaserror
dotnet test Pope.slnx -c Release --no-build --no-restore
```

## Contratos y límites de la evidencia

Los tests copian los JSON actuales de `packages/shared/protocol`, no una segunda
definición de reglas. JsonSchema.Net se usa solo en tests, con formatos obligatorios y
draft 2020-12. Los 333 fixtures cubren 19 contratos v1/v2 y casos inválidos de seguridad;
otra prueba exige ambos resultados por contrato. Se recorta solo el usuario, con el
conjunto ECMAScript exportado; contraseña intacta y longitudes Unicode por puntos de
código. No se imprimen cuerpos ni errores que pudieran contener secretos.

El código de producción de T08 no contiene cálculos de saldo, tarifas ni consumo.
El esqueleto de `ServiceBase` no se registra en SCM. El contenedor WinForms no inicializa
WebView2 ni muestra UI; su navegación y puente se implementan después del prototipo.
El SDK de WebView2 añade una referencia WPF que se elimina antes de resolver assemblies
porque este host solo usa WinForms; no se silencian advertencias de compilación.

T08a comprueba build/tests/publicación en desarrollo. No demuestra consumo de RAM,
aislamiento, juego exclusivo, audio, recuperación ni compatibilidad de las PCs del local.
La [matriz oficial .NET 10](https://github.com/dotnet/core/blob/main/release-notes/10.0/supported-os.md)
incluye Windows 11 25H2 y no Windows 10 Pro 22H2. T08b debe registrar la ejecución real
en ambos Windows Pro; la VM disponible es Windows 10 Home 22H2, autorizada solo para
pruebas preliminares, con 8 GB y 2 vCPU. Ver
[mediciones de la spec](../../docs/specs/003-bloqueo-de-pc/mediciones.md).
