# ADR-0024: Presencia física para el acceso de emergencia

- **Estado:** Aceptado para presencia física (mantenedor, 2026-10-07); mecanismo pendiente
- **Fecha:** 2026-10-07
- **Relacionado:** ADR-0006, ADR-0007, ADR-0009, ADR-0018, spec 003 (T53/T54)

## Contexto

El mantenedor solicita una recuperación de emergencia sin nodo, incluso cuando el
servicio del agente no arranca. Antes de diseñar su autenticación y alcance se
comparó exigir intervención física en la PC con permitir también recuperación remota.

## Decisión

El mantenedor elige A: el acceso de emergencia exige que una persona autorizada esté
físicamente delante de la PC afectada e intervenga allí. No se incorpora una entrada
remota de emergencia. La presencia física es una condición adicional a autenticarse;
no basta con conocer un atajo o estar delante del equipo.

T53 debe concretar autenticación, permisos, alcance, auditoría y cómo exigir esa
intervención local aun sin nodo y con el servicio incapaz de arrancar. La decisión
no aprueba todavía credenciales, componentes ni un mecanismo de Windows.

## Alternativas consideradas

- **Permitir también emergencia remota:** facilita intervenir a distancia, pero exige
  diseñar otro canal disponible cuando faltan el nodo o el agente. No fue elegida.

## Consecuencias

- La recuperación necesita a una persona en el local y delante del equipo afectado.
- La entrada de emergencia se verificará junto con el fallo completo del servicio;
  la UI del Shell o un pipe del agente por sí solos no demuestran esa independencia.
- Sigue siendo un flujo distinto del mantenimiento ordinario autorizado por el nodo
  y de la recuperación de identidad de una PC revocada. El cobro sigue en el nodo.
- T53/T54 continúan pendientes, sin implementación ni cambios en cuentas de Windows.
