# Tareas 003: Arranque y bloqueo de la PC cliente

- **Estado:** Continuación T28–T42 autorizada (mantenedor, 2026-10-21), con sus verificaciones funcionales; T22 aplazada, T34 pendiente de aprobar su diseño y T37 hasta demostrar T10. T10 y SCM de T15 abiertas. ADR-0018 aceptado. T43–T59 en Borrador.
- **Plan:** [plan.md](plan.md), autorizado hasta T42 con esas salvedades; decisiones técnicas ajenas al bloque y verificaciones previas pendientes.

Reglas: una tarea = un commit. Marca `[x]` en el mismo commit que la implementa y
actualiza `ESTADO.md`. Cada commit pasa las comprobaciones pertinentes; al cerrar una
tarea principal, pasar la batería completa según `AGENTS.md`. El cuerpo y los tests
citan los REQ. Si excede unas 400 líneas, dividir antes de ejecutar.

**Autorización inicial:** implementar T01–T07, una tarea por commit; ADR-0017 aceptado, canal v2 y
recuperación de registro confirmados. T08–T59 requieren cerrar sus decisiones y aprobación
antes de implementar; ADR-0018 sigue Propuesto. No se modifica Windows en este bloque.
**Decisión posterior (2026-10-07):** tras dejar T07 pendiente de revisar el contrato,
el mantenedor confirma la opción A: conservar el recorte exterior del usuario y exportar
sus reglas exactas para C#, con fixtures compartidos y sin modificar contraseñas.
El bloqueo de contrato de T07 queda resuelto; el progreso se registra en sus subtareas.

**Autorización posterior (mantenedor, 2026-10-07):** continuar autónomamente desde T08
hasta T20. Sustituye el límite de implementación T01–T07, conservando una tarea por
commit, decisiones aceptadas y gates de verificación. ADR-0018 conserva su estado
Propuesto y no se da por validado el mecanismo. La VM está disponible: «22h2 pope»,
8192 MB y 2 vCPU, pero informa Windows 10 Home 22H2. El mantenedor autoriza Home solo
para pruebas preliminares; se mantiene la validación obligatoria del inventario Pro.

**Dependencias:** ejecutar en orden, una tarea a la vez. T09/T10 deben demostrar el
mecanismo nativo antes de integrarlo; si fallan, revisar ADR/plan y detener las tareas
dependientes. Windows/edición y ausencia de congelador confirmados (2026-10-07);
verificar compatibilidad y persistencia antes de T48–T54;
registrar juegos/monitores/audio antes de T09/T21/T24/T25 y NIC/Wake-on-LAN antes de T58.

**Cambio de orden (mantenedor, 2026-10-09):** «deja t10 para luego y ve con las
siguientes tareas». T10 se aplaza abierta; continuar T11–T20, una tarea por commit.
Sustituye el bloqueo anterior de avance a T11. No valida el mantenimiento ni autoriza
integrar su mecanismo pendiente: T37 y las verificaciones de T10 se conservan.

La **fase 2 de la spec 002** se implementa aquí en T23–T25 y se verifica en T56; incluye
regresiones de T17/T22/T27/T55. Sus 19 tareas de fase 1 permanecen aprobadas y completas.
La lista no implementa el catálogo ni restauración de perfiles de la spec 004.

**Entorno vigente (mantenedor, 2026-10-11):** continuar T12–T20 en esta máquina,
sin usar la VM. T10 permanece abierta hasta realizar ese bloque; conserva su gate
funcional y no se integra el mantenimiento pendiente. Las pruebas que requieran
alterar el Windows cotidiano quedan pendientes, sin declararlas realizadas.

## Tareas

### Contratos y datos

- [x] **T01: Contratos de registro y autenticación de PCs**
  - **Cubre:** REQ-003-10, REQ-003-11, REQ-003-22, REQ-003-63.
  - **Hacer:** añadir esquemas zod en `packages/shared` para códigos, registro, credencial, MAC y errores; fijar versión y transición desde el canal provisional según el plan aprobado.
  - **Verificar:** datos válidos/inválidos, caducidad expresada en UTC, rechazo de campos secretos en respuestas ordinarias y compatibilidad de mensajes existentes.
  - **Commit:** `feat(shared): define el registro autenticado de PCs`.
  - **Implementada (2026-10-04):** `pc-registration.ts`: objetos estrictos, base64url canónico, código 128 bits/600 s, credencial 256 bits/Bearer, MAC de entrada y normalización explícita, recuperación con `pcId` y errores sin secretos. `NATIVE_PC_PROTOCOL_VERSION = 2` no cambia todavía v1. Diez tests nuevos; 280 de shared en verde. Registro real/roles/caducidad efectiva quedan en T12/T13.

- [x] **T02: Contratos de órdenes y mantenimiento**
  - **Cubre:** REQ-003-20, REQ-003-21, REQ-003-40, REQ-003-41, REQ-003-43, REQ-003-44, REQ-003-45.
  - **Hacer:** definir solicitudes, actor, IDs, estados, acuses, errores, mantenimiento y salida offline en `shared`; separar estado de sesión, orden solicitada y efecto confirmado.
  - **Verificar:** validación de cada variante, duplicados, ausencia de comandos/rutas libres y distinción entre aceptar reinicio y demostrar que se completó.
  - **Commit:** `feat(shared): define órdenes y mantenimiento de PCs`.
  - **División previa:** tres subtareas para no exceder 400 líneas por commit; T02 se marca únicamente cuando estén completas:

- [x] **T02a: Contratos de mantenimiento y auditoría**
  - **Cubre:** REQ-003-40, REQ-003-41, REQ-003-43, REQ-003-44, REQ-003-45.
  - **Hacer:** login técnico, mantenimiento confirmado, salida offline sin actor impuesto, reconocimiento y eventos estrictos; constantes de bloqueo por cuenta.
  - **Verificar:** entradas válidas/inválidas, secretos solo en login, duración entera, ID estable de salida y actor del personal en auditoría.
  - **Commit:** `feat(shared): define el mantenimiento y su auditoría`.
  - **Implementada (2026-10-04):** login, estado confirmado, salida local sin actor impuesto y reconocimiento por ID; eventos de entrada/salida/bloqueo técnico en el validador de auditoría existente. El mecanismo Windows y la conciliación siguen en sus tareas futuras.

- [x] **T02b: Contratos de órdenes y acuses**
  - **Cubre:** REQ-003-20, REQ-003-21, REQ-003-43.
  - **Hacer:** solicitudes tipadas, contexto esperado, vigencia, estados y efectos; mensajes según presentación y alcance confirmados.
  - **Verificar:** comandos sin rutas libres, confirmación previa, idempotencia y distinción entre reinicio aceptado y efecto comprobado.
  - **Commit:** `feat(shared): define las órdenes y sus acuses`.
  - **Implementada (2026-10-04):** seis acciones nativas cerradas, solicitudes sin actor impuesto, confirmación con ocupación, contexto/revisión y 30 s de vigencia; acuses sin resultado «aplicado» para reinicio/apagado. Journal y coordinación efectiva quedan en T28/T30.

- [x] **T02c: Canal v2 de control**
  - **Cubre:** REQ-003-20, REQ-003-21, REQ-003-40, REQ-003-44, REQ-003-63.
  - **Hacer:** integrar mensajes nuevos y conservar campos de sesión/pausa; hello v2 autenticado sin secretos y estado de control independiente.
  - **Verificar:** ambas direcciones, rechazo de variantes desconocidas y v1 operativo hasta T13.
  - **Commit:** `feat(shared): prepara el canal v2 de control`.
  - **Implementada (2026-10-04):** esquemas estrictos v2 y frontera React separada, control UTC/contexto, estado de mantenimiento y reconocimiento de salida. V1 y los consumidores actuales siguen operativos hasta T13/T14; C# y la conciliación siguen pendientes.

- [x] **T03: Contratos del fondo global**
  - **Cubre:** REQ-003-70, REQ-003-71, REQ-003-72, REQ-003-73, REQ-003-74, REQ-003-75, REQ-003-76.
  - **Hacer:** definir metadatos, fondo por defecto, mensaje de cambio, respuestas HTTP, SHA-256, tamaños y progreso; fijar en el plan aprobado las unidades exactas de los límites.
  - **Verificar:** hash/tamaño/dimensiones inválidos, eliminación y reconexión; no incluir bytes de imagen en eventos ni en WebSocket.
  - **Commit:** `feat(shared): define el fondo global de bloqueo`.
  - **Implementada (2026-10-04):** metadatos y snapshot global, revisión/actor, aviso v2 sin bytes, progreso solo local y evento estricto. Límites decimales y máximo original de 40 millones de píxeles confirmados; validación/decodificación del archivo y distribución quedan en T43–T46.

- [x] **T04: Migración de registro y credenciales**
  - **Cubre:** REQ-003-10, REQ-003-11, REQ-003-22, REQ-003-63.
  - **Hacer:** extender `pcs` y crear códigos/credenciales en `apps/server` con hashes, consumo, revocación e índices; generar una migración nueva con Drizzle.
  - **Verificar:** migración sobre base existente, unicidad y consumo concurrente con PGlite y PostgreSQL real; ninguna credencial de respaldo pública para PCs antiguas.
  - **Commit:** `feat(server): guarda el registro seguro de PCs`.
  - **Implementada (2026-10-04):** migración 0025: MAC nullable para PCs existentes, códigos con hash/600 s/consumo y credenciales con revocación. FK código/PC y unicidad de credencial vigente; seis tests de upgrade, restricciones y consumo concurrente pasan en PGlite y PostgreSQL. No activa todavía registro ni autenticación del canal.
  - **Verificación cerrada (2026-10-05):** 896 tests del monorepo, 378 del servidor en ambos motores; formato, lint, tipos y build pasan. Paralelismo del ejecutor reducido, sin modificar los tests existentes.

- [x] **T05: Migración de control y mantenimiento**
  - **Cubre:** REQ-003-20, REQ-003-41, REQ-003-43, REQ-003-44, REQ-003-45.
  - **Hacer:** crear datos de órdenes, reserva de PC, mantenimiento e intentos técnicos según el plan; índices de idempotencia y una entrada abierta por PC.
  - **Verificar:** restricciones, fechas UTC, duraciones enteras y concurrencia en ambos motores; conservar tablas de sesiones y cookies existentes.
  - **Commit:** `feat(server): guarda el control y mantenimiento de PCs`.
  - **División previa (2026-10-05):** T05a (órdenes y reserva) y T05b (mantenimiento e intentos técnicos), cada una con migración y pruebas en ambos motores. T05 se marca al completar ambas.

- [x] **T05a: Persistencia de órdenes y reserva de PC**
  - **Cubre:** REQ-003-20, REQ-003-43.
  - **Hacer:** guardar solicitud, orden, contexto, actor y resultado; reserva ligada a una orden de la misma PC, sin activar coordinación ni liberar por caducidad.
  - **Verificar:** upgrade, IDs únicos, vigencia de 30 s y reserva concurrente; preservar sesiones/cookies.
  - **Commit:** `feat(server): guarda las órdenes y reservas de PCs`.
  - **Implementada (2026-10-07):** migración 0026 con órdenes idempotentes, acuses tipados y reserva ligada a una orden de la misma PC. Cuatro pruebas de upgrade, restricciones y concurrencia; la caducidad no libera la reserva. La coordinación y los eventos quedan en T28.

- [x] **T05b: Persistencia de mantenimiento e intentos técnicos**
  - **Cubre:** REQ-003-41, REQ-003-43, REQ-003-44, REQ-003-45.
  - **Hacer:** entrada confirmada, salida idempotente y contador/bloqueo por cuenta independiente del panel.
  - **Verificar:** una entrada abierta por PC, salida única, segundos enteros y bloqueo de 60 s tras diez fallos en ambos motores.
  - **Commit:** `feat(server): guarda el mantenimiento y los intentos técnicos`.
  - **Implementada (2026-10-07):** migración 0027: una entrada confirmada abierta por PC, salida completa con ID único y segundos monotónicos; intentos por cuenta independientes de las cookies, diez fallos y bloqueo de 60 s. Cinco pruebas de upgrade, restricciones y concurrencia pasan en ambos motores; 905 tests del monorepo (387 del servidor en PostgreSQL), formato, lint, tipos y build pasan. Login efectivo/eventos/reset y conciliación offline quedan en T35–T40.

- [x] **T06: Migración de metadatos del fondo**
  - **Cubre:** REQ-003-70, REQ-003-71.
  - **Hacer:** añadir los metadatos del único fondo global y su revisión, sin guardar la imagen en PostgreSQL; generar migración nueva, sin implementar todavía los endpoints.
  - **Verificar:** estado inicial por defecto, restricciones de metadatos y migración sobre base existente en ambos motores.
  - **Commit:** `feat(server): guarda los metadatos del fondo global`.
  - **Implementada (2026-10-07):** migración 0028: una fila global, revisión cero/fondo por defecto inicialmente; SHA-256, bytes, WebP y dimensiones completos con límites de shared. Retirar conserva revisión positiva, fecha UTC y actor. Cuatro pruebas de upgrade, límites, retirada y reaplicación pasan en ambos motores; 909 tests del monorepo (391 del servidor en PostgreSQL), formato, lint, tipos y build pasan. Archivo, permisos, evento y endpoints quedan en T43.

