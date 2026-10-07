# ADR-0020: Recuperación de PCs revocadas conservando la sesión

- **Estado:** Aceptado para el comportamiento descrito (mantenedor, 2026-10-07; opción A). Permisos y mecanismo pendientes.
- **Fecha:** 2026-10-07
- **Relacionado:** ADR-0007, ADR-0008, ADR-0017, spec 003 (REQ-003-11, T34)

## Contexto

El mantenedor confirmó que revocar una PC conserva su sesión y bloquea el acceso
cuando recibe la revocación. También eligió detener el consumo de saldo y tiempo
durante el bloqueo confirmado. Falta recuperar la PC sin perder la sesión ni volver
a confiar en la credencial revocada.

La recuperación ordinaria de una respuesta perdida de T12 exige una PC existente
libre y sin mantenimiento. La recuperación con una sesión conservada requiere un
flujo específico de T34, con autorización y contratos que aún deben concretarse.

## Decisión

Recuperaremos **la misma PC con una credencial nueva**, conservando la misma sesión.
La credencial revocada permanece invalidada. Obtener una nueva credencial o reconectar
no desbloquea por sí solo la PC: sigue bloqueada y sin consumo hasta que el encargado
autorice continuar desde el nodo.

El nodo mantiene la autoridad de sesión y cobro. Una PC sin red conoce la revocación
al reconectar; un fallo de transporte o certificado no se convierte en revocación.
Los cambios de estado se auditan con actor y evento según ADR-0008.

Esta decisión no fija permisos de revocación/revinculación, canales de entrega de la
nueva credencial, acuses ni corte temporal. Esos puntos y el regreso al estado de una
sesión previamente pausada deben resolverse antes de implementar T34. No se modifica
el contrato de T12 ni se autoriza aplicar su recuperación ordinaria sobre una PC ocupada.

## Alternativas consideradas

- **Cerrar la sesión y registrar de nuevo:** exige otra sesión del cliente y pierde
  el tiempo restante de una temporal conforme a REQ-001-69. El mantenedor elige
  conservar la sesión durante la recuperación.
- **Reactivar la credencial revocada:** contradice el reemplazo elegido y vuelve a
  confiar en un secreto que fue invalidado.

## Consecuencias

- La sesión conserva su identidad durante la revinculación; no se duplica la PC.
- La recuperación tiene dos pasos: restablecer identidad y autorizar continuar.
- La implementación necesita un flujo específico y pruebas de concurrencia, eventos,
  permisos y reconexión sin desbloqueo automático. T34 sigue en Borrador.
