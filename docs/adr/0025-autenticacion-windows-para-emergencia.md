# ADR-0025: Autenticación de emergencia con la cuenta Windows existente

- **Estado:** Aceptado para autenticación (mantenedor, 2026-10-07); mecanismo pendiente
- **Fecha:** 2026-10-07
- **Relacionado:** ADR-0006, ADR-0018, ADR-0024, spec 003 (T53/T54)

## Contexto

La emergencia exige presencia física en la PC afectada (ADR-0024) y debe permitir
recuperar Pope sin nodo incluso si el servicio no arranca. Para autenticarse se
comparó usar las credenciales de la cuenta administradora Windows existente con
introducir una clave de emergencia propia de Pope por PC.

## Decisión

El mantenedor elige A: la persona introduce físicamente en la PC las credenciales
de la cuenta administradora local Windows existente. La validación de esa identidad
corresponde a Windows; no exige respuesta del nodo ni del servicio del agente.
No se crea una clave de emergencia propia de Pope para esta entrada.

La contraseña se introduce en la ruta administrativa que se apruebe; no se envía
al nodo ni al Shell React, ni se registra en logs. La entrada de emergencia requiere
introducción manual, sin reutilizar automáticamente un secreto custodiado por el agente.

Esta elección complementa ADR-0024 y es independiente del mantenimiento ordinario
autorizado por el nodo, cuyo mecanismo continúa propuesto en ADR-0018. No aprueba
la elevación, custodia ni apertura remota descritas en esa propuesta.

## Alternativas consideradas

- **Clave de emergencia propia de Pope por PC:** añade una credencial que custodiar,
  renovar y recuperar, además de resolver los permisos administrativos de Windows.
  El mantenedor elige reutilizar la identidad Windows existente.

## Consecuencias

- La persona que intervenga necesita conocer las credenciales válidas de esa cuenta.
- T53 aún debe definir quién está autorizado a usarlas, qué permite la emergencia
  y cómo identifica y audita a quien interviene. Una cuenta Windows compartida no
  identifica por sí sola a una persona del personal de Pope.
- Diseñar y probar la ruta administrativa independiente del agente, su aislamiento,
  salida y vuelta al bloqueo; comprobar cuenta y directivas en el Windows real.
- T53/T54 siguen pendientes; no se configura ninguna cuenta ni se implementa el acceso.

Referencia: [cuentas locales de Windows](https://learn.microsoft.com/en-us/windows/security/identity-protection/access-control/local-accounts).