- [x] **T07: Exportación del protocolo para C#**
  - **Cubre:** REQ-003-63; ADR-0002.
  - **Hacer:** exportar JSON Schema y fixtures válidos/inválidos desde los esquemas zod, incluyendo mensajes existentes y nuevos; versionar los artefactos de compatibilidad.
  - **Verificar:** los fixtures pasan/fallan donde corresponde, exportación reproducible y detección de cambios incompatibles sin duplicar reglas de negocio.
  - **Commit:** `build(shared): exporta el protocolo para el cliente Windows`.
  - **Contrato confirmado (mantenedor, 2026-10-07):** opción A: conservar `trim` del usuario antes de validar, exportar los caracteres exactos de recorte e instrucciones para C# y verificar coincidencia con fixtures compartidos. Nunca recortar la contraseña. Implementado en T07a/b.
  - **División de implementación (2026-10-07):** exportación/normalización (T07a) y fixtures (T07b, subdividida abajo), dentro del bloque autorizado.
  - [x] **T07a:** exportación reproducible/versionada de v1, v2 y puente; reglas de normalización y comprobación del contrato con JSON Schema. Implementados 19 contratos, guard de diferencias en build/tests y conjunto exacto de 25 caracteres de recorte; sin modificar el login ni contraseñas. T07b pendiente.
  - [x] **T07b:** fixtures compartidos válidos/inválidos, casos Unicode y fronteras de confianza. 333 casos exportados; resultados explícitos coinciden entre Zod y Ajv. La comprobación en C# corresponde a T08.
    - **División antes de verificar/entregar (2026-10-07):** T07b1 cubre los 19 contratos y fronteras de confianza; T07b2 añade la matriz Unicode/contraseña. Se separan para mantener commits de unas 400 líneas no generadas.
    - [x] **T07b1:** casos compartidos de los 19 contratos, con resultados esperados explícitos y comprobación Zod/JSON Schema. Incluye órdenes separadas de React, salida durable solo del agente, secretos, recuperación, pausa y fondos; matriz Unicode/límites adicionales en T07b2.
    - [x] **T07b2:** casos Unicode de usuario y contraseña, límites y diferencias entre v1/v2; cierre de T07. Incluye los 25 caracteres de recorte, Unicode conservado, espacios interiores, 64/65 caracteres de usuario, 256/257 de contraseña, enteros seguros, UUIDv7 y UTC. Grupo 7/59; T08 sigue en Borrador.

### Base nativa y conexión

- [x] **T08: Solución y pruebas nativas**
  - **Cubre:** REQ-003-02, REQ-003-60, REQ-003-62, REQ-003-63.
  - **Hacer:** crear `apps/native` con servicio, host y tests; fijar SDK/framework y dependencias justificadas tras comprobar Windows; consumir fixtures T07 y documentar comandos.
  - **Verificar:** build/test/publicación `win-x64`, contratos JSON en C# y ausencia de lógica de saldo o cobro; compilar en desarrollo, no en el nodo.
  - **Commit:** `build(native): prepara el servicio y host de Windows`.
  - **Inventario confirmado (mantenedor, 2026-10-07):** 12 PCs Windows 10 Pro 22H2 y una Windows 11 Pro 25H2, sin congelador. Sustituye la postergación anterior (opción B); fijar herramientas y probar compatibilidad para esas versiones. La continuación T08–T20 está autorizada; la compatibilidad sigue pendiente.
  - **Host confirmado (mantenedor, 2026-10-07):** opción A, WinForms + WebView2 con interfaz React, según ADR-0019. No equivale a haber superado la compatibilidad ni el prototipo T09.
  - **División antes de entregar (2026-10-07):** separar preparación en desarrollo y verificación del inventario; T08 se marca solo cuando ambas estén completas.
  - [x] **T08a:** solución Agent/ShellHost/tests, SDK/dependencias fijadas y justificadas, scripts del workspace, fixtures T07, build/test y publicación autocontenida `win-x64` en desarrollo. Sin instalar servicios ni modificar Windows. **Implementada (2026-10-07):** SDK 10.0.401/runtime 10.0.12, host WinForms + WebView2, locks de NuGet y scripts integrados; 334 tests C# pasan, build sin avisos y arranque de ambos artefactos comprobado en Windows 10.0.26300.0. 1 581 tests del workspace y controles obligatorios en verde. Compatibilidad real del inventario en T08b; grupo sigue 7/59.
  - [x] **T08b:** artefactos y contratos ejecutados en la VM Home y aceptados por el mantenedor (2026-10-08) para cerrar T08 y continuar T09. Esta decisión sustituye el gate original de pruebas en Windows 10 Pro 22H2 y Windows 11 Pro 25H2 antes de T09. Se conserva la comprobación Pro antes de entregar al local, sin declarar cumplido REQ-003-62 para ese inventario.
    - **Verificación preliminar (2026-10-08):** Guest Control recuperado; misma VM Home 22H2 x64 (19045.2965), 8192 MB y ahora 4 vCPU. Agent/ShellHost autocontenidos `--check-build` devuelven 0 sin SDK en PATH; 334 tests C# correctos, cero fallos/omitidos, con SDK portable 10.0.401/runtime 10.0.12. Informes JSON/TRX recogidos en `tmp/`; detalle en `mediciones.md`. No cierra T08b ni habilita T09–T20: faltan ambas versiones Pro.
    - **Aprobación posterior (2026-10-08):** «toma estas pruebas hechas con win 10 home como validas y seguimos con T09». Los resultados anteriores pasan a ser evidencia aceptada para T08b; T08 completa, grupo 8/59. T09 conserva sus verificaciones de escritorio, ACL, WebView2 y juego exclusivo.

- [x] **T09: Prototipo de escritorio separado y WebView2**
  - **Cubre:** REQ-003-30, REQ-003-33; REQ-002-04, REQ-002-05; CA-002-02.
  - **Hacer:** probar en VM/PC aislada creación, ACL y cambio de escritorio con host estándar y WebView2; documentar cada P/Invoke y el reparto de hilos/procesos.
  - **Verificar:** juego exclusivo sin entrada durante bloqueo, vuelta al escritorio de uso, apps intactas y ninguna ventana WebView2 trasladada después de crearla; registrar evidencia.
  - **Commit:** `test(native): valida el escritorio separado con WebView2`.
  - **Acceso confirmado (2026-10-07, ADR-0023):** probar Pope seleccionable por Alt+Tab en el escritorio de uso sin Explorer, sin mover WebView2 ya creado. Atajo habilitado con sesión no permite llegar al juego desde pausa/revocación.
  - **División previa (2026-10-08):** herramienta de prueba separada del host de producto, usando el SDK ya justificado; sin cambios permanentes de Windows. Mantener commits revisables y marcar T09 solo tras sus verificaciones.
    - [x] **T09a:** APIs Win32 comentadas y ventanas del prototipo, una instancia nueva por escritorio; publicación autocontenida y comprobaciones de compilación. **Implementada (2026-10-08):** `Pope.DesktopProbe` separado del producto, SDK WebView2 existente y DACL explícita del usuario/SYSTEM; token elevado rechazado. Build sin avisos, publicación autocontenida y `--check-build` correctos. La coordinación y prueba efectiva de Windows corresponden a T09b; T09 permanece abierta.
    - [x] **T09b:** coordinación con retorno acotado, comprobaciones de ACL/entrada/Alt+Tab/continuidad y ejecución registrada en VM. **Verificada (2026-10-08):** Home 22H2, WebView2 154.0.4258.62; dos ejecuciones correctas, última `run-20261008-145830`, salida 0. DACL usuario/SYSTEM, ausencia de Explorer, teclas/clics aislados, latidos y PID conservados; Alt+Tab ida/vuelta y escritorio original restaurado. Detalle en `mediciones.md`; juego exclusivo pendiente en T09c.
    - [x] **T09c:** juego en pantalla completa exclusiva, retorno con juego intacto y evidencia del modo gráfico. **Verificada en VM y aceptada (mantenedor, 2026-10-08):** Freedoom 0.13.0 + Chocolate Doom 3.1.1, modo SDL exclusivo 800×600 frente a 1920×955 inicial; Alt+Tab ida/vuelta sin Explorer, PID/partida conservados y 196 tics de demo sin movimiento/disparos durante bloqueo. Controles positivos antes/después; salida 0 y escritorio original restaurado. El mantenedor acepta la VM para cerrar el prototipo T09 y avanzar; juegos reales/anticheat siguen obligatorios en T25/T56 antes de entrega, sin declarar esa compatibilidad. Detalle en `mediciones.md`.

- [ ] **T10: Prototipo de mantenimiento elevado**
  - **Cubre:** REQ-003-40, REQ-003-43; ADR-0018 (identidad/custodia), ADR-0029 (alcance).
  - **Hacer:** demostrar sesión Windows propia de la administradora existente, Explorer normal con UAC, herramientas elevadas, perfil y cierre exclusivo; ensayar permisos y límites del servicio en sesión 0 sin elevar WebView2.
  - **Verificar:** Windows completo administrativo con UAC, usuario cliente sigue limitado, salida conserva datos previos y fallo de credenciales vuelve a bloqueo; documentar y aprobar el mecanismo antes de construirlo/integrarlo.
  - **Commit:** `test(native): valida el mantenimiento con cuenta Windows existente`.
  - **Preparación (2026-10-08):** ADR-0018 concreta una ruta candidata: DPAPI de máquina + ACL SYSTEM, broker de prueba, token/logon/perfil, escritorio propio y cierre por Job Object. VM: solo `vboxuser` habilitada, administradora con UAC activo; su token medio no demuestra cuenta cliente estándar. Sin código ni cambios de cuentas/servicios. T10 sigue abierta: revisar/aprobar el ADR Propuesto antes de construir; después demostrar la ruta, sin inferir elevación/aislamiento desde el grupo Administradores.
  - **Aprobación explícita (mantenedor, 2026-10-08):** «apruebo y sigue con T10». ADR-0018 Aceptado; autoriza el prototipo con operaciones fijas, sin cambios de cuentas/grupos/UAC. Dividir antes de ejecutar para commits revisables; T10 solo se cierra con evidencia efectiva:
    - [x] **T10a:** infraestructura de custodia DPAPI, propietario/ACL SYSTEM, importación/reemplazo y entrada privada local. **Preparada (2026-10-08):** código aislado del prototipo; comprobación con fixture pública Unicode, blob corrupto y rechazo de custodia fuera de SYSTEM pasa en desarrollo. Configuración exige elevación antes de abrir el prompt. La ACL y el reemplazo efectivos se demostrarán en VM en T10d; no se afirma custodia instalada.
    - [x] **T10b:** infraestructura del broker de prueba SYSTEM en sesión 0, token/logon y traslado a consola con operaciones fijas; prueba efectiva en T10d, sin ejecutor general.
      - [x] **T10b1:** primitivas de token, logon/elevación y evidencia de identidad/integridad/sesión. **Preparada (2026-10-08):** lectura del token real en desarrollo: SID/logon, UAC limitado, integridad media 8192 y sesión 1; coincidencia con WindowsIdentity y comprobación independiente de elevación. La obtención del token administrativo/cliente desde SYSTEM queda para VM.
      - [x] **T10b2:** servicio fijo y ayudante sin GUI en consola; arranque y finalización acotados. **Preparada (2026-10-08):** ServiceBase reutilizado de T08, GUID por ejecución, token SYSTEM duplicado para consola sin herencia entre sesiones; procesos suspendidos asignados a Job Object antes de reanudar. Build/locks/checks en verde; ejecución SCM, token administrativo y recuperación pendientes de T10d.
    - [x] **T10c:** infraestructura de perfil, escritorio por SID de logon y Job Object; pruebas efectivas de herramientas/Explorer, aislamiento y cierre exclusivo pendientes de T10d.
      - [x] **T10c1:** carga/entorno del perfil y permisos de escritorio/estación por SID de logon. **Preparada (2026-10-08):** carga y descarga solo de la referencia propia, entorno del token; DACL de escritorio SYSTEM/logon y ACE acotada en estación (sin crear escritorios ni cerrar Windows), retirada releyendo la ACL para preservar ACE ajenas. Compilación/checks en verde; comportamiento real pendiente en T10d.
      - [x] **T10c2:** ventanas administrativas y observaciones desde el token cliente limitado. **Preparada (2026-10-08):** ventana/hijo sin WebView2 exige usuario elevado no SYSTEM y registra token, perfil/escritorio; proceso cliente prueba rechazo de leer/cambiar escritorio, leer blob y duplicar token administrativo. Herencia de escritorio WebView2 restringida al lanzamiento de ese rol en la misma sesión. Build/checks en verde; pruebas efectivas pendientes de VM.
      - [x] **T10c3:** coordinación de transiciones y Explorer/job. **Preparada (2026-10-08):** token/perfil/escritorio de padre/hijo, rechazo de cuenta ficticia sin intentos sobre cuenta real, continuidad WebView2, cierre exclusivo y datos/procesos previos conservados. Explorer debe conservar token/logon y pertenecer al escritorio/job; delegación o salida invalida la ruta. Retorno a bloqueo externo preparado por el runner T10d, sin afirmar ejecución VM ni recuperación probada.
    - [ ] **T10d:** prueba en VM de credenciales inválidas, WebView2 limitado, salida, fallo/recuperación y datos/procesos previos intactos; registrar límites y revisar ADR/plan si la ruta falla.
      - [x] **T10d1:** runner, instalación/retirada por GUID y retorno externo; publicar y comprobar artefacto sin elevación.
        - [x] **T10d1a:** instalación/retirada fija, comprobaciones de reemplazo/ACL y bootstrap sin secretos en argumentos. **Preparada (2026-10-08):** servicio/árbol temporal por GUID, binarios protegidos contra escritura del cliente; entrada privada y exportación solo de informes. SYSTEM comprueba propietario/DACL, reemplazo corrupto conserva blob y reemplazo válido funciona; limpieza fija de custodia/servicio/archivos propios. Build/checks en verde; comportamiento efectivo pendiente en VM.
        - [x] **T10d1b:** runner externo, infraestructura de fallo del broker y publicación/verificación no elevada en VM. **Preparada y comprobada parcialmente (2026-10-08):** hashes ZIP/DLL coinciden; arranque, DPAPI/Unicode/corrupción y token cliente pasan en Home sin SDK. Supervisor limitado fuera del job, servicio temporal por GUID y limpieza de ACE tras fallo preparados; prueba de muerte del broker no ejecutada porque Explorer falla primero en T10d2. Un intento de contraseña ficticia tras login correcto; política VM consultada: umbral 10. Sin cambios de cuentas/grupos/UAC.
      - [ ] **T10d2:** entrada privada/UAC local y ejecución efectiva en VM, evidencia y conclusión del mecanismo.
        - **Ejecución parcial (2026-10-08, 16:17:56 UTC):** usuario completa UAC/entrada privada; token administrativo completo (tipo 2, integridad 12288), cliente limitado (8192), logons distintos en sesión 1 y broker sesión 0. Custodia/propietario/ACL SYSTEM y reemplazo pasan; cuenta y contraseña inválidas devuelven 1326. Cliente no lee/cambia escritorio, lee blob ni duplica token; perfil/ventana/hijo y cierre por job pasan, WebView2 conserva continuidad. **Gate fallido:** Explorer lanzado termina antes de comprobar token/ventanas/job; Windows completo administrativo no demostrado, causa no establecida. No ejecutar fase de muerte del broker ni avanzar T11. Retorno original y retiro de credencial/servicio/árbol/procesos propios comprobados; Explorer previo vivo, fixture de datos conservada. Revisar ADR/plan; T10 permanece abierta, 9/59. Detalle en `mediciones.md`.
        - **Dirección elegida (mantenedor, 2026-10-08):** revisar una sesión Windows independiente; preparar propuesta antes de construirla. Completar ahora solo el pipeline pendiente de T10 según la validación por tarea aprobada en `AGENTS.md`. La batería automática no cierra T10d2 ni autoriza avanzar T11.
        - **Pipeline completado (2026-10-08):** formato, lint, tipos y compilación completos pasan; 1 581 tests correctos (1 247 TS + 334 nativos, sin omitidos nativos). En desarrollo Windows 11 26H2/26300.9457 pasan fixture DPAPI y lectura del token limitado, sin cambios del sistema. Caché reutilizada y una compilación nativa para build/tipos; no repetir publicación/VM sin cambio del mecanismo. T10d2 sigue abierta por el gate funcional. Detalle en `mediciones.md`.
        - [x] **T10d2r · revisión documental de sesión independiente (2026-10-08):** preparar [ADR-0029 Propuesto](../../adr/0029-sesion-windows-de-mantenimiento-con-uac.md), con fuentes Windows, alcance UAC, entrada/retorno candidatos y pruebas por etapas. Pregunta de elevación en spec pendiente de respuesta; ADR-0018 vigente, ninguna ruta nueva implementada, T10d2/T10 abiertas. Cambio solo documental: revisar diff/enlaces, sin repetir tests.
        - [x] **T10d2u · alcance confirmado (2026-10-08):** mantenedor elige Windows normal con UAC. ADR-0029 aceptado solo para alcance; Explorer limitado bajo la administradora existente y herramientas elevadas mediante UAC. Conserva identidad/custodia de ADR-0018 y entrada sin teclear credenciales Windows. Mecanismo y preparación de VM aún pendientes; sin nueva ruta implementada, T10 abierta. Cambio documental, diff/enlaces revisados.
        - [x] **T10d2v · preparación documental de viabilidad (2026-10-08):** [ensayo mínimo](ensayo-sesion-windows.md) Propuesto: exige snapshot confirmado, cuenta cliente estándar temporal con entrada privada, cambio manual de usuario, comprobaciones de sesión/Explorer/UAC/continuidad y retirada por identidad. Añade restricciones COM/AOT y retorno candidato para la investigación posterior. Sin ejecutar cambios de VM ni construir otro mecanismo; T10 sigue abierta.
        - [ ] **T10d2s · ensayo de escritorio en sesión propia:** requiere aprobación explícita del ensayo mínimo y recuperar lecturas Guest Control; preparar VM, observar y documentar resultados. Un cambio manual de usuario no cumple entrada remota, retorno autónomo ni recuperación; no cierra T10 ni habilita T11.
          - [x] **T10d2s1 · autorización (mantenedor, 2026-10-08):** «confirmo» aprueba el ensayo mínimo, snapshot y cuenta estándar temporal con retirada. No volver a pedir esa aprobación. Recuperación de Guest Control/Windows pendiente antes de preparar la cuenta; T10d2s sigue sin ejecutarse.
          - [x] **T10d2s2 · preparación del asistente (2026-10-09):** Windows sin respuesta confirmado; reinicio forzado autorizado y ejecutado, lecturas recuperadas y snapshot operativo 0535d231 comprobado. [Preparador](../../../apps/native/probes/prepare-own-session.ps1) listo con guard VM/UUID y entrada privada SecureString; sintaxis y rechazo del host comprobados. No crea cuentas al prepararse; ejecución privada y observación pendientes, T10 sigue abierta.
          - [ ] **T10d2s3 · observación y retirada:** crear la cuenta con el asistente autorizado, observar cliente/sesión propia/Explorer/herramienta UAC, regreso manual y continuidad; conservar evidencia y retirar solo fixture identificada. No cerrar T10 por este ensayo inicial.
            - [x] **T10d2s3a · instrumentos (2026-10-09):** cuenta temporal privada creada/verificada. Observador CLI `--session-window` registra token, perfil, PID/inicio, Explorer estable, consola, archivo ficticio y cliente desde herramienta alta; UAC humano y duración máxima 15 min. Consulta de proceso con permisos mínimos verificada en host; build/formato y 334 tests pasan. Publicador VM/UUID con ZIP/hash y accesos propios listo, sin entrada/retorno automático. Ejecución manual y retirada aún pendientes.

