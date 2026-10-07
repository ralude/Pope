# ADR-0026: Permisos del acceso de emergencia

- **Estado:** Aceptado para permisos (mantenedor, 2026-10-07); mecanismo pendiente
- **Fecha:** 2026-10-07
- **Relacionado:** ADR-0018, ADR-0024, ADR-0025, spec 003 (T53/T54)

## Contexto

La emergencia exige presencia física y las credenciales manuales de una cuenta
administradora Windows existente, sin nodo ni servicio del agente. Faltaba decidir
quién puede usarlas: solo el administrador o también el encargado.

## Decisión

El mantenedor elige B: administrador y encargado están autorizados a utilizar las
credenciales Windows para la emergencia presencial. Ambos necesitan conocer las
credenciales válidas del equipo afectado conforme a ADR-0025.

La autorización es la política de uso de esa ruta. Windows valida la cuenta local;
no se da por verificado un rol vigente de Pope sin respuesta del nodo. T53 debe
concretar cómo identifica y audita a quien interviene, especialmente si comparten
la misma cuenta Windows. No se crea un login offline del personal de Pope.

## Alternativas consideradas

- **Solo administrador:** limita quién conoce la contraseña, pero obliga a contar
  con su disponibilidad. El mantenedor permite también al encargado resolver averías.

## Consecuencias

- El encargado puede intervenir presencialmente sin esperar al administrador.
- La custodia por las personas autorizadas y su identificación deben reflejarse en
  el diseño y guía de operación; no se solicitan ni guardan contraseñas en los documentos.
- Quedan por decidir alcance e identificación/auditoría y por aprobar y probar la
  ruta administrativa independiente del agente. T53/T54 no están completas.
- Se conserva el mantenimiento ordinario validado por el nodo y la propuesta de
  ADR-0018; este permiso no aprueba su mecanismo ni cambia cuentas de Windows.
