# Simulador autenticado de PCs

Herramienta de desarrollo, **sin efectos nativos de Windows**. Requiere compilar
`@pope/shared` y el simulador. No usa las credenciales/configuración del servicio real.
Desde T13, el nodo exige protocolo v2 y credencial incluso en desarrollo.

## Registrar una PC de simulación

1. Encargado/administrador obtiene un código con `POST /pcs/installation-codes`
   usando su sesión del panel. El código dura 600 s y se consume una sola vez.
2. Guardarlo en un archivo privado `*.installation-code.txt`, preferiblemente en `tmp/`.
   No introducirlo en argumentos ni versionarlo. Obtener el certificado del nodo
   por un medio confiable según [la guía TLS](../../docs/specs/003-bloqueo-de-pc/tls.md).
3. Ejecutar desde la raíz:

```powershell
pnpm --filter @pope/agent-sim start register --url https://NODO:3000 --number 1 --mac 02:00:00:00:00:01 --code-file tmp/pc.installation-code.txt --profile tmp/local.sim-secret.json --ca-file C:/ruta/confiable/nodo.pem
```

Repetir con otro número/código para añadir PCs al mismo perfil. Los números son índices
del simulador; el UUID/nombre vienen del nodo. El perfil exige `purpose: simulator` y
se escribe atómicamente con exclusión de otros registros. Archivos de códigos,
perfiles y sus temporales están ignorados por Git; conservarlos fuera de artefactos de
entrega y con permisos privados del desarrollador. Nunca copiarlos al Shell/WebView2.

TLS comprueba cadena/nombre/vigencia; no acepta cualquier certificado. Si se omite
`--ca-file`, usa las raíces del sistema. HTTP/WS solo está permitido para loopback
literal (`127.0.0.1`/`::1`) de desarrollo. No hay credencial fija ni modo anónimo.

Si se pierde la respuesta o falla la escritura tras consumir, no reutilizar el código.
Solicitar otro ligado a la misma PC libre: [recuperación T12](../../docs/specs/003-bloqueo-de-pc/plan.md).
No reemplazar un número existente automáticamente; preparar un perfil de recuperación
separado. Un archivo `.lock` sobrante requiere revisar que no haya otro registro activo
antes de retirarlo manualmente.

## Conectar y probar

```powershell
pnpm --filter @pope/agent-sim start run --profile tmp/local.sim-secret.json --pcs 1-5 --login --duration 60
pnpm --filter @pope/agent-sim start interactive --profile tmp/local.sim-secret.json --pcs 1-5
pnpm --filter @pope/agent-sim start load --profile tmp/local.sim-secret.json --pcs 1-40 --hold-seconds 600
```

`--login` usa los clientes de prueba `simNN`/`sim1234`; no son credenciales de PC.
La preparación `seed` recibe la contraseña del personal por `--password-file`
(`*.staff-secret.txt`, ignorado), sin secreto en argumentos. Su flujo de caja abierto
conserva la limitación ya registrada en `ESTADO.md`.

Un reinicio simulado pierde la copia local y envía recuperación `unknown`, conservando
la autoridad del nodo. `known` solo usa un contexto recibido y compatible; el contexto
no se fabrica. La coordinación de órdenes/mantenimiento queda en T28/T47.

```powershell
pnpm --filter @pope/agent-sim test
pnpm --filter @pope/agent-sim test:node
```

La segunda prueba levanta un nodo efímero con HTTPS/WSS, certificados privados efímeros
y base temporal; comprueba CLI, TLS, login, latidos, pausa, reconexión y credencial falsa.
Usa PGlite por defecto o `TEST_DATABASE_URL` para PostgreSQL real. No modifica confianza
de Windows, cuentas, servicios ni shell. La batería general de Turborepo compila el
simulador antes de las pruebas del servidor que invocan su CLI.