- [x] **T11: Transporte cifrado del nodo**
  - **Cubre:** REQ-003-63; ADR-0017.
  - **Hacer:** configurar HTTPS/WSS y certificados en `apps/server` según ADR aceptado, con guía de confianza y rotación; mantener operación por LAN sin internet.
  - **Verificar:** conexión válida, certificado ajeno/caducado rechazado, contraseñas ausentes de logs y funcionamiento local sin nube.
  - **Commit:** `feat(server): cifra la conexión del cliente Windows`.
  - **División previa a entrega (2026-10-09):** T11a implementa configuración/TLS y sus pruebas; T11b documenta confianza/rotación y registra la batería completa, para mantener commits revisables. T11 se marca solo al cerrar ambas.
  - [x] **T11a:** PEM acotados/validados antes de abrir PostgreSQL, HTTPS/WSS en el mismo puerto, TLS ≥ 1.2, HTTP local solo loopback y cookies Secure con TLS. Pruebas reales con certificados efímeros (identidad ajena/nombre, caducidad, clave distinta y ausencia de secretos); tipos y build correctos. Cierre de batería/guía en T11b.
  - [x] **T11b (2026-10-09):** [guía TLS](tls.md), comandos HTTP loopback/HTTPS LAN y procedimiento de confianza/renovación. Formato, lint, tipos, tests y build completos pasan: 1 588 tests (398 servidor + 334 nativos), HTTPS/WSS reales comprobados; sin secretos versionados, cambios de Windows ni dependencias nuevas. T11 completa; T12 siguiente, T10 aplazada.

- [x] **T12: Emisión y consumo de códigos de instalación**
  - **Cubre:** REQ-003-10, REQ-003-11; CA-003-11.
  - **Hacer:** implementar endpoints de registro: encargado/administrador generan, un uso, 600 s; crear PC/nombre/credencial y evento atómicamente; definir recuperación si se pierde la respuesta.
  - **Verificar:** dueño rechazado, caducidad exacta, doble consumo concurrente y respuesta perdida sin duplicar PC ni reutilizar código consumido.
  - **Commit:** `feat(server): registra PCs con códigos de instalación`.
  - **División previa (2026-10-09):** T12a contratos de auditoría sin secretos; T12b endpoints/transacciones y prueba inicial; T12c recuperación/caducidad/concurrencia en ambos motores y cierre de batería. T12 se marca tras completar las tres.
  - [x] **T12a (2026-10-11):** eventos estrictos de emisión y consumo de instalación, actor del personal en emisión/sistema en consumo y vínculo mediante ID del código. Rechazo de secretos y actores incorrectos verificado; endpoints y consumo efectivo quedan en T12b/c.
  - [x] **T12b (2026-10-11):** endpoints con roles, RNG/hash, asignación de PC/nombre y consumo atómico con evento; respuestas no-store. Tres pruebas HTTP, formato, lint, tipos y build correctos; recuperación/concurrencia y cierre de batería en T12c.
  - [x] **T12c (2026-10-11):** recuperación solo libre, límites temporales, concurrencia, respuesta perdida y rollback comprobados en PGlite/PostgreSQL real; once tests nuevos. Formato, lint, tipos, tests y build completos correctos (409 servidor, 334 nativos). Evidencia en `mediciones.md`; T12 completa, T13 siguiente, T10 abierta y sin VM.

- [x] **T13: Autenticación del WebSocket de PCs**
  - **Cubre:** REQ-003-11, REQ-003-63.
  - **Hacer:** autenticar antes del upgrade `/pc`, derivar identidad de la credencial y verificar `hello`; adaptar gateway/tests manteniendo límites de mensajes y conexión.
  - **Verificar:** agente desconocido, credencial revocada, `pcId` ajeno, mensajes malformados y conexión duplicada; sin acceso anónimo de producción.
  - **Commit:** `feat(server): autentica el canal de PCs`.
  - **División previa (2026-10-11):** T13a valida hashes e identidad sin activar el canal; T13b activa admisión v2 y adapta fixtures; T13c amplía ataques/límites y cierra batería. No se conserva una excepción anónima de producción.
  - [x] **T13a (2026-10-11):** autenticación por cabecera y revalidación contra PC/credencial vigente. Tres tests de ausencia/formato/identidad/revocación pasan; solo hashes, sin credencial fija ni secreto en identidad ordinaria.
  - [x] **T13b (2026-10-11):** upgrade autenticado, hello v2 y adaptación de tests de sesiones/TLS. Sin v1 ni excepción anónima; identidad fija de cabecera, cola de entrada/salida acotada, cierre al sustituir credencial y limpieza tras trabajo pendiente. 27 regresiones de login/pausa/reconexión/TLS pasan; cierre de batería en T13c.
  - [x] **T13c (2026-10-11):** diez pruebas nuevas de identidad/ataques y límites pasan, además de 27 regresiones focalizadas. Batería general correcta: formato, lint, tipos, build y 1 612 tests (419 servidor en PostgreSQL real, 334 nativos). Copia desconocida no cierra la sesión autorizada; evidencia en `mediciones.md`. T10 abierta; siguiente T14, sin VM.

- [x] **T14: Simulador con registro autenticado**
  - **Cubre:** REQ-003-10, REQ-003-11, REQ-003-63.
  - **Hacer:** adaptar `tools/agent-sim` al registro, certificado y protocolo elegido; separar explícitamente credenciales de pruebas y configuración de producción.
  - **Verificar:** login/latidos/pausa existentes con autenticación, PC falsa rechazada y secretos omitidos de salida, argumentos y archivos versionados.
  - **Commit:** `feat(tools): autentica las PCs del simulador`.
  - **División previa (2026-10-11):** T14a registro/configuración privada y transporte TLS; T14b canal v2 y CLI; T14c integración real, guía y batería completa. Sin credenciales fijas en producción.
  - [x] **T14a (2026-10-11):** registro por archivo privado, perfil estricto exclusivo de simulación, escritura atómica con exclusión y transporte con CA/Bearer. Cuatro tests nuevos y 48 existentes pasan; lint/tipos/build correctos. Activación en CLI/canal en T14b.
  - [x] **T14b (2026-10-11):** CLI register/run/interactive/load con perfil registrado, CA explícita, hello/latidos v2 y parseo estricto. Sin secreto en argumentos ni salida de errores internos; revocación detiene reintentos y start repetido no duplica canal. 54 tests, formato/lint/tipos/build correctos; integración real y batería en T14c.
  - [x] **T14c (2026-10-11):** CLI y nodo HTTPS/WSS reales: registro, confianza ajena rechazada en ambos transportes, login, latidos, pausa/reanudación, reconexión y credencial falsa 401. PGlite/PostgreSQL pasan; guía del simulador y dependencia de build solo de tests. Batería completa correcta: formato/lint/tipos/build y 1 619 tests (420 servidor, 54 simulador, 334 nativos). T10 abierta, siguiente T15 sin VM.

- [ ] **T15: Ciclo de vida del servicio y custodia local**
  - **Cubre:** REQ-003-02, REQ-003-63.
  - **Hacer:** implementar arranque/parada de `Pope.Agent`, configuración validada, custodia según ADR y logs acotados; separar servicio sin UI del usuario interactivo.
  - **Verificar:** parada limpia, configuración corrupta, permisos del usuario cliente denegados y ausencia de secretos; ejecutar como servicio solo en entorno de pruebas.
  - **Commit:** `feat(native): inicia el agente y protege su configuración`.
  - **División previa (2026-10-11):** T15a configuración/logs y pruebas sin efectos del sistema; T15b DPAPI/ACL; T15c ciclo de vida, ensayo temporal SCM/denegación y batería completa. No instalar como servicio permanente ni modificar shell/cuentas/directivas.
  - [x] **T15a (2026-10-11):** configuración JSON estricta de 64 KiB, UUIDv7/credencial canónicos, HTTPS y certificado vigente/SAN; buffer privado borrado al disponer. Logs de códigos cerrados y dos archivos de 64 KiB, también tras corrupción/tamaño previo excesivo. Tres tests nuevos, 337 nativos en total; build/formato correctos. Sin servicio instalado ni cambios del sistema; siguiente custodia T15b.
  - [x] **T15b (2026-10-11):** DPAPI de máquina, escritura atómica/exclusiva, límites, borrado de buffers y propietario/DACL SYSTEM/administración verificados antes de leer. Rechazo de reanálisis y privilegio de restauración temporal, sin cuentas nuevas. Tres pruebas locales nuevas (DPAPI/corrupción, fronteras token y ACL ordinaria); 340 nativas pasan, build/formato correctos. Custodia real como SYSTEM y parada/retirada se verifican en T15c antes de cerrar T15.
  - [ ] **T15c:** arranque/parada sin UI, configuración corrupta y custodia verificados como servicio temporal; retirada comprobada y batería general.
    - [x] **T15c1 (2026-10-11):** envoltorio ServiceBase sin UI/AutoLog, frontera LocalSystem/sesión 0 y un único trabajo cancelable con límite de parada. Tres tests nuevos de parada/duplicados/fallo/deadline; 343 nativos pasan, build/formato correctos. No se instala servicio aún; ensayo temporal y batería pendientes.
    - [x] **T15c2 (2026-10-11):** ensayo demand por GUID preparado, publicación protegida/custodia ficticia y retirada en finally con verificación; UAC solo del instalador y token medio para denegación. Sintaxis PowerShell, build/formato, 343 tests y rechazo real de arranque no-SYSTEM/sin UAC correctos. Artefactos autocontenidos publicados; todavía no instalado/ejecutado como servicio. T15c3 pendiente.
    - [ ] **T15c3:** ejecutar en desarrollo, comprobar denegación del token medio/retirada y cerrar batería. **2026-10-11:** batería general correcta (1 628 tests); lanzamiento del ensayo GUID `b3181fdb63634f5eb24eef508f365a79` cancelado por Windows/UAC antes de arrancar. Servicio inexistente (1060), carpeta protegida ausente; prueba funcional pendiente de aceptar UAC. No cerrar T15. El mantenedor autoriza después «ve con t16 hasta t20»: avanzar ese bloque sin repetir UAC y mantener esta prueba pendiente.

