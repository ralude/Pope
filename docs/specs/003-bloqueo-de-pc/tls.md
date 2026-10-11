# TLS del nodo local · T11 · ADR-0017

HTTPS y WSS usan el mismo puerto de Fastify, sin servicios adicionales ni internet.
Node acepta TLS 1.2 o superior. El certificado PEM incluye la IP fija/reserva DHCP o
el nombre que usan las PCs en su SAN; la clave PEM corresponde al certificado.
El arranque rechaza archivos ilegibles, mayores de 64 KiB, corruptos, clave distinta
y certificado fuera de vigencia antes de abrir PostgreSQL. No vuelve a HTTP por error.

## Preparación y arranque

Obtener el certificado del nodo y su clave mediante una CA local o emisión local
administrada. No se descubre ni acepta una identidad desde la conexión inicial.
Guardar los PEM fuera del repositorio; dar lectura a la cuenta del servidor y
administradores, sin acceso del cliente ni permisos generales de escritura.
No copiar la clave privada a las PCs, el panel ni el perfil de WebView2.

```powershell
$env:POPE_MODE = 'local'
$env:POPE_TLS_CERT_FILE = 'C:/Pope/private/node-cert.pem'
$env:POPE_TLS_KEY_FILE = 'C:/Pope/private/node-key.pem'
# DATABASE_URL se configura por el mecanismo privado existente.
pnpm --filter @pope/server start
```

Abrir `https://<IP-del-nodo>:3000` y comprobar `/health`. Las PCs usarán
`wss://<IP-del-nodo>:3000/pc`; el panel usa WSS desde su origen HTTPS. En el navegador
del encargado, distribuir la CA pública por administración local y verificar su
identidad antes de confiar. No resolver avisos ignorando la validación del navegador.

Para desarrollo sin TLS: `HOST=127.0.0.1` (o `::1`) y HTTP/WS solo en ese equipo.
El panel Vite y el Shell de desarrollo mantienen el proxy a loopback. No hay un
segundo listener HTTP ni redirección que acepte contraseñas en claro desde la LAN.
La nube conserva su configuración existente tras el proxy HTTPS de despliegue;
esta tarea configura el transporte directo del nodo local.

## Confianza del agente y renovación

El administrador entrega el certificado/identidad pública verificada al instalador
por un medio confiable. T14 implementa la comprobación en el simulador;
T16 la implementará en el agente. Registro T12 y admisión autenticada T13 ya están activos.
La validación exige vigencia, SAN coincidente e identidad fijada; nunca
`rejectUnauthorized=false`, aceptación universal ni confianza al primer uso.

Antes de caducar, generar el siguiente par certificado/clave y comprobar SAN,
vigencia y correspondencia. Verificar su identidad por el mismo medio confiable,
preparar la confianza nueva en las PCs mediante administración local y conservar
el par anterior protegido para recuperación. Detener el nodo, sustituir ambos PEM
y arrancar; verificar HTTPS/WSS con la identidad nueva. Retirar la confianza anterior
cuando todas las PCs estén verificadas. Si falla, recuperar el par anterior solo
si sigue vigente y confiable. Nunca relajar TLS para restaurar conectividad.
No hay recarga automática ni renovación que dependa de internet. Una PC sin la nueva
confianza permanece bloqueada; un fallo TLS no es revocación ni decide el cobro.

## Prueba reproducible

`pnpm --filter @pope/server exec vitest run src/transport.test.ts`: certificados
y claves efímeros en el directorio temporal, borrados al terminar. Necesita OpenSSL
con `x509 -not_before/-not_after` (Git for Windows actual lo incluye), en PATH o
`OPENSSL_PATH`; el helper también detecta su instalación habitual en Windows.
No instala certificados en Windows ni contacta una CA/internet.

Se comprueban HTTPS/WSS reales, certificado ajeno/nombre incorrecto, TLS anterior
a 1.2 rechazado, arranque con certificado caducado/clave distinta/PEM inválido,
restricción HTTP a loopback, cookies Secure y ausencia de credenciales en logs.

APIs usadas: [TLS de Fastify](https://fastify.dev/docs/latest/Reference/Server/#https),
[X509Certificate de Node](https://nodejs.org/docs/latest-v24.x/api/crypto.html#class-x509certificate).
