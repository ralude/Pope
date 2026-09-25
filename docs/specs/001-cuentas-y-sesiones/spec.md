# Spec 001: Cuentas y sesiones

- **Estado:** Borrador
- **Fecha:** 2026-09-25
- **ADRs relacionados:** ADR-0001, ADR-0007, ADR-0008
- **Specs relacionadas:** 002, 003, 006

## Problema

El local necesita que solo quien tenga saldo use una PC, que el tiempo se cobre con
exactitud y que quede registrado quién abrió cada sesión: el propio cliente o un
encargado. El dueño lo revisa desde España.

Muchos clientes no quieren crear una cuenta: pagan al encargado y usan la PC el tiempo
pagado. Como los cortes de luz son frecuentes, ese tiempo pagado no se puede perder
cuando se apaga todo.

## Actores

- **Cliente:** tiene cuenta y saldo; inicia sesión en la PC.
- **Encargado:** crea cuentas, recarga saldo y abre o cierra sesiones.
- **Administrador del local:** configura la tarifa y los encargados.
- **Sistema:** descuenta tiempo y cierra sesiones.

## Historias de usuario

- Como **cliente**, quiero iniciar sesión en cualquier PC con mi usuario para usar mi saldo.
- Como **encargado**, quiero crear una cuenta y recargarla en segundos desde el panel.
- Como **encargado**, quiero abrir una sesión en una PC para un cliente sin cuenta que paga y no quiere Crear Cuenta (Session temporal).
- Como **encargado**, quiero ponerle un nombre a cada sesión temporal para saber de quién es.
- Como **cliente sin cuenta**, quiero que si se va la luz me devuelvan el tiempo que me quedaba.
- Como **dueño**, quiero saber qué sesiones abrió cada encargado para detectar abusos.

## Requisitos funcionales

**Cuentas**

- **REQ-001-01:** Las cuentas de cliente solo se crean en el nodo local (desde el panel). La PC nunca crea ni guarda cuentas.
- **REQ-001-02:** Una cuenta debe tener usuario único y contraseña. Nombre y teléfono son opcionales.
- **REQ-001-03:** El encargado debe poder recargar saldo indicando importe y método de pago. La recarga queda asociada a su turno de caja (spec 005). El sistema **no verifica el pago**: el encargado lo comprueba por su cuenta (pago móvil, punto de venta o efectivo) y decide cuándo recargar.
- **REQ-001-04:** El encargado debe poder bloquear o desactivar una cuenta.

**Tarifas**

- **REQ-001-10:** Todas las PCs del local tienen la **misma tarifa**: un único precio por hora que configura el administrador. No hay categorías de PC (Normal, VIP, etc.).
- **REQ-001-11:** El saldo se guarda en **dinero**. Como la tarifa es única, saldo y tiempo son equivalentes: tiempo restante = saldo ÷ tarifa.
- **REQ-001-12:** El Shell muestra al cliente **los dos valores**, tiempo restante y saldo, y los actualiza mientras consume. Ejemplo con 1 USD/hora: empieza con 1,00 USD = 1:00:00 y, tras 30 min, ve 0,50 USD = 0:30:00.
- **REQ-001-13:** La tarifa, el saldo y las recargas están en **USD**. El Shell y el panel muestran primero el importe en USD y a su lado el equivalente en bolívares a la tasa BCV vigente (REQ-005-30).

**Sesiones**

- **REQ-001-20:** El cliente debe iniciar sesión en el Shell con usuario y contraseña. El nodo local valida y abre la sesión si hay saldo suficiente para al menos 1 minuto.
- **REQ-001-21:** Una cuenta solo puede tener **una** sesión activa a la vez.
- **REQ-001-22:** El encargado debe poder abrir una **sesión temporal** sin cuenta (ver "Sesiones temporales"). Queda registrado como actor.
- **REQ-001-23:** El cobro se calcula con el reloj del nodo local, por minuto (ADR-0007).
- **REQ-001-24:** El Shell debe avisar al cliente cuando le queden 5 minutos y 1 minuto.
- **REQ-001-25:** Al agotarse el saldo o el tiempo, la sesión se cierra y la PC se bloquea.
- **REQ-001-26:** El cliente puede cerrar su sesión desde el Shell. El encargado puede cerrar cualquier sesión desde el panel.
- **REQ-001-27:** Si una PC deja de enviar latidos más tiempo del de gracia (por defecto 3 min, configurable), el nodo cierra la sesión y cobra solo hasta el último latido.

**Sesiones temporales (sin cuenta)**