- [x] **T16: Conexión y reconexión del agente**
  - **Cubre:** REQ-003-02, REQ-003-04, REQ-003-63.
  - **Hacer:** mantener un WebSocket autenticado con certificado verificado, `hello`, latidos y reintentos acotados; no conectar React directamente al nodo en producción.
  - **Verificar:** corte/reconexión, cambio de nodo no confiable, un solo canal/temporizador y memoria estable durante reintentos prolongados.
  - **Commit:** `feat(native): mantiene la conexión autenticada con el nodo`.
  - **División previa (2026-10-11):** T16a validación de contratos exportados sin dependencia de producto nueva; T16b canal TLS/Bearer, hello/latidos y reconexión cancelable; T16c pruebas de transporte real, límites/reintentos y batería general. T15/T10 quedan abiertas por instrucción del mantenedor.
  - [x] **T16a (2026-10-11):** validador limitado al subconjunto JSON Schema exportado, embebido y sin dependencias nuevas; rechazo de campos duplicados, profundidad/tamaño y palabras clave futuras desconocidas. Fixtures v2 contrastan también el validador de producto; 343 tests nativos pasan. Siguiente T16b.
  - [x] **T16b (2026-10-11):** servicio conectado mediante ClientWebSocket/BCL, TLS 1.2/1.3 y certificado fijado vigente/SAN, sin proxy ni redirecciones; Bearer solo en cabecera. Hello unknown, único latido de 10 s, frames de 16 KiB y envío/recepción cancelables; backoff 1/2/4/8/16/30 s. Tres pruebas de WSS real/reconexión/certificado ajeno/backoff pasan; 346 nativas, build/formato correctos. T16c verifica ataques y estabilidad antes del cierre.
  - [x] **T16c (2026-10-11):** binario/campos duplicados/16 KiB excedidos cierran canal; revocación autenticada bloquea reintentos. 150 reconexiones WSS reales: +16 344 bytes retenidos y −1 handle entre muestra 50/final, logs acotados. 348 nativas y batería general correctas: formato/lint/tipos/test/build, 1 633 tests. No sustituye la medición prolongada en equipos del local T57 ni la prueba SCM pendiente T15. T16 completa en desarrollo; siguiente T17, T10 abierta, sin VM.

- [x] **T17: Estado de sesión y cuenta local monotónica**
  - **Cubre:** REQ-003-04; REQ-002-30, REQ-002-31; ADR-0007.
  - **Hacer:** conservar el último estado autorizado y descontar solo el restante permitido, sin calcular tarifas; reconciliar identidad tras reinicio sin inventar un `hello` que cierre sesión.
  - **Verificar:** cambio de reloj, host reiniciado, corte en sesión/pausa, agotamiento offline y arranque bloqueado; el nodo sigue siendo fuente de verdad.
  - **Commit:** `feat(native): conserva el estado autorizado de la sesión`.
  - **División previa (2026-10-11):** T17a copia autorizada/cuenta monotónica y pruebas de sesión/pausa/reloj/host; T17b recuperación durable ligada a PC y arranque bloqueado; T17c integración y batería general. No calcular dinero/tarifas ni aplicar políticas de pausa en C#.
  - [x] **T17a (2026-10-11):** copia validada y contador TimeProvider monotónico, bloqueo por agotamiento y pausa conservada sin inventar su vencimiento/billing. Snapshot con edad para un host nuevo; hello unknown salvo contexto real compatible, recuperación de identidad sin reutilizar autorización tras reinicio. Cuatro casos nuevos de reloj/pausa/host/recuperación; build/formato y 352 tests nativos correctos. Integración/custodia pendientes T17b/c.
  - [x] **T17b (2026-10-11):** recuperación en `recovery.bin` con DPAPI/ACL/exclusión y sustitución atómica de la custodia existente, solo SYSTEM. Contiene hello sin tiempo reutilizable ni secretos; ligada a PC/contexto compatible y desconocida si corrupta/ausente. Servicio integra estado en hello/latidos; buffers descartados tras lectura/escritura. Frontera de token y restauración/corrupción DPAPI probadas; build/formato y 353 nativas correctos. Ensayo SCM sigue pendiente T15; integración WSS y batería en T17c.
  - [x] **T17c (2026-10-11):** dos arranques del canal WSS real conservan PC/sesión/contexto protegido, hello conocido sin restante antiguo y bloqueo hasta nuevo state; heartbeat usa contexto recibido. Batería general correcta: formato/lint/tipos/test/build, 1 639 tests (354 nativos). Hasta T28 el nodo no publica controlState: recuperación unknown segura, sin fabricar revisiones. SCM permanece pendiente T15; T17 completa en desarrollo, siguiente T18, T10 abierta, sin VM.

- [x] **T18: Pipe seguro entre servicio y host**
  - **Cubre:** REQ-003-63; ADR-0017.
  - **Hacer:** implementar mensajes enmarcados, límites, ACL y verificación de PID/sesión del host lanzado; separar solicitudes UI y acciones nativas permitidas.
  - **Verificar:** proceso impostor del mismo usuario, PID reutilizado, cliente remoto, frame truncado y exceso de cola; no registrar contraseñas.
  - **Commit:** `feat(native): protege el puente local con el host`.
  - **División previa (2026-10-11):** T18a validación/frames compartidos y cola limitada; T18b pipe Windows con ACL/rechazo remoto e identidad por proceso retenido/PID/sesión; T18c puente agente y pruebas reales de impostor/truncado/límites más batería. La supervisión y relanzamiento automáticos del host siguen en T22.
    - [x] **T18a1 (2026-10-11):** contratos estrictos bridge-request/bridge-event (ready, petición UI, estado/conectividad y edad de copia), exportación y ocho fixtures válidos/inválidos. Sin órdenes nativas, credenciales ni hello de React; recorte anidado del usuario preparado. 657 shared y 362 nativas correctas; formato/lint/tipos/build de consumidores pasan.
    - [x] **T18a2 (2026-10-11):** biblioteca Pope.Bridge solo BCL reutiliza contratos/validador para servicio y host, con recorte ECMAScript de usuario directo/anidado y rechazo previo de campos duplicados. Frames de 16 KiB, lectura fragmentada/truncada y cola de 32; buffers rechazados/drenados borrados. Fixtures prueban producto desde entrada original; tres tests nuevos, 365 nativos correctos, build/formato pasan. Sin paquetes nuevos; siguiente T18b.
    - [x] **T18b1 (2026-10-11):** pipe local GUID/primera instancia/cliente único con PIPE_REJECT_REMOTE_CLIENTS y DACL por logon; cliente sin permiso de crear instancias. PID/sesión de ambos extremos contrastados con handle de proceso duplicado/retendido; el host solicita solo consulta limitada/sincronización del servicio. Dos pruebas de Windows reales pasan; 367 nativas, build/formato correctos. Impostor/handle muerto y flujo en T18b2/c.
    - [x] **T18b2 (2026-10-11):** sesión duplex con lector/procesador/escritor únicos, dos colas de 32, identidad contrastada antes de cada frame/acción y cancelación con borrado. Deadline de 5 s desde primer byte o al escribir, sin desconectar un host inactivo. Petición/respuesta correlacionadas y desbordamiento probados en pipes reales; 369 nativas/build/formato correctos. Siguiente T18c para impostor/handle muerto e integración agente.
    - [x] **T18c1 (2026-10-11):** runtime integra estado/canal y puente que recibe el proceso lanzado; publicador filtra órdenes/ACK, envía snapshot con edad y devuelve error offline correlacionado sin copiar contraseñas/credenciales. Salida técnica no se reenvía al nodo antes del journal T40; lanzamiento/supervisión siguen en T22. Prueba real de despacho y 370 nativas/build/formato correctos.
    - [x] **T18c2 (2026-10-11):** impostor con SID/logon iguales rechazado antes de recibir estado; handle muerto no coincide aunque conserve el PID. Remoto loopback y frame truncado rechazados en pipes reales; overflow/correlación pasan. Batería general correcta: formato/lint/tipos/test/build, 1 666 tests (373 nativos, 420 servidor en PostgreSQL real). T18 completa en desarrollo; T19 siguiente, T15/T10 abiertas, sin VM.

- [x] **T19: Host de WebView2 con interfaz empaquetada**
  - **Cubre:** REQ-003-01, REQ-003-03, REQ-003-04, REQ-003-63.
  - **Hacer:** alojar `shell-ui` local con origen virtual permitido y puente tipado; limitar navegación, ventanas nuevas, descargas y herramientas de desarrollo de producción.
  - **Verificar:** pantalla sin nodo, origen/mensaje falsificado rechazado, host sin elevación y credencial de PC inaccesible a JavaScript.
  - **Commit:** `feat(native): aloja el Shell local en WebView2`.
  - **División previa (2026-10-11):** T19a frontera de usuario/origen y cliente del pipe; T19b ventana WebView2/paquete local y permisos; T19c prueba aislada de la interfaz real y batería general. No cambiar el shell de Windows ni lanzar el host desde el servicio antes de T22.
    - [x] **T19a (2026-10-11):** frontera interactiva no-SYSTEM/no-elevación, origen HTTPS fijo sin usuario/puerto ajeno y envoltorios estrictos limitados a 16 KiB. Cliente cancelable, reintentos 1–30 s, identidad de servicio y sin reenvío de solicitudes. Ataques de origen/campos/hello rechazados; 374 nativos pasan, build/formato correctos sin avisos. Ventana y prueba real en T19b/c.
    - [x] **T19b (2026-10-11):** ventana local WinForms/WebView2 con origen virtual, perfil separado y puente tipado; navegación/subframes/popups/descargas/permisos/recursos externos limitados. CSP del paquete prohíbe conexiones JS; assets incluidos en build/publicación con dependencia Turbo explícita. Snapshot conserva edad tras ready y peticiones no se repiten. 374 nativos y 52 shell pasan; tipos/lint/build/formato correctos. Prueba real y cierre en T19c.
    - [x] **T19c (2026-10-11):** ventana de producto real en escritorio cotidiano con assets empaquetados y token medio; pantalla sin nodo, error correlacionado, mensajes inválidos, navegación/popup/descarga cancelados y cero conexiones al receptor local. Snapshot conserva edad. Captura revisada, WebView2 154.0.4258.62; batería general correcta, 1 667 tests (374 nativos). Sin instalación/cambios de Windows; T19 completa en desarrollo, adaptador React en T20; T15/T10 abiertas.

- [x] **T20: Transporte WebView2 de PcChannel**
  - **Cubre:** REQ-003-03, REQ-003-04, REQ-003-63.
  - **Hacer:** implementar el adaptador de `PcChannel` en `apps/shell-ui`; mantener transporte de desarrollo separado y todas las pantallas sobre la interfaz existente.
  - **Verificar:** solicitudes/respuestas correlacionadas, desconexión, reintentos y limpieza de listeners; solo el agente envía `hello` y latidos.
  - **Commit:** `feat(shell-ui): conecta el Shell con el puente de WebView2`.
  - **División previa (2026-10-11):** T20a adaptador tipado, edad/identidad y selección de producción; T20b transporte de desarrollo registrado sin secretos en React; T20c integración real y batería general.
    - [x] **T20a (2026-10-11):** PcChannel WebView2 valida envoltorios/límite, preserva requestId, nombre público y edad monotónica; ready con reintentos acotados, sin hello/latidos ni reenvío de solicitudes. Producción excluye DevSocketChannel; ausente WebView2 queda offline. Cinco tests nuevos (57 shell) y 374 nativos pasan, tipos/lint/build/formato correctos; ensayo WebView2 real repetido con el adaptador. Desarrollo registrado en T20b, integración completa en T20c.
    - [x] **T20b:** desarrollo v2 mediante proxy de simulación registrado; credencial/CA solo en Vite.
      - [x] **T20b1 (2026-10-11):** helper privado del proxy y dependencia DEV explícita para reutilizar perfil/CA. Prueba con Vite/upgrade reales: Bearer solo para origen local, metadatos sin secreto y sin proxy anónimo cuando falta perfil. Tipos/lint/formato correctos; activación y canal v2 en T20b2.
      - [x] **T20b2 (2026-10-11):** Vite loopback activa perfil registrado; identidad pública validada, sin pc ficticia/query ni credencial en React. Canal v2 unknown, latidos/contexto validado, cuenta monotónica, pausa sin cambio local de billing, revocación detiene reintentos y stop limpia handlers. 60 shell/tipos/lint/formato/build correctos; bundle de producción idéntico al comprobado en T20a. Guía/AGENTS actualizadas; integración completa en T20c.
    - [x] **T20c (2026-10-11):** React real envía login por host/pipe/WSS autenticado; respuesta con otro requestId ignorada, error correcto y sesión autorizada mostrados. Pipe cortado/reconectado conserva sesión/edad sin repetir login; captura revisada. Broker ordinario de pruebas, sin credencial en WebView2 ni SCM/VM. Batería general correcta: formato/lint/tipos/test/build, 1 676 tests (375 nativos, 60 shell; servidor PostgreSQL reutilizado sin cambios). PostgreSQL temporal detenido. T16–T20 completas en desarrollo; T15/T10 abiertas, T21–T59 Borrador.

