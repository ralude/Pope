# ADR-0014: Dos saldos por cuenta, dinero y horas de combo

- **Estado:** Aceptado
- **Fecha:** 2026-09-25
- **Relacionado:** ADR-0007, spec 001

## Contexto

- La tarifa por hora cambia según el día: lunes a miércoles 1,50 USD/h y jueves a
  domingo 2,00 USD/h.
- El local vende **combos** desde hace 3 años, p. ej. 20 USD = 20 horas. Con ellos la
  hora sale más barata (1,00 USD/h) y vale **cualquier día**, aunque cambie la tarifa.
- Los combos **no vencen**: quien compra 20 h y usa 2 debe tener 18 h aunque vuelva 6
  meses después.
- Si el combo se guardara como dinero (20 USD), un lunes solo daría 13 h 20 min. **El
  cliente compra tiempo, no saldo.**

## Decisión

Cada cuenta de cliente tiene **dos saldos independientes**:

| Saldo | Unidad | Se llena con | Se gasta |
|---|---|---|---|
| **Saldo en dinero** | USD (entero en unidad mínima) | recargas | a la tarifa del día |
| **Horas de combo** | segundos (entero) | compra de combos | tiempo real usado, cualquier día |

- **Orden de consumo:** primero las horas de combo; al agotarse, el saldo en dinero, sin
  cortar la sesión (igual que en SENET).
- **Ningún saldo se edita directamente.** Los dos se calculan a partir de **movimientos**
  inmutables (recarga, compra de combo, consumo, ajuste con motivo), igual que el stock
  (AGENTS.md). Así cualquier saldo se puede auditar hasta su origen.
- Cada compra de combo guarda una copia del precio y las horas del momento. Si después se
  cambia o se desactiva el combo, no afecta a las horas ya vendidas.
- Solo las cuentas tienen horas de combo. Las sesiones temporales usan la tarifa del día.
- La precisión del cobro por segundo del saldo en dinero se define en el plan de la spec
  001 (unidad interna menor que el céntimo o cálculo sobre el tiempo total de la sesión).

## Alternativas consideradas

- **Un solo saldo en dinero con tarifa rebajada por cuenta:** si alguien compra un combo
  y luego recarga dinero, ya no se sabe qué parte vale a qué tarifa.
- **Un solo saldo en tiempo:** con tarifas distintas según el día, convertir dinero a
  tiempo en el momento de recargar sería injusto (recargar un lunes y jugar un jueves).
- **Guardar cada combo como un lote con su propio consumo:** solo hace falta si los combos
  vencen o tienen restricciones. Hoy no es así, así que basta con un total de horas.

## Consecuencias

- ✅ El cliente ve y entiende sus horas de combo, que no cambian con la tarifa.
- ✅ El comportamiento es el mismo que el cliente ya conoce del sistema actual.
- ⚠️ Como los combos no vencen, se acumulan **horas vendidas y aún no usadas**. Es un
  compromiso del local con sus clientes, y la web del dueño debe mostrarlo (spec 006).
- ⚠️ Hay que migrar las horas pendientes de los clientes del sistema actual.