- **REQ-001-60:** El cliente puede pagar al encargado y usar una PC **sin crear cuenta**. El encargado abre la sesión temporal indicando el **tiempo** o el **importe** (el otro valor se calcula con la tarifa) y el método de pago. El cobro queda en su turno de caja (spec 005).
- **REQ-001-61:** El encargado puede ponerle un **nombre** (p. ej. "Carlos") para identificarla en el panel y en el Shell. Si no lo pone, se usa "Temporal · PC 05 · 18:30".
- **REQ-001-62:** La sesión temporal termina cuando se agota el tiempo pagado y la PC se bloquea (REQ-001-25).
- **REQ-001-63:** El nodo local guarda en disco el **tiempo restante** de cada sesión temporal en cada latido, como mínimo cada 30 s. El agente guarda además una copia en la propia PC. Así un corte de luz hace perder como mucho 30 s.
- **REQ-001-64:** El nodo local conserva un **respaldo de, como mínimo, las 3 últimas sesiones temporales de cada PC**, con: nombre, PC, tiempo pagado, tiempo restante según el último registro, importe, quién la abrió, hora de inicio, hora de fin y motivo de cierre. El administrador puede ampliar este número.
- **REQ-001-65:** El respaldo sobrevive a reinicios y cortes de luz del nodo local y de las PCs: se guarda en disco, nunca solo en memoria.
- **REQ-001-66:** Tras un corte, las sesiones temporales cerradas "sin latidos" (REQ-001-27) que tenían tiempo restante aparecen en el panel en **"Sesiones interrumpidas"**.
- **REQ-001-67:** El encargado puede **restaurar** una sesión interrumpida en la misma PC o en otra. La nueva sesión continúa con el tiempo restante, **sin nuevo cobro**, y queda enlazada a la original.
- **REQ-001-68:** Una sesión interrumpida solo se puede restaurar **una vez**. La restauración genera un evento con el actor, visible para el dueño (spec 006). La sesión restaurada es una sesión temporal nueva: si vuelve a interrumpirse, también se puede restaurar.
- **REQ-001-69:** Si la sesión temporal se cierra antes de agotar el tiempo (lo cierra el cliente o el encargado), **el tiempo sobrante se pierde**: no se devuelve ni se puede restaurar. Antes de cerrar, el Shell pide confirmación con el aviso "Perderás X min". Solo se restauran las sesiones cerradas "sin latidos" (REQ-001-66).
- **REQ-001-70:** El encargado puede **añadir tiempo** a una sesión temporal en curso cobrando un importe adicional o indicando minutos (el otro valor se calcula con la tarifa). El cobro va a su turno de caja y genera un evento.
- **REQ-001-71:** Una sesión interrumpida se puede restaurar durante **48 horas** desde el corte. Después queda en el respaldo como **"caducada"** y ya no se puede restaurar. Mientras esté pendiente de restaurar, no sale del respaldo aunque la PC acumule más de 3 sesiones temporales nuevas (REQ-001-64).

**Auditoría**

- **REQ-001-30:** Cada acción (cuenta creada, recarga, sesión abierta, sesión cerrada, tarifa cambiada) genera un evento con actor, PC y hora en UTC (ADR-0008).
- **REQ-001-31:** Cada sesión registra **quién la abrió** (el cliente o el encargado X) y **por qué se cerró** (cliente, encargado, saldo agotado o sin latidos).

**Personal**

- **REQ-001-40:** Roles mínimos: `encargado`, `administrador` (del local) y `dueño`. Cada miembro del personal tiene credenciales propias; no se comparten.

## Requisitos no funcionales

- **REQ-001-50:** El inicio de sesión responde en < 2 s en la LAN con 40 PCs conectadas, en el hardware del ADR-0011.
- **REQ-001-51:** Las contraseñas se guardan con argon2id y nunca aparecen en logs.
- **REQ-001-52:** Tras 5 intentos fallidos, la cuenta no puede iniciar sesión durante 5 minutos.
- **REQ-001-53:** Todo funciona **sin internet**; solo requiere la LAN (ADR-0001).

## Criterios de aceptación

- **CA-001-01** (REQ-001-20, REQ-001-11, REQ-001-12)
  - **Dado** un cliente con 2,00 USD de saldo y una tarifa de 1,00 USD/hora
  - **Cuando** inicia sesión
  - **Entonces** la PC se desbloquea y muestra 2:00:00 y 2,00 USD.
- **CA-001-12** (REQ-001-12)
  - **Dado** la sesión anterior
  - **Cuando** lleva 30 min de uso
  - **Entonces** el Shell muestra 1:30:00 y 1,50 USD.
- **CA-001-02** (REQ-001-21)
  - **Dado** un cliente con sesión activa en la PC 03
  - **Cuando** intenta iniciar sesión en la PC 07
  - **Entonces** se rechaza con el mensaje "Ya tienes una sesión abierta en la PC 03".
- **CA-001-03** (REQ-001-27)
  - **Dado** una sesión activa cuyo último latido fue a las 18:00
  - **Cuando** se va la luz y el nodo cierra la sesión a las 18:03
  - **Entonces** se cobra hasta las 18:00 y el motivo de cierre es "sin latidos".