### Bloqueo y fase 2 de pausa

- [x] **T21: Bloqueo nativo y atajos restringidos**
  - **Cubre:** REQ-003-03, REQ-003-30, REQ-003-33.
  - **Hacer:** integrar el mecanismo demostrado en T09, escritorio de bloqueo y hook según estado/foco; Alt+Tab inhibido solo sin sesión, permitido con temporal/cuenta incluso al enfocar Pope (ADR-0023). Mantener aislamiento de pausa/revocación y liberar solo tras autorización del nodo.
  - **Verificar:** Win, Ctrl+Esc, Alt+F4, clics y monitores; Alt+Tab inhibido sin sesión, permitido ida/vuelta con temporal/cuenta y sin acceso al juego desde pausa/revocación. Fallo de cambio no confirma éxito ni abre el escritorio de uso.
  - **Commit:** `feat(native): aplica el bloqueo en un escritorio separado`.
  - **División previa (2026-10-12):** T21a filtro de atajos y handles de escritorio con pruebas acotadas; T21b integración del host con escritorios/hilos fijos y estado autorizado; T21c ensayo real reversible de entrada/transiciones/fallo y batería general. Ninguna subparte por sí sola cierra T21.
  - [x] **T21a (2026-10-12):** filtro por sesión/foco, escritorio con DACL SYSTEM/logon y handles propios. Prueba en proceso nuevo demuestra React en escritorio de nacimiento; STA reasignado falla WebView2 (0x80070057). Adoptar instancias por escritorio según plan/T09. Build/formato y 378 tests nativos correctos; integración y entrada real en T21b/c.
  - [x] **T21b (2026-10-12):** integración de ventana de uso/bloqueo con mensajes validados y edad monotónica.
    - **División previa:** T21b1 interpreta la autorización y confirma solo efectos Win32 correctos; T21b2 enlaza las instancias/pipe y la interfaz lista.
    - [x] **T21b1 (2026-10-12):** autorización validada con edad monotónica, pausa/revocación conservan aislamiento; intento de cambio fallido no confirma éxito ni abre uso. Cuatro casos nuevos, formato/build y 382 tests nativos correctos. Integración de las instancias en T21b2.
    - [x] **T21b2 (2026-10-12):** instancia por escritorio y relay con SID/logon/sesión/binario/objeto retenido; ready tipado antes de activar bloqueo, hook por estado/foco y cobertura virtual de dos monitores. Copia conserva edad, revocación mantiene selector aislado; 382 nativas/build/formato correctos. Ensayo físico/batería general en T21c; recuperación del host aún T22.
  - [x] **T21c (2026-10-14):** ensayo real reversible `--desktop-session-proof` en el Windows de desarrollo (sin VM): sin sesión el escritorio de bloqueo recibe la entrada, sin Explorer, y Win/Ctrl+Esc/Alt+F4/Alt+Tab no escapan; con cuenta y con temporal Alt+Tab va y vuelve entre Pope y la app sin que Alt+F4 cierre Pope; la pausa y la revocación aíslan teclas/clics y Alt+Tab, el proceso sigue vivo con latidos y, al reanudar, es el mismo proceso. Escritorio original restaurado. Batería general: formato/lint/tipos/build correctos, 382 nativos y 420 de servidor (un fallo puntual del servidor en la primera pasada, no reproducido). Límites: el equipo tiene **1 monitor**, así que la cobertura de dos monitores sigue demostrada solo por tests (T21b2); el fallo de cambio de escritorio, solo por tests (T21b1). Pendiente para T25/T56: juegos reales y anticheat, y monitores físicos múltiples. El ensayo requirió instalar el SDK .NET 10.0.402 (winget) en esta máquina.

- [ ] **T22: Supervisión y relanzamiento del host**
  - **Cubre:** REQ-003-32; CA-003-02.
  - **Hacer:** detectar salida, bloqueo de UI y fallo de renderer; relanzar el host preservando estado y cuenta, sin crear instancias competidoras.
  - **Verificar:** matar/colgar host y renderer, recuperación total < 3 s y ningún acceso al juego bloqueado durante el hueco; medir detección y relanzamiento.
  - **Commit:** `feat(native): recupera el host cuando falla`.

- [x] **T23: Pausa y reanudación en escritorios reales**
  - **Cubre:** REQ-002-04, REQ-002-05, REQ-002-10, REQ-002-13, REQ-002-30, REQ-002-31.
  - **Hacer:** aplicar pausa del nodo en el escritorio separado; conservar juegos, confirmar reanudación y mantener bloqueo si la pausa vence cobrando o pierde LAN.
  - **Verificar:** ninguna entrada al juego, procesos sin suspender/cerrar, pausa vencida, opción de cierre y reanudación desde panel; sin decisión local de cobro.
  - **Commit:** `feat(native): aplica la pausa sin cerrar los juegos`.
  - **Orden del mantenedor (2026-10-18):** «ve desde t23 hasta t27». T22 queda abierta, sin implementar; T23–T27 no la dan por hecha ni la sustituyen. Los ensayos usan el broker ordinario de pruebas, no la supervisión del servicio.
  - **División previa (2026-10-18):** T23a reintento seguro de transiciones y matriz de autorización de pausa; T23b ensayo real con agente, doble WSS del nodo, host, escritorios y app, más batería general.
    - [x] **T23a (2026-10-18):** un `SwitchDesktop` rechazado (escritorio seguro de Ctrl+Alt+Supr/UAC) ya no lanza excepciones en el temporizador ni en la entrega del puente: queda sin confirmar y se reintenta cada 100 ms; la interfaz lista de bloqueo ya no fuerza un cambio previo. Tests: pausa vencida cobrando y pausa sin red siguen aisladas aunque se agote el restante, reanudar desde el panel abre uso, y cerrar en pausa (`sessionEnded`/`locked`) deja bloqueo sin sesión. 386 nativos, build sin avisos y formato correctos.
    - [x] **T23b (2026-10-18):** ensayo `--pause-proof` en el Windows de desarrollo (sin VM): agente real contra doble WSS del nodo, host de producto y app en escritorio temporal sin Explorer. Pausa pedida desde React, vencida cobrando, corte de red, reanudación desde panel, reanudación con teclado real y «¿Eres…?», y cierre en pausa: ninguna entrada llega a la app, que sigue viva con el mismo PID. Confirmar «Pausar» → bloqueo ≤ 39,7 ms en loopback (dos ejecuciones). Batería general correcta: 1 687 tests (386 nativos). Pendiente en PC real (T56): juegos/anticheat, audio y varios monitores. Detalle en [mediciones](mediciones.md).

- [x] **T24: Silencio y restauración de audio de pausa**
  - **Cubre:** REQ-002-07.
  - **Hacer:** silenciar dispositivos/sesiones de audio conforme al mecanismo probado y conservar estado previo; restaurarlo al reanudar sin duplicar capturas tras reconexión.
  - **Verificar:** juego exclusivo, varios dispositivos, cambio de salida, mute previo y host reiniciado; recuperación conserva volumen/mute originales.
  - **Commit:** `feat(native): silencia y restaura el audio durante la pausa`.
  - **División previa (2026-10-18):** T24a lógica de captura/diario/restauración con dobles; T24b Core Audio por COM (sin paquetes), integración en el host y ensayo real en el Windows de desarrollo, más batería general.
    - [x] **T24a (2026-10-18):** `PauseAudio` silencia todas las salidas activas y solo cambia el mute, nunca el volumen. Guarda el mute original de cada salida en un diario antes de silenciar, con escritura atómica, 64 salidas como máximo y JSON estricto. Así un host reiniciado o una reconexión no recapturan el silencio de Pope. Al reanudar devuelve a cada salida su mute previo. Una salida nueva durante la pausa se silencia, una desconectada se restaura al volver y un fallo de una salida no detiene el resto. Un diario corrupto se descarta sin inventar originales. 9 tests nuevos.
    - [x] **T24b (2026-10-18):** Core Audio por COM (sin paquetes) en un hilo MTA del host. Sigue solo la pausa del nodo y no actúa antes de la primera copia del estado. Ensayo `--audio-proof` en el Windows de desarrollo, con 5 salidas reales: la pausa pedida desde React silencia todas en ≈ 75 ms. Un corte de red y un host matado y relanzado en plena pausa no recapturan, y reanudar restaura el mute original sin cambiar el volumen. Un mute previo sigue puesto tras reanudar. Al terminar, cada salida vuelve a su estado original. Batería general correcta: 1 697 tests (396 nativos). Pendiente en PC real (T56): juego con audio exclusivo y comprobación audible. Detalle en [mediciones](mediciones.md).

- [x] **T25: Acceso a Pausar durante el juego**
  - **Cubre:** REQ-003-30, CA-003-12; REQ-002-01, REQ-002-02, REQ-002-11, REQ-002-50.
  - **Hacer:** implementar Alt+Tab entre Pope y apps autorizadas con sesión activa temporal/cuenta, también al enfocar Pope (ADR-0023); conservar confirmación/límites de pausa y aislamiento al bloquear/pausar.
  - **Verificar:** ida/vuelta sin Explorer con cada modo de juego/anticheat; cambiar ventana no pausa, cancelar no pausa, temporal sin botón y desde confirmar Pausar hasta bloquear entrada < 1 s. Atajo no permite escapar desde pausa/revocación; sin sesión queda inhibido.
  - **Commit:** `feat(native): permite acceder a Pope durante el juego`.
  - **Decisión confirmada (mantenedor, 2026-10-07):** Alt+Tab como acceso, sin fijar Ctrl+Shift+P/F10. Compatibilidad/selector sin probar; T25 sigue en Borrador, sin autorización de implementación por esta decisión.
  - **Completa en desarrollo (2026-10-19):** el mecanismo ya lo entregó T21 (filtro por sesión y aislamiento por escritorio); T25 no añade código de producto. Ensayo `--game-access-proof` con la cadena real (agente, doble WSS del nodo, host) y Chocolate Doom 3.1.1 + Freedoom 0.13.0 en pantalla completa exclusiva a la resolución actual, sin Explorer, con clics y teclas reales:
    - sin sesión, Alt+Tab no sale del bloqueo;
    - con cuenta, Alt+Tab va del juego a Pope y vuelve sin pausar;
    - «Seguir jugando» no pausa, y la temporal va y vuelve sin botón Pausar;
    - de clic en «Pausar» a bloqueo de la entrada: 8 muestras de 15,2 a 32 ms (p50 16,1);
    - la demo del juego registra 0 tics de movimiento o disparo en los 179 tics de pausa, y Alt+Tab no alcanza el juego en pausa ni en revocación.
    Batería general correcta: 1 697 tests. **Sin probar:** los juegos del local, los anticheat y varios monitores. No se declara compatible el mecanismo de ADR-0023 hasta T56.

- [x] **T26: Cierre de procesos del cliente**
  - **Cubre:** REQ-003-34; CA-003-08.
  - **Hacer:** controlar pertenencia de juegos/lanzadores/procesos auxiliares y cerrarlos al terminar; proteger Pope, servicios y otros usuarios, sin reiniciar ni restaurar perfiles de la 004.
  - **Verificar:** cierre, agotamiento, bloqueo y temporal; no cerrar apps en pausa ni procesos del cliente siguiente; ensayar anticheat en PC real.
  - **Commit:** `feat(native): cierra los procesos del cliente al terminar`.
  - **División previa (2026-10-19):** T26a política pura de pertenencia; T26b enumeración/terminación Win32, ámbito de sesión persistido y conexión con el estado del agente; T26c ensayo real acotado a procesos propios del ensayo y batería general.
    - [x] **T26a (2026-10-19):** `ClientProcessPolicy` decide sin efectos qué procesos cerrar: sesión de Windows y usuario del cliente, creados entre el inicio de la sesión Pope y el corte, más sus descendientes posteriores (relanzamientos). Conserva lo anterior a la sesión, Pope (host retenido con su hora de creación, más sus hijos del mismo ejecutable o de WebView2), los procesos críticos, la sesión 0, otros usuarios y los procesos del cliente siguiente. 4 tests.
    - [x] **T26b (2026-10-19):** `ClientProcesses` enumera procesos (Toolhelp y consulta limitada) y termina cada uno solo si conserva su hora de creación. `ClientSessionCleanup` abre el ámbito al empezar una sesión Pope con el host asociado y lo persiste en la custodia del agente. Cuando el nodo la termina, cierra sus procesos en hasta 3 pasadas, incluidos los relanzados por un objetivo ya cerrado. No actúa con pausa, revocación, agotamiento local sin red, otro logon ni un ámbito de otro arranque de Windows. Hasta T22 solo actúa con el host asociado mediante `RunForHostAsync`. Logs con códigos cerrados. 407 nativos.
    - [x] **T26c (2026-10-19):** ensayo `--cleanup-proof` en el Windows de desarrollo con la cadena real: agente, doble WSS, host asociado y `ClientSessionCleanup` de producto. Corre como el usuario de desarrollo: solo termina descendientes del propio ensayo y anota sin tocarlos los demás que elegiría la política (ninguno en dos ejecuciones). La pausa no cierra nada. Al cerrar la sesión en pausa se cierran el lanzador, sus dos auxiliares (con sus conhost) y la app en ≈ 110 ms. Se conservan el proceso previo a la sesión, Pope (host e hijo de bloqueo) y el proceso del cliente siguiente, abierto enseguida en una temporal. Al agotarse esa temporal se cierra su proceso. Corrigió además que un proceso terminado con un handle abierto pareciera vivo. Batería general correcta: 1 708 tests (407 nativos). **Sin probar:** anticheat y juegos reales (T56) y custodia del ámbito como SYSTEM (requiere el SCM de T15).

