# Spec 008: Migración de clientes desde SENET

- **Estado:** Borrador
- **Fecha:** 2026-09-25
- **ADRs relacionados:** ADR-0014
- **Specs relacionadas:** 001

## Problema

El local usa SENET desde hace unos 3 años, con combos sin vencimiento. Muchos clientes
tienen **saldo y horas de combo pendientes**, y algunos vuelven meses después. Al cambiar
a Pope no se puede perder ni un minuto de lo que cada cliente ya pagó, y el dueño necesita
pruebas de lo que se migró.

## Qué se sabe de SENET

- Tiene una **API** que permite descargar los usuarios y sus datos (contacto, última
  visita, dinero gastado, saldo de la cuenta).
- Su documentación indica que, en sus propias migraciones, solo traslada el **saldo en
  dinero** y no otros tipos de saldo. **Hay que confirmar si la API o sus reportes
  exponen las horas de paquetes/combos.**
- Las contraseñas no se pueden migrar (SENET no las entrega, y no debe hacerlo).

## Actores

- **Administrador del local:** ejecuta la importación y revisa el resultado.
- **Encargado:** migra a mano los casos que no entren en la importación.
- **Cliente:** establece una contraseña nueva la primera vez.
- **Dueño:** revisa el informe de migración.

## Estrategia propuesta (de mejor a peor)

1. **Importación masiva por la API de SENET:** un script lee usuarios, saldo y (si es
   posible) horas de combo, y genera un archivo de importación para Pope.
2. **Importación masiva por CSV:** si la API no da todo, se exportan los reportes del
   panel de SENET y se completan en una hoja de cálculo con una plantilla de Pope.
3. **Migración "cuando vuelva":** mientras SENET siga contratado, cuando un cliente no
   migrado vuelve, el encargado consulta su saldo en SENET y lo da de alta en Pope. Sirve
   de red de seguridad, no como plan principal.

Antes de cancelar SENET, se guarda una **instantánea final** (export o capturas) de todos
los clientes con saldo u horas, como prueba.

## Requisitos funcionales (borrador)

- **REQ-008-01:** El panel permite importar clientes desde un archivo con una plantilla definida: usuario, nombre, teléfono, saldo en USD y horas de combo.
- **REQ-008-02:** Antes de aplicar, la importación muestra una **vista previa** con errores (usuarios duplicados, importes inválidos) y los totales: clientes, saldo total y horas totales.
- **REQ-008-03:** El saldo y las horas importados entran como movimientos de tipo **"migración desde SENET"** con actor y fecha, nunca como un saldo editado (ADR-0014).
- **REQ-008-04:** Los clientes migrados no tienen contraseña. El encargado les da un **PIN temporal** y el cliente elige su contraseña en el primer inicio de sesión.
- **REQ-008-05:** Al terminar, se genera un **informe de migración** (clientes, saldo total, horas totales, discrepancias) visible para el dueño.
- **REQ-008-06:** Una misma importación no puede aplicarse dos veces (se detecta por el contenido del archivo).

## Fuera de alcance

- Migrar el historial de sesiones, las ventas o el inventario de SENET.
- Funcionar en paralelo con SENET en las mismas PCs.

## Preguntas abiertas

- [ ] ¿El plan de SENET del local incluye acceso a la **API**? ¿Quién tiene las credenciales de administrador?
- [ ] ¿La API o los reportes de SENET muestran las **horas de combo** pendientes de cada cliente?
- [ ] ¿Cuántos clientes con saldo u horas pendientes hay, aproximadamente?
- [ ] ¿Cuánto tiempo seguirá contratado SENET después de pasar a Pope?