- **CA-001-04** (REQ-001-22, REQ-001-31)
  - **Dado** el encargado Ana abre 30 min en la PC 05 sin cuenta
  - **Entonces** la sesión figura como "abierta por Ana" en el panel y en los eventos.
- **CA-001-05** (REQ-001-60, REQ-001-61)
  - **Dado** un cliente que paga 1 hora al encargado Ana, que escribe el nombre "Carlos"
  - **Cuando** Ana abre la sesión temporal en la PC 05
  - **Entonces** la PC 05 se desbloquea con 1:00:00, el panel muestra "Carlos · PC 05 · abierta por Ana" y el cobro aparece en el turno de Ana.
- **CA-001-06** (REQ-001-63, REQ-001-66, REQ-001-67)
  - **Dado** la sesión temporal "Carlos", cuyo último registro a las 18:00 fue de 40 min restantes
  - **Cuando** se va la luz, vuelve a las 18:30 y el encargado restaura "Carlos" en la PC 02
  - **Entonces** la PC 02 se desbloquea con 40 min (± 30 s) y no se registra ningún cobro nuevo en caja.
- **CA-001-07** (REQ-001-64)
  - **Dado** que la PC 05 ha tenido 5 sesiones temporales hoy
  - **Entonces** el panel muestra, como mínimo, las 3 últimas con todos sus datos.
- **CA-001-08** (REQ-001-68)
  - **Dado** una sesión interrumpida que ya se restauró
  - **Cuando** alguien intenta restaurarla otra vez
  - **Entonces** se rechaza con el mensaje "Esta sesión ya fue restaurada por Ana a las 18:31".
- **CA-001-09** (REQ-001-69)
  - **Dado** la sesión temporal "Carlos" con 25 min restantes
  - **Cuando** el cliente cierra la sesión y confirma el aviso "Perderás 25 min"
  - **Entonces** la PC se bloquea, los 25 min se pierden y la sesión no aparece en "Sesiones interrumpidas".
- **CA-001-10** (REQ-001-70)
  - **Dado** la sesión temporal "Carlos" con 10 min restantes y una tarifa de 1,00/hora
  - **Cuando** el encargado cobra 0,50 adicionales
  - **Entonces** la sesión pasa a 40 min restantes y el cobro aparece en su turno.
- **CA-001-11** (REQ-001-71)
  - **Dado** una sesión interrumpida por un corte del lunes a las 18:00
  - **Cuando** el encargado intenta restaurarla el miércoles a las 18:01
  - **Entonces** se rechaza porque está "caducada", pero sigue visible en el respaldo.

## Fuera de alcance

- Sesiones **postpago**: el sistema es solo prepago. Si el encargado fía, lo controla fuera del sistema y recarga cuando quiera.
- Recarga automática desde el Shell con verificación de pago móvil (spec 007, futura).
- Paquetes de horas o combos (pendientes de definir, ver spec 007), bonos y programa de fidelidad.
- Tarifas distintas por PC o categorías de PC (Normal, VIP).
- Tarifas por franja horaria o por día de la semana.
- Registro de cuentas por el propio cliente desde la PC.
- Reservas de PC.
- Pagos en línea.

## Preguntas abiertas

- [x] ¿El saldo se guarda en dinero o en tiempo? **Resuelta: en dinero, y el Shell muestra ambos** (REQ-001-11, REQ-001-12).
- [x] ¿En qué moneda se cobra? **Resuelta: USD, mostrando el equivalente en Bs a la tasa BCV** (REQ-001-13, spec 005).
- [ ] ¿Cómo se cobra la **fracción de minuto** cuando un cliente con cuenta cierra sesión? Ejemplo con 1 USD/hora, si usó 10 min 20 s: *por minuto empezado* cobra 11 min (0,18 USD); *por minuto completo* cobra 10 min (0,17 USD); *por segundo* cobra 10:20 exactos (0,172 USD). (Propuesta: por segundo.)
- [x] ¿Se permiten sesiones postpago? **Resuelta: no; solo prepago, y el encargado gestiona el cobro por fuera** (REQ-001-03).
- [ ] Si en el futuro se abre **otro cibercafé** del mismo dueño, ¿un cliente con cuenta en uno podría usar la misma cuenta y saldo en el otro? (Propuesta: no; cada local tiene sus propias cuentas.)
- [x] ¿El respaldo mínimo de 3 sesiones temporales es por PC o en total? **Resuelta: por PC** (REQ-001-64).
- [x] Si el cliente de una sesión temporal se va antes de tiempo, ¿qué pasa con el tiempo sobrante? **Resuelta: se pierde** (REQ-001-69).
- [x] ¿Se puede añadir tiempo a una sesión temporal en curso? **Resuelta: sí, cobrando un importe adicional** (REQ-001-70).
- [x] ¿Durante cuánto tiempo se puede restaurar una sesión interrumpida? **Resuelta: 48 horas** (REQ-001-71).