- [x] **T27: Fallo completo y reinicio del servicio**
  - **Cubre:** REQ-003-02, REQ-003-03, REQ-003-32; REQ-002-30, REQ-002-31.
  - **Hacer:** implementar la recuperación aprobada ante pérdida del agente, distinta de T22; proteger bloqueo y reconciliar estado sin conceder entrada técnica normal offline.
  - **Verificar:** matar servicio con PC bloqueada/activa/pausada, reinicio sin nodo, journal corrupto y ausencia de tiempo adicional; no sustituir el acceso de emergencia T53/T54.
  - **Commit:** `feat(native): recupera el control tras reiniciar el servicio`.
  - **Alcance confirmado (mantenedor, 2026-10-12):** el host bloquea al perder el agente; el nuevo agente conserva el bloqueo hasta estado nuevo del nodo. Sin mantenimiento offline ni tiempo antiguo. T53/T54 conservan la emergencia administrativa; el ensayo SCM real pendiente no se declara probado.
  - **División previa (2026-10-19):** T27a comportamiento del host y del agente reiniciado; T27b ensayo real matando el proceso del agente (bloqueado, activo y pausado) y reiniciándolo sin nodo, más batería general.
    - [x] **T27a (2026-10-19):** al perder el agente, el host bloquea como antes. Además olvida la sesión, con lo que Alt+Tab vuelve a inhibirse, envía al bloqueo la pantalla sin sesión y congela el silencio de pausa. Este host no se reconecta a otro agente; sustituirlo corresponde a T22. Un agente reiniciado no publica ningún «locked» sintético hasta oír al nodo, con lo que el host conserva su bloqueo inicial y no devuelve el sonido en plena pausa. Antes de oír al nodo no hay tiempo local en hello ni en latidos. 408 nativos.
    - [x] **T27b (2026-10-19):** ensayo `--agent-loss-proof` en el Windows de desarrollo. El agente corre como proceso ordinario aparte que lanza el host, no como SCM, y se mata con `Kill`, dejando vivo al host:
      - bloqueada: sigue bloqueada sin escape;
      - activa: pasa al bloqueo en 24 ms, sin sesión, con Alt+Tab inhibido y sin entrada a la app, que sigue viva;
      - pausada: sigue bloqueada y silenciada con el mismo diario.
      Un agente nuevo con el nodo caído (conexión rechazada) no conoce nada, no concede tiempo, mantiene el bloqueo y el silencio. Al volver el nodo, hello `unknown` con tiempo local `null`; la pausa recuperada no recaptura y reanudar restaura el audio original. Cada caso usa un host nuevo, porque el relevo del host sin agente es T22. Archivos corruptos (recuperación, ámbito, diario de audio) cubiertos por tests. Batería general correcta: 1 709 tests (408 nativos). **Sin probar:** el SCM y el reinicio real del servicio (T15c3) y el arranque de Windows (T50/T54).

### Control remoto y mantenimiento

**Continuación (mantenedor, 2026-10-21):** «deja para luego T22 si es posible y ve avanzando con T28 hasta T42; si hay dudas pregunta, no asumas». T34: proponer el diseño antes de implementar. T37: aplazada hasta T10; T38/T40 hacen solo lo independiente del mecanismo y quedan abiertas. T31: reinicio pedido con margen y anulado, sin reiniciar el equipo de desarrollo. T33: captura local del paquete mágico; encendido físico en T58.

- [x] **T28: Órdenes idempotentes y reserva de PC**
  - **Cubre:** REQ-003-20, REQ-003-41, REQ-003-43.
  - **Hacer:** implementar solicitud/acuse/resultado con eventos y reserva transaccional; serializar sobre la misma PC todos los caminos de login, temporal, restauración y mantenimiento.
  - **Verificar:** doble clic, ACK duplicado/tardío, orden vencida, desconexión y login concurrente; no ejecutar órdenes viejas sobre otra sesión.
  - **Commit:** `feat(server): coordina las órdenes y reservas de PCs`.
  - **División (2026-10-21):** se divide para mantener commits revisables; ver la concreción T28 del plan.
  - [x] **T28a:** contexto y revisión por ocupación, `controlState` tras `hello`/latido y rechazo `pc_unavailable` de login, temporal y restauración con reserva o mantenimiento.
  - [x] **T28b:** órdenes con eventos, acuses idempotentes, caducidad, reserva y reenvío tras `hello`; endpoints del panel.
  - **Implementada (2026-10-21):** contexto por ocupación y `controlState`; órdenes `lock`/`restart`/`powerOff` con la PC libre, idempotentes por ID, con eventos, vencimiento a los 30 s, acuses validados que no retroceden, reserva que bloquea login/temporal/restauración y reenvío tras `hello`. 18 tests e2e nuevos (doble clic, acuse duplicado/tardío/ajeno, vencida, desconexión, reconexión y login concurrente). Batería correcta: formato, lint, tipos, build y 1 733 tests (438 servidor, 408 nativos). Concurrencia comprobada con PGlite; contra PostgreSQL real queda para la entrega al local. Sin probar: el agente aún no ejecuta órdenes (T29–T31).

- [x] **T29: Bloquear mediante el cierre existente**
  - **Cubre:** REQ-003-20, REQ-003-34; REQ-001-69.
  - **Hacer:** enlazar Bloquear/cerrar/agotamiento con cierre de negocio, bloqueo nativo y limpieza T26; liberar la reserva solo al confirmar el efecto.
  - **Verificar:** cuenta activa/pausada y temporal, sin cobro tras cierre; limpieza fallida mantiene reserva y no admite un cliente nuevo por accidente.
  - **Commit:** `feat(server): cierra la sesión antes de bloquear la PC`.
  - **Alcance confirmado (mantenedor, 2026-10-21):** todos los cierres (Bloquear, Cerrar desde el panel, salida del cliente, agotamiento, falta de latidos y reinicio detectado) dejan la PC reservada hasta que el agente confirma el bloqueo y la limpieza de procesos. Los que no hace el personal piden el bloqueo con actor «sistema» (contrato y migración nuevos). Si la limpieza falla, la PC no admite a nadie hasta otro Bloquear.
  - **División (2026-10-21):** T29a contrato; T29b nodo; T29c agente. Ver la concreción T29 del plan.
  - [x] **T29a:** órdenes de bloqueo con actor «sistema» en el contrato, el evento y la base de datos (migración 0030); el sistema no puede pedir otra cosa.
  - [x] **T29b:** todo cierre reserva la PC con un bloqueo en la misma transacción; «Bloquear» con sesión la cierra y bloquea; un bloqueo solo libera la reserva al aplicarse y se repite al reconectar si quedó pendiente.
  - [x] **T29c:** el agente valida y ejecuta el bloqueo, espera la limpieza T26 y responde aplicado o fallido.
  - **Implementada (2026-10-21):** todos los cierres reservan la PC con un bloqueo (actor del personal o «sistema») hasta que el agente lo aplica tras la limpieza T26; Bloquear con sesión/pausa/temporal cierra con las reglas existentes y no se cobra después. Limpieza fallida: `native_failure`, la PC no admite clientes hasta otro Bloquear. Ensayo real ampliado de T26: bloqueo aplicado en 765–768 ms tras el cierre y 608–655 ms tras el agotamiento, sin procesos del cliente vivos. 447 tests del servidor en PostgreSQL 18.6. Batería correcta: 1 749 tests (414 nativos). **Sin probar:** confirmación del escritorio físico por el host (T22) y juegos/anticheat (T56). Ver [mediciones](mediciones.md).

