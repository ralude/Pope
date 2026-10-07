# ADR-0022: Código local para recuperar la identidad de una PC revocada

- **Estado:** Aceptado para el flujo descrito (mantenedor, 2026-10-07; opción A). Contratos y prueba nativa pendientes.
- **Fecha:** 2026-10-07
- **Relacionado:** ADR-0017, ADR-0020, ADR-0021, spec 003 (REQ-003-11, REQ-003-63, T34)

## Contexto

La recuperación conserva la misma PC y sesión, reemplaza la credencial y mantiene el
bloqueo hasta autorización del personal. La credencial revocada ya no permite usar el
canal ordinario. Hace falta entregar la autorización de reemplazo al servicio de la PC.

## Decisión

El encargado o administrador genera en el panel un **código de recuperación ligado a
la PC revocada**, de **un uso y válido durante 10 minutos**. El personal acude a esa
PC y lo introduce en su asistente de recuperación. El servicio usa el código para
obtener y guardar la credencial nueva por conexión cifrada con el nodo verificado,
según ADR-0017. Requiere conexión LAN con el nodo.

El nodo conserva la identidad y sesión de la PC asociada; no crea otra PC ni permite
imponer su identidad por un mensaje del cliente. La credencial nueva queda bajo
custodia del servicio, sin mostrarse en panel ni entregarse al JavaScript del Shell.
La anterior continúa revocada. Introducir el código no desbloquea, no abre Windows
administrativo y no autoriza mantenimiento; se conserva el bloqueo sin consumo hasta
autorizar continuar según ADR-0020/0021.

Este flujo pertenece a T34 y se distingue de la recuperación ordinaria T12, que exige
PC existente libre/sin mantenimiento. Contratos, acceso al asistente y respuestas
perdidas deben diseñarse y probarse antes de implementar. No se amplía T12 por esta
decisión. La confirmación temporal y el estado previo pausado siguen abiertos.

## Alternativas consideradas

- **Recuperación totalmente remota:** requiere verificar la identidad de forma
  independiente de la credencial revocada. Añade complejidad; el mantenedor elige
  introducir la autorización físicamente en la PC.

## Consecuencias

- El personal necesita acudir a la PC para entregar la autorización.
- T34 debe probar caducidad de 600 s, consumo único/concurrente, asociación a la PC,
  roles, secreto anterior invalidado y ausencia de desbloqueo automático.
- El asistente y servicio deben permitir recuperar identidad manteniendo el bloqueo.
  La elección no sustituye la prueba nativa ni aprueba implementar T34.
