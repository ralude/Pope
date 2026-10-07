# ADR-0021: Permisos de revocación y recuperación de PCs

- **Estado:** Aceptado (mantenedor, 2026-10-07; opción A)
- **Fecha:** 2026-10-07
- **Relacionado:** ADR-0008, ADR-0017, ADR-0020, spec 003 (REQ-003-11, T34)

## Contexto

ADR-0020 confirma recuperar la misma PC revocada con una credencial nueva y conservar
su sesión, manteniendo el bloqueo sin consumo hasta autorizar continuar. Sus permisos
quedaron pendientes. El encargado necesita poder resolver el incidente durante el turno,
sin depender de que esté disponible otro miembro del personal.

## Decisión

Los roles **encargado y administrador** pueden ejecutar las tres acciones desde el panel:

- Revocar la credencial de una PC.
- Autorizar la revinculación de la misma PC con una credencial nueva.
- Autorizar continuar la sesión conservada después de restablecer la identidad.

El nodo valida la sesión del personal y su rol para cada acción; ninguna autorización
se basa únicamente en ocultar un botón del panel. El dueño conserva acceso de lectura
y el cliente no puede ejecutar estas acciones. Cada cambio de estado genera un evento
con el actor correspondiente según ADR-0008.

Esta decisión complementa ADR-0020 sin cambiar su comportamiento. Revincular no
desbloquea automáticamente ni reactiva la credencial anterior. La entrega de la nueva
credencial, los contratos y la confirmación temporal siguen pendientes antes de T34.

## Alternativas consideradas

- **Revocar y revincular solo por administrador:** limita quién reemplaza la identidad,
  pero obliga al encargado a esperar al administrador para recuperar la PC. El
  mantenedor elige que ambos roles resuelvan el flujo completo.

## Consecuencias

- El encargado puede gestionar el incidente durante su turno; ambas autorizaciones
  siguen siendo acciones explícitas y auditadas por el nodo.
- T34 debe probar cada acción para ambos roles y rechazar dueño, cliente y peticiones
  sin sesión del personal, además de conservar las condiciones de ADR-0020.
- La elección de permisos no demuestra el mecanismo nativo ni aprueba implementar T34.