- [ ] **T30: Reiniciar y apagar con confirmación de estado**
  - **Cubre:** REQ-003-20, REQ-003-41; REQ-001-69.
  - **Hacer:** validar confirmación ligada al estado actual; cerrar sesión activa/pausada o terminar mantenimiento antes de emitir la orden, conservando actor y eventos.
  - **Verificar:** estado cambiado después de confirmar, temporal con aviso de pérdida, salida técnica registrada y orden no enviada si falla el cierre previo.
  - **Commit:** `feat(server): prepara reinicios y apagados confirmados`.
  - **División (2026-10-21):** T30a con sesión; T30b con mantenimiento, que necesita registrar antes la salida técnica (T39/T40) y por eso sigue el aplazamiento de T37 que decidió el mantenedor. T30 queda abierta hasta T30b.
  - [x] **T30a:** con sesión activa, pausada o temporal y `confirmed: true`, el nodo cierra la sesión con las reglas existentes y en la misma transacción guarda el reinicio o apagado (ID del panel) en lugar del bloqueo; sin confirmar responde `confirmation_required` y, si el cierre falla, no guarda ni envía nada. Si esa orden falla o vence sin respuesta, el nodo pide un bloqueo del sistema para confirmar la limpieza antes de admitir clientes. 8 tests e2e.
  - [ ] **T30b:** con mantenimiento: terminarlo y registrar su salida antes de reiniciar o apagar. Pendiente de T39/T40; hasta entonces el nodo responde `invalid_command`. Se implementa como T39c ([guía](guia-t33-t42.md#t39c--reiniciar-o-apagar-durante-el-mantenimiento-t30b)).

- [x] **T31: Ejecución nativa de órdenes de energía**
  - **Cubre:** REQ-003-20, REQ-003-61.
  - **Hacer:** ejecutar solo variantes autorizadas de reinicio/apagado, guardar resultado/ID antes del efecto y devolver aceptación o fallo de Windows sin executor genérico.
  - **Verificar:** duplicado tras reconectar/reiniciar, expiración, permiso insuficiente y orden malformada; desconexión no equivale a apagado comprobado.
  - **Commit:** `feat(native): ejecuta reinicios y apagados autorizados`.
  - **División (2026-10-21):** T31a nodo (al volver de un reinicio que cerró una sesión o cuyo acuse se perdió, se pide un bloqueo en lugar de liberar la PC); T31b agente.
  - [x] **T31a:** reconexión tras reinicio/apagado en el nodo; 2 tests e2e.
  - [x] **T31b:** el agente guarda la orden en un diario protegido (`power-journal.bin`, 16 entradas) antes del efecto, acepta y pide a Windows reiniciar o apagar (`InitiateShutdownW`, sin arranque rápido híbrido, cerrando apps sin preguntar). Si Windows lo rechaza responde `native_failure`; tras reiniciar, la misma orden repite su resultado sin ejecutarse otra vez. Ensayo real `--power-proof`: Windows aceptó reiniciar y apagar (código 0) y ambos se anularon con `AbortSystemShutdownW` dentro de los 60 s de margen, sin reiniciar el equipo. La primera ejecución detectó un fallo de alineación de `TOKEN_PRIVILEGES` (1300, sin permiso), que sirvió de prueba real de ese fallo. Batería correcta: 1 765 tests (457 servidor, 420 nativos). **Sin probar:** reinicio y apagado reales (VM o PC de pruebas) y como SYSTEM (SCM, T15c3).  - [x] **T31a:** reconexión tras reinicio/apagado en el nodo; 2 tests e2e.  - [x] **T31b:** el agente guarda la orden en un diario protegido (`power-journal.bin`, 16 entradas) antes del efecto, acepta y pide a Windows reiniciar o apagar (`InitiateShutdownW`, sin arranque rápido híbrido, cerrando apps sin preguntar). Si Windows lo rechaza responde `native_failure`; tras reiniciar, la misma orden repite su resultado sin ejecutarse otra vez. Ensayo real `--power-proof`: Windows aceptó reiniciar y apagar (código 0) y ambos se anularon con `AbortSystemShutdownW` a los 60 s de margen, sin reiniciar el equipo; la primera ejecución detectó un fallo de alineación de `TOKEN_PRIVILEGES` (1300, sin permiso), que sirvió de prueba real del fallo. Batería correcta: 1 765 tests (457 servidor, 420 nativos). **Sin probar:** reinicio y apagado reales (VM o PC de pruebas) y como SYSTEM (SCM, T15c3).

- [x] **T32: Mensajes del encargado a la PC**
  - **Cubre:** REQ-003-20, REQ-003-61.
  - **Hacer:** integrar envío, transporte y presentación elegida en nodo/host/Shell; validar texto, destinatario, vigencia y límites acordados, sin HTML ejecutable.
  - **Verificar:** foco/duración conforme a la decisión, contenido malicioso y estados permitidos; mensaje retrasado no aparece al siguiente cliente ni se marca entregado por enviarlo.
  - **Commit:** `feat(shell-ui): muestra los mensajes del encargado`.
  - **Presentación confirmada (mantenedor, 2026-10-21):** ventana nativa del host siempre encima, sin foco y transparente a clics, centrada; en juegos DirectX exclusivos puede no verse y solo sonar (se comprueba en T56). Diseño propio con el estilo del Shell, para revisar. Sonido de aviso de Windows (en la pausa queda silenciado como todo lo demás).
  - **División (2026-10-21):** T32a contrato y nodo; T32b agente y host (la ventana es nativa, así que el commit es `feat(native)` en vez de `shell-ui`); T32c ensayo real.
  - [x] **T32a:** el nodo admite `showMessage` con la PC libre o en sesión (también en pausa), sin reservarla ni esperar a otras órdenes, y lo rechaza en mantenimiento. Se da por entregado solo con `applied` de la PC; si no, vence a los 30 s. El evento no copia el texto. Contrato: `staffMessage` del servicio al host y `staffMessageShown` del host al servicio, nunca al nodo; React no recibe el mensaje. 5 tests nuevos.
  - [x] **T32b:** el agente valida el mensaje con su contexto, lo pasa al host y responde `applied` cuando el host confirma que lo mostró; ventana nativa con sonido, 5 s, sin foco ni bloquear la entrada, en el escritorio activo (uso o bloqueo). Hecho (2026-10-22): en el escritorio de uso lo muestra el host y en el de bloqueo su hijo, que lo confirma por el padre; la confirmación la crea solo el host (la de React se descarta) y nunca llega al nodo. Sin host, `pc_unavailable`; sin confirmación en 10 s, `native_failure`. La ventana se pinta entera antes de confirmar (una primera prueba vio el título en blanco). Texto en etiquetas, nunca HTML. 4 tests nuevos (425 nativos).
  - [x] **T32c:** ensayo real: foco y entrada intactos, duración, texto hostil como texto plano y descarte si cambia la sesión. Hecho (2026-10-22): `--message-proof` correcto cuatro veces en el Windows 11 de desarrollo; visible en 61 ms, 5 s en uso y en bloqueo, foco y entrada intactos, texto hostil literal y mensaje de otra sesión descartado (`stale_context`). Sonido oído por el mantenedor. Ver [mediciones](mediciones.md). Pendiente: revisión del diseño por el mantenedor y juegos exclusivos (T56).

- [x] **T33: Wake-on-LAN y aviso de dos minutos**
  - **Cubre:** REQ-003-22; CA-003-06.
  - **Hacer:** enviar paquete mágico desde el nodo a la NIC/MAC configurada; registrar actor y observar conexión, avisar a los 120 s y retirar aviso si conecta después.
  - **Verificar:** paquete/MAC correctos, dueño rechazado, temporizadores acotados y llegada tardía; no diagnosticar avería ni confirmar arranque por enviar UDP.
  - **Commit:** `feat(server): enciende PCs por Wake-on-LAN`.
  - **División (2026-10-22):** pasos, contratos y tests en la [guía T33–T42](guia-t33-t42.md#t33--wake-on-lan-y-aviso-de-dos-minutos). Aviso guardado en el nodo hasta que la PC conecte o se pulse otra vez Encender (mantenedor).
  - [x] **T33a:** contrato `pc-wake.ts`, evento `pc.wake_requested` y columnas de la petición en `pc_control_states`.
  - [x] **T33b:** `WakeOnLanSender` (3 copias UDP, `POPE_WOL_ADDRESS`/`POPE_WOL_PORT`), falso para los tests y captura local.
  - [x] **T33c:** `POST /pcs/:pcId/wake`, limpieza al conectar y `wake` en el mapa.

- [ ] **T34: Revocación conservando la sesión**
  - **Cubre:** REQ-003-11, REQ-003-63; REQ-002-33, CA-002-09.
  - **Hacer:** implementar la parte del nodo tras resolver confirmación temporal y desglosar el mecanismo de recuperación; preservar sesión, detener consumo durante bloqueo por revocación confirmado, revincular la misma PC con credencial nueva sin desbloquear hasta autorización del encargado/administrador (ADR-0020/0021), distinguir revocación autenticada de fallo TLS y coordinar bloqueo nativo de T21. Validar sesión/rol en las tres acciones: revocar, revincular y autorizar continuar.
  - **Verificar:** revocación en canal vivo y al reconectar, ausencia de consumo de saldo/tiempo durante bloqueo confirmado, misma PC/sesión tras revincular, credencial anterior rechazada y nueva credencial sin desbloqueo automático; jobs/reconcile no cierran sesión conservada y PC revocada no inicia una nueva. Encargado/administrador admitidos y dueño/cliente/peticiones sin sesión rechazados en cada acción; eventos con actor, recepción del bloqueo y acuse perdido/desconexión conforme al diseño que se apruebe.
  - **Commit:** `feat(server): conserva la sesión al revocar una PC`.
  - **Consumo confirmado (mantenedor, 2026-10-07):** opción A, detener saldo/tiempo durante bloqueo por revocación confirmado. No modifica las reglas de desconexión normal.
  - **Recuperación confirmada (mantenedor, 2026-10-07):** opción A, misma PC/sesión con credencial nueva; bloqueo hasta autorización del personal permitido. Contratos de recuperación y confirmación temporal siguen pendientes; no autoriza implementar T34 ni ampliar la recuperación ordinaria de T12 a PCs ocupadas.
  - **Permisos confirmados (mantenedor, 2026-10-07):** opción A, encargado/administrador para revocar, revincular y autorizar continuar; dueño solo lee. ADR-0021, validación en nodo y eventos con actor; mecanismo pendiente.
  - **Entrega confirmada (mantenedor, 2026-10-07):** opción A, código ligado a la PC revocada, un uso y 600 s, generado en panel e introducido físicamente en su asistente. El servicio obtiene/custodia la credencial por TLS con nodo verificado, sin desbloquear ni abrir mantenimiento (ADR-0022). Desglosar contratos/nodo/asistente antes de implementar; probar caducidad, consumo concurrente, asociación, respuesta perdida según diseño aprobado y secreto ausente de panel/JavaScript. T12 conserva sus condiciones.
  - **Estado previo confirmado (mantenedor, 2026-10-07):** opción A, activa vuelve activa; pausada vuelve pausada con el tiempo que le quedaba. Durante bloqueo confirmado no se gasta ese tiempo ni otra pausa por sesión/día. Implementar y verificar REQ-002-33/CA-002-09, también con política de cierre al vencer y contadores diarios, después de diseñar intervalos en el nodo. No reanudar una pausa ni reiniciar sus límites por recuperar identidad.
  - **Diseño aprobado (mantenedor, 2026-10-22):** [diseno-t34.md](diseno-t34.md). Apps abiertas y audio sin tocar durante la retención; el uso sin red no se cobra; no se revoca con mantenimiento u orden en curso. Se hace después de T42. Pasos en la [guía](guia-t33-t42.md#t34--revocación-conservando-la-sesión).
  - [ ] **T34a:** contratos de revocar/continuar, eventos y `state: held`.
  - [ ] **T34b:** tabla `session_holds`.
  - [ ] **T34c:** `POST /pcs/:pcId/revoke` y cierre de la conexión viva.
  - [ ] **T34d:** sin cobro, latidos ni vencimiento de pausa durante la retención.
  - [ ] **T34e:** revincular con código de recuperación sin soltar la retención.
  - [ ] **T34f:** `POST /pcs/:pcId/continue` y cierre de la sesión retenida.
  - [ ] **T34g:** agente y host conservan la sesión retenida.
  - [ ] **T34h:** pantalla de PC retenida en el Shell.
  - [ ] **T34i:** revocar, código de recuperación y autorizar continuar en el panel.

- [x] **T35: Autorización técnica local y remota**
  - **Cubre:** REQ-003-40, REQ-003-41, REQ-003-43.
  - **Hacer:** validar encargado/administrador en el nodo sin crear cookie del panel; reservar PC y emitir autorización específica; aplicar la regla de sesión previa que se apruebe para entrada local.
  - **Verificar:** dueño/inactivo/contraseña errónea, carreras con login y entrada remota con activa/pausada; fallo de preparación no registra mantenimiento iniciado.
  - **Commit:** `feat(server): autoriza el mantenimiento de PCs`.
  - **División (2026-10-22):** solo el nodo; hasta T37 el agente real responde `invalid_action`. [Guía](guia-t33-t42.md#t35--autorización-técnica-local-y-remota).
  - [x] **T35a:** `TechnicalAuthService.verify` sin cookie (dueño, inactivo, contraseña).
  - [x] **T35b:** `PcMaintenanceService`, inicio registrado al confirmarse, `startMaintenance` desde el panel y `maintenanceState` tras `hello`.
  - [x] **T35c:** `technicalLogin` local desde la PC, con la PC libre comprobada antes de la contraseña.

- [x] **T36: Diez fallos técnicos y aviso al panel**
  - **Cubre:** REQ-003-45; CA-003-10.
  - **Hacer:** aplicar por cuenta 10 fallos consecutivos, bloqueo de 60 s, reset por éxito/vencimiento y un evento/aviso por bloqueo; mantener intacto login del panel.
  - **Verificar:** intentos desde varias PCs, concurrencia en décimo fallo, reinicio del nodo, éxito intermedio y un solo aviso; sin enumeración de cuentas ni contraseñas en logs.
  - **Commit:** `feat(server): limita los intentos del login técnico`.
  - **División (2026-10-22):** aviso a los paneles conectados y a los que se conectan durante el bloqueo. [Guía](guia-t33-t42.md#t36--diez-fallos-técnicos-y-aviso-al-panel).
  - [x] **T36a:** contador por cuenta, bloqueo de 60 s y evento único.
  - [x] **T36b:** mensaje `technicalLoginLocked` del canal del panel.

- [ ] **T37: Entrada administrativa nativa**
  - **Cubre:** REQ-003-40, REQ-003-41, REQ-003-43.
  - **Hacer:** integrar el mecanismo demostrado en T10 y la autorización T35; iniciar entorno de la cuenta Windows existente y confirmar entrada física al nodo.
  - **Verificar:** elevación real, perfil/procesos separados, contraseña Windows cambiada, nodo ausente y preparación fallida; WebView2/cliente sin privilegios nuevos.
  - **Commit:** `feat(native): abre el mantenimiento autorizado de Windows`.
  - **Bloqueada (2026-10-22):** espera a demostrar T10. Completará `closeSession` de T40b, el `applied` de `startMaintenance` y la prueba real de la pestaña de T38b.

- [ ] **T38: Formulario y pestaña técnica**
  - **Cubre:** REQ-003-40, REQ-003-42, REQ-003-43.
  - **Hacer:** añadir login técnico local del Shell y pestaña plegada central del entorno de mantenimiento; mostrar PC/actor y Terminar y bloquear, sin tiempo transcurrido.
  - **Verificar:** roles/errores, paso del ratón, controles no tapados y salida local/remota; no introducir contraseñas Windows en React ni elevar WebView2.
  - **Commit:** `feat(shell-ui): muestra el acceso y los controles técnicos`.
  - **División (2026-10-22):** se hace después de T40; queda abierta hasta probarla en la sesión real (T37). [Guía](guia-t33-t42.md#t38--formulario-y-pestaña-técnica-shell).
  - [ ] **T38a:** enlace y formulario «Usuario técnico» en la pantalla de bloqueo.
  - [ ] **T38b:** pestaña «Técnico» plegada con «Terminar y bloquear», sin tiempo.

- [ ] **T39: Conciliación de salida técnica en el nodo**
  - **Cubre:** REQ-003-41, REQ-003-43, REQ-003-44; CA-003-09.
  - **Hacer:** validar reporte contra autorización/PC, persistir salida/actor/duración y emitir evento una vez; responder ACK idempotente y liberar reserva tras estado bloqueado confirmado.
  - **Verificar:** reportes falsificados, ACK perdido, duplicados/concurrencia y reconexión con salida pendiente; no conservar rojo ni reabrir mantenimiento por un snapshot obsoleto.
  - **Commit:** `feat(server): concilia la salida técnica pendiente`.
  - **División (2026-10-22):** incluye T30b. [Guía](guia-t33-t42.md#t39--conciliación-de-la-salida-técnica-en-el-nodo).
  - [ ] **T39a:** `maintenanceExit` local: registro único, duración acotada, ACK y bloqueo de sistema.
  - [ ] **T39b:** `endMaintenance` desde el panel.
  - [ ] **T39c:** reiniciar o apagar con mantenimiento (cierra T30b).

- [ ] **T40: Salida técnica nativa durable**
  - **Cubre:** REQ-003-41, REQ-003-43, REQ-003-44; CA-003-09.
  - **Hacer:** terminar procesos propios de mantenimiento, bloquear localmente, persistir salida antes de perderla y reenviar al nodo hasta ACK; registrar actor/duración una sola vez.
  - **Verificar:** LAN perdida conserva mantenimiento, salida funciona offline, reinicio durante cada etapa, ACK perdido/duplicado y cola acotada sin descartar auditoría pendiente.
  - **Commit:** `feat(native): conserva la salida del mantenimiento sin red`.
  - **División (2026-10-22):** solo lo independiente de T37; queda abierta hasta T37. [Guía](guia-t33-t42.md#t40--salida-técnica-nativa-durable).
  - [ ] **T40a:** diario protegido de salidas (16 como mucho).
  - [ ] **T40b:** terminar y bloquear sin red, reenvío hasta el ACK.

- [ ] **T41: Controles y mantenimiento en el mapa**
  - **Cubre:** REQ-003-20, REQ-003-21, REQ-003-22, REQ-003-43; CA-003-07.
  - **Hacer:** activar controles existentes en `apps/panel`, resultados/errores/confirmaciones y rojo técnico con actor; mantener gris, verde, celeste, ámbar y morado según estado aprobado.
  - **Verificar:** permisos, doble clic, estado cambiado, pérdida de tiempo temporal y desconexión; comprobación manual del mapa y tests de la lógica/ApiClient.
  - **Commit:** `feat(panel): controla las PCs y muestra el mantenimiento`.
  - **División (2026-10-22):** «Bloquear» pide confirmación siempre (mantenedor). [Guía](guia-t33-t42.md#t41--controles-y-mantenimiento-en-el-mapa-panel).
  - [ ] **T41a:** `maintenance`, `canWake` y `order` en el mapa; `GET /pcs/:pcId/commands/:commandId`.
  - [ ] **T41b:** lógica de acciones, confirmaciones, errores y encendido, con tests.
  - [ ] **T41c:** controles, diálogos, baldosa roja y aviso de encendido; prueba manual.

- [ ] **T42: Registro de PCs y alertas técnicas en panel**
  - **Cubre:** REQ-003-10, REQ-003-45.
  - **Hacer:** añadir generación/caducidad de códigos para encargado/administrador y aviso técnico de T36; presentar códigos solo en el flujo de instalación, sin guardarlos en logs.
  - **Verificar:** dueño sin generación, caducidad de 10 min y una alerta por bloqueo; prueba manual de pantallas y validación de respuestas.
  - **Commit:** `feat(panel): registra PCs y avisa de bloqueos técnicos`.
  - **División (2026-10-22):** «Añadir PC» en el mapa y «Volver a registrar» en el detalle (mantenedor). [Guía](guia-t33-t42.md#t42--registro-de-pcs-y-alertas-técnicas-panel).
  - [ ] **T42a:** diálogo del código de instalación con cuenta atrás.
  - [ ] **T42b:** aviso del bloqueo técnico.

### Fondo global

- [ ] **T43: Almacenamiento y endpoints del fondo**
  - **Cubre:** REQ-003-70, REQ-003-71, REQ-003-72, REQ-003-75, REQ-003-76.
  - **Hacer:** subir WebP binario, validar contenido/dimensiones/límite, guardar por hash y emitir cambio; servir descarga autenticada y metadatos al conectar, con archivos/streaming acotados.
  - **Verificar:** roles, archivo falso/corrupto, hash, cambio/eliminación transaccionales y rollback sin evento huérfano; no duplicar parser WebP ni ampliar límite de 512 KB de productos.
  - **Commit:** `feat(server): distribuye el fondo global de bloqueo`.

- [ ] **T44: Editor de fondo en el panel**
  - **Cubre:** REQ-003-70, REQ-003-76.
  - **Hacer:** crear `/fondo-de-bloqueo`, aceptar JPG/PNG/WebP hasta 10 MB, reducir sin deformar a 1920×1080 y WebP hasta 2 MB; vista previa y volver al fondo por defecto.
  - **Verificar:** administrador únicamente, formatos/límites, imágenes verticales/grandes y error de compresión; no procesar imágenes en el nodo.
  - **Commit:** `feat(panel): configura el fondo global de bloqueo`.

- [ ] **T45: Descarga y caché nativa del fondo**
  - **Cubre:** REQ-003-72, REQ-003-73, REQ-003-74, REQ-003-75.
  - **Hacer:** descargar con credencial del agente, progreso y reintentos acotados; comprobar SHA-256, guardar temporal y sustituir atómicamente, distinguiendo revisión descargada/aplicada.
  - **Verificar:** corte, hash erróneo, disco lleno, nueva revisión durante descarga y reinicio; conservar copia anterior y funcionamiento offline.
  - **Commit:** `feat(native): descarga y conserva el fondo de bloqueo`.

- [ ] **T46: Fondo y progreso en el Shell**
  - **Cubre:** REQ-003-73, REQ-003-74, REQ-003-75; CA-003-04, CA-003-05.
  - **Hacer:** mostrar fondo local y progreso por el puente; mantener imagen durante uso y aplicar revisión al volver al bloqueo; retirada restaura el fondo por defecto.
  - **Verificar:** login disponible durante descarga, sesión sin interrupción, eliminación y nodo ausente; comprobación manual en WebView2.
  - **Commit:** `feat(shell-ui): aplica el fondo local sin interrumpir sesiones`.

- [ ] **T47: Simulación de control y fallos del protocolo**
  - **Cubre:** REQ-003-20, REQ-003-41, REQ-003-44, REQ-003-72.
  - **Hacer:** extender simulador/tests con acuses, fallos, mantenimiento y cambios de fondo para verificar el nodo; identificar resultados simulados como tales.
  - **Verificar:** ACK duplicado, perdido, tardío, desconexión y reconexión; la simulación no se presenta como prueba de bloqueo/audio/energía de Windows.
  - **Commit:** `test(tools): simula órdenes y fallos del cliente Windows`.

### Instalación y recuperación

- [ ] **T48: Paquete Windows con runtime offline**
  - **Cubre:** REQ-003-50, REQ-003-62.
  - **Hacer:** empaquetar artefactos precompilados, Shell y runtime Evergreen completo offline; fijar herramienta del instalador y detección de versión conforme al plan/ADR aprobados.
  - **Verificar:** instalación sin internet, runtime ausente/presente y plataforma no compatible; nada se compila ni se instala como dependencia de cliente en el nodo.
  - **Commit:** `build(native): empaqueta el cliente Windows sin conexión`.

- [ ] **T49: Usuario restringido y manifiesto de instalación**
  - **Cubre:** REQ-003-01, REQ-003-50, REQ-003-51.
  - **Hacer:** crear la cuenta cliente limitada y manifiesto de cambios/valores previos; detectar instalación existente y conflicto de cuenta sin reutilizar privilegios administrativos.
  - **Verificar:** permisos, reejecución, interrupción y conflicto; conservar la cuenta administradora existente y sus datos.
  - **Commit:** `feat(native): prepara la cuenta restringida de Pope`.

- [ ] **T50: Servicio, shell, autologin y directivas**
  - **Cubre:** REQ-003-01, REQ-003-02, REQ-003-03, REQ-003-31, REQ-003-50.
  - **Hacer:** aplicar solo cambios aprobados del instalador: servicio antes de login, shell Pope, autologin protegido y opciones de Ctrl+Alt+Supr recortadas por usuario.
  - **Verificar:** arranque frío sin Explorer, usuario técnico sin restricciones del cliente y opciones reales de Ctrl+Alt+Supr; registrar/restaurar valores previos por etapa.
  - **Commit:** `feat(native): configura el arranque bloqueado de Windows`.

- [ ] **T51: Asistente de registro y configuración local**
  - **Cubre:** REQ-003-10, REQ-003-22, REQ-003-50, REQ-003-63.
  - **Hacer:** configurar nodo fijo/certificado, código, NIC/MAC y cuenta Windows existente en instalación local; entregar secretos solo al servicio con protección acordada.
  - **Verificar:** código caducado/consumido, respuesta perdida, varias NIC, certificado falso y cambio externo de contraseña; no solicitar credenciales por chat ni enviarlas al nodo.
  - **Commit:** `feat(native): configura y registra la PC durante la instalación`.

- [ ] **T52: Desinstalación y rollback por etapas**
  - **Cubre:** REQ-003-51.
  - **Hacer:** restaurar shell/autologin/directivas previos, retirar recursos creados por Pope y resolver instalación parcial desde el manifiesto; preservar datos/cuenta administrativa preexistentes.
  - **Verificar:** instalación interrumpida en cada etapa, desinstalación repetida y Windows recuperado sin residuos de políticas; probar únicamente en VM/PC desechable.
  - **Commit:** `feat(native): restaura Windows al desinstalar Pope`.

- [ ] **T53: Diseño aprobado del acceso de emergencia**
  - **Cubre:** acuerdo del mantenedor sobre recuperación sin nodo; requisito nuevo pendiente en las preguntas de la spec 003.
  - **Hacer:** con las reglas de uso cerradas en ADR-0024 a ADR-0028, redactar únicamente el ADR del mecanismo de recuperación: ruta administrativa, aislamiento/salida, captura sin agente, persistencia acotada y envío idempotente de cuenta Windows/PC/entrada/salida UTC. Concretar contrato/actor y salida no observada; dejar identificada la alineación documental posterior necesaria.
  - **Verificar:** revisión del mantenedor, intervención local delante de la PC sin entrada remota de emergencia, amenaza de congelador/clonación y ruta independiente del servicio muerto; no equiparar emergencia con login técnico offline ordinario.
  - **Commit:** `docs(adr): propone la recuperación de emergencia de Pope`.

- [ ] **T54: Acceso de emergencia según el ADR aceptado**
  - **Cubre:** requisito de emergencia que se apruebe en T53; REQ-003-03, REQ-003-51 en la vuelta al bloqueo/restauración.
  - **Hacer:** implementar únicamente el mecanismo aprobado tras alinear spec/plan en tareas documentales separadas; ajustar/dividir esta reserva tras cerrar T53, sin inventar credenciales offline.
  - **Verificar:** sin nodo y servicio incapaz de arrancar, emergencia presencial de administrador/encargado con credenciales Windows manuales y Windows completo aislado del cliente conforme a ADR-0024 a ADR-0028. Auditoría automática por cuenta Windows/PC/entrada/salida UTC, sin nombre ni motivo; persistencia ante cortes y envío sin duplicados, sin atribuir persona/rol Pope no verificados. Rechazar entrada remota y credenciales incorrectas; comprobar salida/reparación, WebView2 restringido, cobro en el nodo y vuelta al bloqueo.
  - **Commit:** `feat(native): permite la recuperación de emergencia autorizada`.

### Verificación y revisión del mantenedor

- [ ] **T55: Verificación integrada en VM**
  - **Cubre:** REQ-003-01, REQ-003-02, REQ-003-03, REQ-003-04, REQ-003-31, REQ-003-32, REQ-003-50, REQ-003-51; REQ-002-31; CA-003-01, CA-003-02.
  - **Hacer:** ejecutar instalación, arranque, muerte del host/servicio, falta de nodo, recuperación y rollback sobre snapshots; iniciar `mediciones.md` con versiones y evidencia por caso.
  - **Verificar:** ausencia de Explorer, < 3 s de recuperación del host y restauración reversible; no usar la VM para aprobar juego exclusivo, audio o anticheat.
  - **Commit:** `docs(specs): registra la verificación del cliente Windows en VM`.

- [ ] **T56: Juegos, pausa, audio y cierre en PC real**
  - **Cubre:** REQ-003-30, REQ-003-32, REQ-003-33, REQ-003-34; REQ-002-04, REQ-002-05, REQ-002-07, REQ-002-30, REQ-002-50; CA-002-02, CA-003-08.
  - **Hacer:** probar los ocho juegos del inventario con versión, anticheat, modo de pantalla, monitores/audio; registrar bloqueo, pausa/reanudación, LAN cortada y cierre sin reinicio.
  - **Verificar:** ninguna tecla/clic al juego pausado, audio restaurado, procesos intactos en pausa y cerrados al finalizar; máximo y distribución de latencia < 1 s, no solo promedio.
  - **Commit:** `docs(specs): verifica el bloqueo y la pausa con juegos reales`.
  - **Acceso confirmado (2026-10-07):** probar CA-003-12 con cuenta/temporal, foco en Pope, juegos exclusivos y ausencia de escape desde pausa/revocación, sin Explorer.

- [ ] **T57: Recursos y latencia de la LAN del local**
  - **Cubre:** REQ-003-60, REQ-003-61; ADR-0011, ADR-0016.
  - **Hacer:** medir agente < 50 MB y total de instancias del host < 60 MB excluyendo WebView2, registrar Chromium aparte; probar 13 PCs/reintentos y ejecución prolongada en el i3-2120.
  - **Verificar:** llegada de comando < 1 s desde confirmación del panel, Node ≤ 384 MB y Pope ~1 GB; buffers/journals/temporizadores sin crecimiento ilimitado y batería PG real verde.
  - **Commit:** `docs(specs): mide los recursos del cliente Windows y nodo local`.

- [ ] **T58: Operación del panel, mantenimiento y fondo en LAN real**
  - **Cubre:** REQ-003-10, REQ-003-11, REQ-003-20, REQ-003-21, REQ-003-22, REQ-003-40, REQ-003-41, REQ-003-42, REQ-003-43, REQ-003-44, REQ-003-45, REQ-003-70, REQ-003-71, REQ-003-72, REQ-003-73, REQ-003-74, REQ-003-75, REQ-003-76; CA-003-03, CA-003-04, CA-003-05, CA-003-06, CA-003-07, CA-003-09, CA-003-10, CA-003-11.
  - **Hacer:** comprobar roles/códigos, revocación, mantenimiento con cuenta existente/corte de LAN, aviso técnico, Wake-on-LAN y fondo en 10 conectadas/2 apagadas; incluir la PC técnica.
  - **Verificar:** salida offline una sola vez, técnico rojo con actor y sin tiempo, WOL a 120 s, actualización tardía y login durante descarga; registrar fallos sin declarar criterios cumplidos.
  - **Commit:** `docs(specs): verifica la operación del cliente Windows en el local`.

- [ ] **T59: Revisión y cierre de la spec 003 y pausa nativa**
  - **Cubre:** CA-003-01, CA-003-02, CA-003-03, CA-003-04, CA-003-05, CA-003-06, CA-003-07, CA-003-08, CA-003-09, CA-003-10, CA-003-11; CA-002-02.
  - **Hacer:** entregar informe trazable y límites al mantenedor; tras aprobación explícita, cerrar 003 y fase 2 de pausa y actualizar `ESTADO.md` sin declarar lista blanca/perfiles 004 completos.
  - **Verificar:** revisión del mantenedor, todos los criterios demostrados y requisitos de emergencia aprobados/probados; checks TS/nativos y PG real en verde antes de entrega al local.
  - **Commit:** `docs(specs): cierra el cliente Windows tras la revisión del mantenedor`.
  - **Ampliación confirmada (2026-10-07):** incluir REQ-002-33/CA-002-09 de T34 en el informe y revisión; no declarar la excepción de pausa implementada por las pruebas anteriores de fase 1.
  - **Acceso confirmado (2026-10-07):** incluir CA-003-12 y evidencia T09/T21/T25/T56 en la revisión.

## Decisiones pendientes antes de ejecutar

- **T01:** base ADR-0017, canal v2 y recuperación de registro confirmados; **T02:** cerrar contratos que dependan de reglas aún abiertas; **T08:** host WinForms confirmado (ADR-0019); versiones de SDK, herramientas de tests y soporte del Windows real pendientes.
- **T25:** Alt+Tab confirmado con cuenta/temporal, también al enfocar Pope (ADR-0023); selector sin Explorer y juegos pendientes de prueba. **T32:** presentación, foco, duración y estados de mensajes.
- **T12:** recuperación confirmada mediante código nuevo ligado a la misma PC libre/sin mantenimiento; comprobar disponibilidad tanto al emitir como al consumir.
- **T34:** consumo detenido, misma PC/sesión con credencial nueva, encargado/administrador, código local de un uso/600 s y regreso al estado previo con pausa conservada confirmados (opciones A, ADR-0020/0021/0022, REQ-002-33); pendientes contratos/prueba del asistente y confirmación temporal, sin cierre accidental por latidos.
- **T35:** entrada técnica local con sesión/pausa; la remota ya exige cierre separado previo.
- **T53/T54:** reglas de uso cerradas en ADR-0024 a ADR-0028, incluida auditoría automática por cuenta Windows/PC/entrada/salida UTC sin nombre ni motivo. Mecanismo de captura/persistencia/envío independiente del agente, contrato/actor, salida no observada, comprobación local y ruta administrativa/aislamiento pendientes de diseño, aprobación y prueba.
- **T48–T58:** Windows Pro (12 con 10 22H2, una con 11 25H2) y ausencia de congelador confirmados; NIC/monitores/versiones de juegos y pruebas de compatibilidad/persistencia pendientes. No modificar el Windows cotidiano para probar.
