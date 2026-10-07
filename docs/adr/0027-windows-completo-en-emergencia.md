# ADR-0027: Windows completo para reparar en emergencia

- **Estado:** Aceptado para alcance (mantenedor, 2026-10-07); mecanismo pendiente
- **Fecha:** 2026-10-07
- **Relacionado:** ADR-0006, ADR-0007, ADR-0009, ADR-0018, ADR-0024, ADR-0025, ADR-0026, spec 003 (T53/T54)

## Contexto

La emergencia presencial está permitida al administrador y al encargado, mediante
credenciales manuales de la cuenta administradora local Windows existente. Debe
servir sin nodo incluso si el servicio del agente no arranca. Se comparó abrir Windows
completo para reparar con ofrecer un asistente limitado a acciones sobre Pope.

## Decisión

El mantenedor elige A: tras autenticarse en la ruta de emergencia aprobada, la persona
autorizada puede acceder a Windows completo bajo la identidad administradora existente
para reparar Pope, red, controladores u otros fallos del equipo.

Se conservan presencia física, credenciales manuales y permisos de ADR-0024/0025/0026.
El entorno administrativo queda separado del acceso del cliente; el host WebView2 y
la cuenta cliente conservan sus privilegios restringidos. El nodo sigue siendo la
fuente de verdad de sesiones, tiempo y saldo (ADR-0007).

## Alternativas consideradas

- **Asistente limitado a reparar Pope:** guía acciones concretas, pero necesita más
  desarrollo y puede quedarse corto ante fallos de Windows, red o controladores.
  El mantenedor elige las herramientas habituales de Windows completo.

## Consecuencias

- Administrador y encargado tienen capacidad amplia para modificar el equipo durante
  la reparación; la identificación de la persona y la auditoría siguen por decidir.
- T53 debe aprobar la ruta administrativa independiente del servicio, su aislamiento,
  salida, recuperación tras reinicio y vuelta al bloqueo antes de habilitar clientes.
- La elección no aprueba el mecanismo ordinario propuesto en ADR-0018 ni demuestra
  compatibilidad. T53/T54 siguen pendientes de diseño y prueba en VM/PC de pruebas.
- No se implementa código ni se modifican cuentas o directivas de Windows en esta decisión.
