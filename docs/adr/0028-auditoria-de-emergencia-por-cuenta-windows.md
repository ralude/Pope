# ADR-0028: Auditoría de emergencia por cuenta Windows

- **Estado:** Aceptado para auditoría (mantenedor, 2026-10-07); mecanismo pendiente
- **Fecha:** 2026-10-07
- **Relacionado:** ADR-0008, ADR-0024, ADR-0025, ADR-0026, ADR-0027, spec 003 (T53/T54)

## Contexto

Administrador y encargado pueden entrar presencialmente a Windows completo para
reparar, con credenciales manuales de la cuenta administradora existente. Se comparó
pedir nombre y motivo con registrar únicamente la cuenta Windows, PC y entrada/salida.

## Decisión

El mantenedor elige B: registrar automáticamente la cuenta Windows autenticada,
la PC afectada y las fechas UTC de entrada y salida. No pedir nombre de la persona,
usuario de Pope ni motivo como campos adicionales para entrar.

Guardar el registro de forma durable en la PC y enviarlo al nodo cuando esté
disponible, sin duplicarlo. La captura debe funcionar aun sin nodo y con el servicio
incapaz de arrancar; el mecanismo independiente del agente se concretará en T53.

La evidencia identifica la cuenta Windows utilizada. Si la comparten administrador
y encargado, no distingue qué persona intervino ni prueba un rol vigente de Pope.
El contrato de eventos y su actor deben conservar esa distinción según ADR-0008;
no atribuir la intervención a una cuenta personal de Pope que no se ha validado.

## Alternativas consideradas

- **Pedir nombre y motivo:** añade contexto declarado por la persona, sin validación
  de su cuenta Pope offline. El mantenedor prefiere el registro automático por cuenta Windows.

## Consecuencias

- Las decisiones de uso de emergencia quedan resueltas en ADR-0024 a ADR-0028.
- T53 debe diseñar y aprobar captura, persistencia acotada, envío idempotente y actor,
  además de ruta administrativa, aislamiento, salida y vuelta al bloqueo.
- Reinicios y fallos pueden impedir observar una salida: concretar su representación
  y recuperación sin inventar una hora ni presentar un cierre confirmado sin evidencia.
- La prueba debe demostrar persistencia sin agente, ante cortes de luz y con el
  congelador real del local. T53/T54 siguen pendientes; no se implementa el acceso.
