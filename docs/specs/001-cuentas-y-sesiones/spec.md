# Spec 001: Cuentas y sesiones

- **Estado:** Aprobada
- **Fecha:** 2026-09-25
- **ADRs relacionados:** ADR-0001, ADR-0007, ADR-0008, ADR-0014
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
- **Administrador del local:** configura las tarifas, los combos y los encargados.
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

- **REQ-001-10:** La tarifa por hora se define en una **tabla semanal**: cada uno de los 7 días tiene su propio precio, igual para todas las PCs (no hay categorías como Normal o VIP). Ejemplo actual: lunes a miércoles 1,50 USD/h y jueves a domingo 2,00 USD/h.
- **REQ-001-15:** El administrador puede cambiar el precio de cualquier día **en cualquier momento** y tantas veces como quiera (p. ej. pasar a lunes–jueves 1,50 y viernes–domingo 2,00, y más adelante subir el domingo a 3,00). El panel permite asignar un precio a varios días de una vez. Cada cambio genera un evento con los valores anteriores y los nuevos.
- **REQ-001-16:** Un cambio de tarifa se aplica a las sesiones que **empiecen después** de guardarlo. Las sesiones en curso mantienen su tarifa.
- **REQ-001-11:** El saldo se guarda en **dinero**. Su equivalente en tiempo se calcula con la tarifa aplicable: la de la sesión en curso o, si no hay sesión, la de hoy. Tiempo restante = saldo ÷ tarifa.
- **REQ-001-12:** El Shell muestra al cliente **los dos valores**, tiempo restante y saldo, y los actualiza mientras consume. Ejemplo un lunes (1,50 USD/h): empieza con 3,00 USD = 2:00:00 y, tras 30 min, ve 2,25 USD = 1:30:00.
- **REQ-001-14:** Una sesión **mantiene la tarifa del día en que empezó**, aunque pase la medianoche. (El local abre de 10:00 a 22:00, pero a veces se alarga hasta las 00:00.)
- **REQ-001-13:** La tarifa, el saldo y las recargas están en **USD**. El Shell y el panel muestran primero el importe en USD y a su lado el equivalente en bolívares a la tasa BCV vigente (REQ-005-30).

**Sesiones**

- **REQ-001-20:** El cliente debe iniciar sesión en el Shell con usuario y contraseña. El nodo local valida y abre la sesión si hay saldo suficiente para al menos 1 minuto.
- **REQ-001-21:** Una cuenta solo puede tener **una** sesión activa a la vez.
- **REQ-001-22:** El encargado debe poder abrir una **sesión temporal** sin cuenta (ver "Sesiones temporales"). Queda registrado como actor.
- **REQ-001-23:** El cobro se calcula con el reloj del nodo local, **por segundo**: se descuenta exactamente el tiempo usado (ADR-0007). Por ejemplo, 10 min 20 s a 1,50 USD/h descuentan 0,2583 USD. Internamente se guarda con más precisión que el céntimo, y el Shell muestra el saldo redondeado a céntimos.
- **REQ-001-24:** El Shell debe avisar al cliente cuando le queden 5 minutos y 1 minuto.
- **REQ-001-25:** Al agotarse el saldo o el tiempo, la sesión se cierra y la PC se bloquea.
- **REQ-001-26:** El cliente puede cerrar su sesión desde el Shell. El encargado puede cerrar cualquier sesión desde el panel.
- **REQ-001-27:** Si una PC deja de enviar latidos más tiempo del de gracia (por defecto 3 min, configurable), el nodo cierra la sesión y cobra solo hasta el último latido.

**Sesiones temporales (sin cuenta)**

- **REQ-001-60:** El cliente puede pagar al encargado y usar una PC **sin crear cuenta**. El encargado abre la sesión temporal indicando el **tiempo** o el **importe** (el otro valor se calcula con la tarifa del día) y el método de pago. El cobro queda en su turno de caja (spec 005).
- **REQ-001-61:** El encargado puede ponerle un **nombre** (p. ej. "Carlos") para identificarla en el panel y en el Shell. Si no lo pone, se usa "Temporal · PC 05 · 18:30".
- **REQ-001-62:** La sesión temporal termina cuando se agota el tiempo pagado y la PC se bloquea (REQ-001-25).
- **REQ-001-63:** El nodo local guarda en disco el **tiempo restante** de cada sesión temporal en cada latido, como mínimo cada 30 s. El agente guarda además una copia en la propia PC. Así un corte de luz hace perder como mucho 30 s.
- **REQ-001-64:** El nodo local conserva un **respaldo de, como mínimo, las 3 últimas sesiones temporales de cada PC**, con: nombre, PC, tiempo pagado, tiempo restante según el último registro, importe, quién la abrió, hora de inicio, hora de fin y motivo de cierre. El administrador puede ampliar este número.
- **REQ-001-65:** El respaldo sobrevive a reinicios y cortes de luz del nodo local y de las PCs: se guarda en disco, nunca solo en memoria.
- **REQ-001-66:** Tras un corte, las sesiones temporales cerradas "sin latidos" (REQ-001-27) que tenían tiempo restante aparecen en el panel en **"Sesiones interrumpidas"**.
- **REQ-001-67:** El encargado puede **restaurar** una sesión interrumpida en la misma PC o en otra. La nueva sesión continúa con el tiempo restante, **sin nuevo cobro**, y queda enlazada a la original.
- **REQ-001-68:** Una sesión interrumpida solo se puede restaurar **una vez**. La restauración genera un evento con el actor, visible para el dueño (spec 006). La sesión restaurada es una sesión temporal nueva: si vuelve a interrumpirse, también se puede restaurar.
- **REQ-001-69:** Si la sesión temporal se cierra antes de agotar el tiempo (lo cierra el cliente o el encargado), **el tiempo sobrante se pierde**: no se devuelve ni se puede restaurar. Antes de cerrar, el Shell pide confirmación con el aviso "Perderás X min". Solo se restauran las sesiones cerradas "sin latidos" (REQ-001-66).
- **REQ-001-70:** El encargado puede **añadir tiempo** a una sesión temporal en curso cobrando un importe adicional o indicando minutos (el otro valor se calcula con la tarifa de la sesión). El cobro va a su turno de caja y genera un evento.
- **REQ-001-71:** Una sesión interrumpida se puede restaurar durante **48 horas** desde el corte. Después queda en el respaldo como **"caducada"** y ya no se puede restaurar. Mientras esté pendiente de restaurar, no sale del respaldo aunque la PC acumule más de 3 sesiones temporales nuevas (REQ-001-64).

**Combos** (ADR-0014)

- **REQ-001-80:** El administrador crea combos indicando **nombre**, **precio** (USD) y **horas** (p. ej. "Combo 20 horas", 20 USD, 20 h). El panel muestra lo que sale la hora con ese combo y el descuento frente a cada tarifa del día.
- **REQ-001-81:** Un combo se puede editar o desactivar. Los cambios no afectan a las horas ya vendidas y generan un evento.
- **REQ-001-82:** Solo los clientes **con cuenta** pueden comprar combos. Las sesiones temporales siempre usan la tarifa del día.
- **REQ-001-83:** Cada cuenta tiene **dos saldos**: saldo en dinero (USD) y **horas de combo** (tiempo).
- **REQ-001-84:** **Compra en caja:** el encargado carga un combo a la cuenta indicando el método de pago. Se suman las horas y el cobro queda en su turno (spec 005).
- **REQ-001-85:** **Compra con saldo:** si el saldo en dinero alcanza, el cliente (desde el Shell, con confirmación) o el encargado (desde el panel) puede cambiarlo por un combo. Se descuenta el precio del saldo y se suman las horas.
- **REQ-001-86:** Las horas de combo **no vencen nunca** y valen **cualquier día a cualquier hora**, aunque cambie la tarifa. Se descuenta el tiempo real usado.
- **REQ-001-87:** **Orden de consumo:** primero se gastan las horas de combo. Cuando se agotan, la sesión sigue **sin cortes** gastando el saldo en dinero a la tarifa del día.
- **REQ-001-88:** El Shell muestra por separado las horas de combo, el saldo en dinero (con su equivalente en tiempo a la tarifa de hoy) y el **tiempo total** disponible.
- **REQ-001-89:** Los saldos nunca se editan directamente. Recargas, compras de combo, consumos y ajustes (con motivo) son movimientos con actor y hora.

**Auditoría**

- **REQ-001-30:** Cada acción (cuenta creada, recarga, sesión abierta, sesión cerrada, tarifa cambiada) genera un evento con actor, PC y hora en UTC (ADR-0008).
- **REQ-001-31:** Cada sesión registra **quién la abrió** (el cliente o el encargado X) y **por qué se cerró** (cliente, encargado, saldo agotado o sin latidos).

**Personal**

- **REQ-001-40:** Roles mínimos: `encargado`, `administrador` (del local) y `dueño`. Cada miembro del personal tiene credenciales propias; no se comparten.

**Panel del local**

- **REQ-001-45:** El administrador puede organizar el mapa de PCs del panel arrastrando cada PC a su sitio real en el local. La distribución se guarda en el nodo, la ve todo el personal y cada cambio genera un evento. Una PC sin posición aparece al final del mapa, por número.

## Requisitos no funcionales

- **REQ-001-50:** El inicio de sesión responde en < 2 s en la LAN con 40 PCs conectadas, en el hardware del ADR-0011.
- **REQ-001-51:** Las contraseñas se guardan con argon2id y nunca aparecen en logs.
- **REQ-001-52:** Tras 5 intentos fallidos, la cuenta no puede iniciar sesión durante 5 minutos.
- **REQ-001-53:** Todo funciona **sin internet**; solo requiere la LAN (ADR-0001).

## Criterios de aceptación

- **CA-001-01** (REQ-001-20, REQ-001-11, REQ-001-12)
  - **Dado** un cliente con 3,00 USD de saldo, un lunes (1,50 USD/h)
  - **Cuando** inicia sesión
  - **Entonces** la PC se desbloquea y muestra 2:00:00 y 3,00 USD.
- **CA-001-12** (REQ-001-12)
  - **Dado** la sesión anterior
  - **Cuando** lleva 30 min de uso
  - **Entonces** el Shell muestra 1:30:00 y 2,25 USD.
- **CA-001-13** (REQ-001-10, REQ-001-11)
  - **Dado** un cliente con 3,00 USD de saldo
  - **Cuando** inicia sesión un jueves (2,00 USD/h)
  - **Entonces** el Shell muestra 1:30:00 y 3,00 USD.
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
  - **Dado** la sesión temporal "Carlos" con 10 min restantes, un lunes (1,50 USD/h)
  - **Cuando** el encargado cobra 0,75 USD adicionales
  - **Entonces** la sesión pasa a 40 min restantes y el cobro aparece en su turno.
- **CA-001-11** (REQ-001-71)
  - **Dado** una sesión interrumpida por un corte del lunes a las 18:00
  - **Cuando** el encargado intenta restaurarla el miércoles a las 18:01
  - **Entonces** se rechaza porque está "caducada", pero sigue visible en el respaldo.
- **CA-001-14** (REQ-001-80)
  - **Dado** que el administrador crea "Combo 20 horas" a 20 USD por 20 h
  - **Entonces** el panel muestra "1,00 USD/h: 33 % menos que de lunes a miércoles y 50 % menos que de jueves a domingo".
- **CA-001-15** (REQ-001-86)
  - **Dado** que Juan compró el combo de 20 h y usó 2 h
  - **Cuando** vuelve 6 meses después, un sábado
  - **Entonces** tiene 18:00:00 de horas de combo, las mismas que al irse.
- **CA-001-16** (REQ-001-87, REQ-001-88)
  - **Dado** que Juan tiene 0:30:00 de combo y 3,00 USD de saldo, un jueves (2,00 USD/h)
  - **Cuando** inicia sesión
  - **Entonces** el Shell muestra combo 0:30:00, saldo 3,00 USD (≈ 1:30:00) y total 2:00:00. A los 30 min empieza a gastar saldo sin que se corte la sesión.
- **CA-001-17** (REQ-001-85)
  - **Dado** que Juan tiene 25,00 USD de saldo
  - **Cuando** compra desde el Shell el "Combo 20 horas" y confirma
  - **Entonces** le quedan 5,00 USD de saldo y suma 20:00:00 de horas de combo.
- **CA-001-18** (REQ-001-82)
  - **Dado** una sesión temporal
  - **Entonces** el panel no ofrece combos, solo tiempo a la tarifa del día.
- **CA-001-19** (REQ-001-14)
  - **Dado** una sesión que empieza el miércoles a las 23:00 (1,50 USD/h)
  - **Cuando** son las 00:30 del jueves (2,00 USD/h)
  - **Entonces** se sigue cobrando a 1,50 USD/h y el tiempo restante no cambia de golpe a medianoche.
- **CA-001-20** (REQ-001-15)
  - **Dado** la tabla lunes–miércoles 1,50 y jueves–domingo 2,00
  - **Cuando** el administrador selecciona lunes a jueves, pone 1,50 y guarda; después cambia el domingo a 3,00 y guarda
  - **Entonces** la tabla queda: lunes–jueves 1,50, viernes–sábado 2,00, domingo 3,00, y hay dos eventos de cambio de tarifa.
- **CA-001-21** (REQ-001-16)
  - **Dado** una sesión en curso un domingo a 2,00 USD/h
  - **Cuando** el administrador cambia el domingo a 3,00
  - **Entonces** esa sesión sigue a 2,00 y las sesiones que empiecen después cuestan 3,00.

## Fuera de alcance

- Sesiones **postpago**: el sistema es solo prepago. Si el encargado fía, lo controla fuera del sistema y recarga cuando quiera.
- Recarga automática desde el Shell con verificación de pago móvil (spec 007, futura).
- Combos con vencimiento o limitados a ciertos días (los combos actuales no tienen restricciones).
- Bonos y programa de fidelidad.
- Tarifas distintas por PC o categorías de PC (Normal, VIP).
- Tarifas por franja horaria (p. ej. nocturna). Solo varía por día de la semana.
- Programar cambios de tarifa para una fecha futura o tarifas para fechas concretas (feriados). Los cambios se aplican al guardarlos.
- Registro de cuentas por el propio cliente desde la PC.
- Cierre automático de sesiones a la hora de cierre del local: lo decide el encargado, porque a veces se alarga hasta las 00:00.
- Cuentas compartidas entre sedes: hoy hay una sola sede. El modelo de la nube ya distingue sedes (REQ-006-30) por si se abre otra.
- Reservas de PC.
- Pagos en línea.

## Preguntas abiertas

- [x] ¿El saldo se guarda en dinero o en tiempo? **Resuelta: en dinero, y el Shell muestra ambos** (REQ-001-11, REQ-001-12).
- [x] ¿En qué moneda se cobra? **Resuelta: USD, mostrando el equivalente en Bs a la tasa BCV** (REQ-001-13, spec 005).
- [x] ¿Cómo se cobra la fracción de minuto? **Resuelta: por segundo** (REQ-001-23).
- [x] ¿Se permiten sesiones postpago? **Resuelta: no; solo prepago, y el encargado gestiona el cobro por fuera** (REQ-001-03).
- [x] ¿Las cuentas valen en otras sedes? **Resuelta: hoy hay una sola sede; cada local tiene sus propias cuentas.**
- [x] ¿El respaldo mínimo de 3 sesiones temporales es por PC o en total? **Resuelta: por PC** (REQ-001-64).
- [x] Si el cliente de una sesión temporal se va antes de tiempo, ¿qué pasa con el tiempo sobrante? **Resuelta: se pierde** (REQ-001-69).
- [x] ¿Se puede añadir tiempo a una sesión temporal en curso? **Resuelta: sí, cobrando un importe adicional** (REQ-001-70).
- [x] ¿Durante cuánto tiempo se puede restaurar una sesión interrumpida? **Resuelta: 48 horas** (REQ-001-71).
- [x] ¿Cómo funcionan los combos? **Resuelta: se guardan en horas, no vencen, valen cualquier día, solo para cuentas y se consumen antes que el saldo** (REQ-001-80 a 89, ADR-0014).
- [x] ¿Qué sistema usa hoy el local y cómo se migra? **Resuelta en parte: usan SENET; la migración va en la spec 008.**
- [x] ¿Quién cierra las sesiones a la hora de cierre? **Resuelta: el encargado; el sistema no cierra nada solo.**
- [x] ¿Qué tarifa se aplica si una sesión pasa de la medianoche? **Resuelta: la del día en que empezó** (REQ-001-14).
- [x] ¿Las tarifas son fijas? **Resuelta: no; el administrador cambia el precio de cada día cuando quiera** (REQ-001-15, REQ-001-16).
- [x] ¿Cómo se redondea el saldo a céntimos al mostrarlo? **Resuelta: al céntimo más cercano, la mitad hacia arriba** (2,245833 → 2,25 USD). Los negativos, igual en valor absoluto (REQ-001-23, ADR-0015).
- [x] ¿Cómo se muestra el equivalente en bolívares? **Resuelta (cambiada el 2026-10-01 por el mantenedor): `3,00 USD (≈ 120,00 Bs)`**, con «Bs», que es como se lee en el local, miles con punto y decimales con coma; en tarifas, `1,50 USD/h (≈ 60,00 Bs/h)`. El código ISO `VES` se sigue usando en los datos; solo cambia el texto que se ve. Antes se mostraba `VES` (REQ-001-13).
- [x] ¿Puede el panel organizar el mapa de PCs como en SENET? **Resuelta: sí, solo el administrador, arrastrando cada PC a su sitio** (REQ-001-45). Se usa `@dnd-kit/core` porque también funciona con el teclado.
- [x] ¿Para qué pantalla se diseña el panel? **Resuelta: la del servidor del local, de 1920×1080.** El diseño de referencia es el lienzo "Panel Pope · Fase 8 (estilo SENET)".
- [x] Si un latido llega tarde y el tiempo transcurrido supera el saldo, ¿qué se cobra? **Resuelta: como mucho lo que había.** El saldo nunca queda negativo y los segundos de más no se cobran, porque el sistema es solo prepago (REQ-001-23, REQ-001-25).
- [x] Si una sesión empieza con menos de 5 min, ¿qué avisos recibe? **Resuelta: el de 5 min al empezar y el de 1 min al llegar.** Si después compra tiempo y vuelve a superar un umbral, ese aviso se rearma y se repite al cruzarlo otra vez (REQ-001-24). Si empieza con menos de 1 min, solo se envía el de 1 min, para no mostrar dos avisos seguidos (criterio de T07, pendiente de confirmar por el mantenedor).
- [x] ¿Cómo sabe la nube los nombres del encargado, la PC o el cliente de cada evento? **Resuelta: cada evento lleva, además del id, una copia del nombre del momento** (`actor: { staffId, name: "Ana" }`, `pc: { id, name: "PC 05" }`). La auditoría se entiende sola y un renombrado no cambia el pasado (REQ-001-30, REQ-001-31).
- [x] ¿Cómo se representa el método de pago? **Resuelta: lista fija por ahora** (`cash_usd`, `cash_ves`, `mobile_payment`, `pos`), según REQ-005-21. Si la spec 005 los hace configurables, se hará con una nueva versión de los eventos.
- [x] ¿Cómo se implementa la sesión del personal en el panel? **Resuelta: token aleatorio en una cookie httpOnly; en la BD solo se guarda su hash, en la tabla `staff_sessions`.** Cerrar sesión o desactivar a alguien la anula al instante (REQ-001-40).
- [x] ¿Cuánto dura la sesión del personal? **Resuelta: 7 días renovables**: cada uso la extiende otros 7 días (REQ-001-40).
- [x] ¿Qué eventos genera el personal? **Resuelta: solo `staff.created`**, también para el primer administrador creado por la CLI. Los logins no generan evento (REQ-001-30, REQ-001-40).
- [x] ¿Qué contraseña mínima se exige al personal? **Resuelta: ninguna**; basta con que no esté vacía (REQ-001-40, REQ-001-51).
- [x] ¿Cómo se da de alta al personal? **Resuelta: la CLI de T14 crea el primer administrador, y se añaden T14d (endpoints, solo administrador) y T43b (pantalla del panel) para crear, listar y activar o desactivar personal** (REQ-001-40).
- [x] ¿Desactivar o reactivar personal genera un evento? **Resuelta: sí, `staff.status_changed`**, con el estado anterior y el nuevo, igual que `customer.status_changed`. Al desactivar se borran sus sesiones del panel (REQ-001-30, REQ-001-40).
- [x] ¿En qué se diferencian una cuenta "bloqueada" y una "desactivada"? **Resuelta: mismo efecto, distinto motivo.** Ninguna puede iniciar sesión ni recibir recargas; "bloqueada" es una sanción y "desactivada", una cuenta que ya no se usa. El encargado puede pasar de cualquiera a cualquiera y el saldo se conserva (REQ-001-04).
- [x] ¿Qué formato tiene el usuario del cliente? **Resuelta: de 3 a 32 letras, números, `.`, `_` o `-`**, sin espacios ni tildes y único sin distinguir mayúsculas (REQ-001-02).
- [x] ¿Qué contraseña mínima tienen los clientes? **Resuelta: 4 caracteres** (REQ-001-02, REQ-001-52).
- [x] ¿Se valida el teléfono del cliente? **Resuelta: sí, solo teléfonos venezolanos** (móviles 4XX y fijos 2XX), guardados normalizados como `+584121234567` (REQ-001-02).
- [x] ¿Cómo cuenta el bloqueo por intentos fallidos? **Resuelta: bloqueo fijo de 5 minutos.** Un login correcto pone el contador a cero; los intentos durante el bloqueo no cuentan ni lo alargan, y al terminar la cuenta vuelve a tener 5 intentos (REQ-001-52).
- [x] ¿Qué mensaje ve el cliente cuando no puede entrar? **Resuelta: uno específico para cada caso**: usuario o contraseña incorrectos, demasiados intentos (con los minutos que faltan) o cuenta bloqueada o desactivada (que hable con el encargado). Criterio de T16: el estado de la cuenta solo se dice si la contraseña es correcta, para no revelárselo a quien no la sabe (REQ-001-04, REQ-001-52).
- [x] ¿Puede el encargado quitar el bloqueo por intentos antes de tiempo? **Resuelta: sí**, con un endpoint (T16a) y un botón en el panel (T40) (REQ-001-52).
- [x] ¿El bloqueo por intentos genera un evento? **Resuelta: sí**, `customer.login_locked` al bloquearse (actor sistema, porque los intentos pueden no ser del cliente) y `customer.login_unlocked` si lo quita el encargado. Los fallos sueltos no generan evento (REQ-001-30, REQ-001-52).
- [x] **Corte de red entre la PC y el nodo.** ADR-0007 dice que, sin conexión, el agente sigue contando con el saldo conocido; REQ-001-27 dice que tras 3 min sin latidos el nodo cierra la sesión y cobra solo hasta el último latido. ¿Qué hace el nodo cuando un agente reconecta con una sesión ya cerrada por falta de latidos? **Resuelta: la sesión sigue cerrada y se corrige.** Al reconectar, el nodo le envía `sessionEnded` y la PC se bloquea. Con cuenta, el tiempo sin red no se cobra (el local pierde como mucho ese hueco). Si era temporal, su tiempo restante pasa a ser el menor entre el del nodo y el que informa la PC (`localRemainingSeconds`), así no se regala dos veces; sigue en "Sesiones interrumpidas" y el encargado puede restaurarla al momento (REQ-001-27, REQ-001-66).
- [x] ¿Cómo se redondea el cobro de una sesión temporal cuando el encargado indica minutos? **Resuelta: al céntimo más cercano, la mitad hacia arriba**, igual que `formatMoney` (25 min a 1,50 USD/h = 0,625 → 0,63 USD). Se cobra y se guarda ese importe y se dan exactamente los minutos pedidos. Si indica un importe, los segundos son los que paga a la tarifa, truncados (REQ-001-60, REQ-001-70).
- [x] ¿Dónde se configura el número de sesiones temporales que se conservan por PC? **Resuelta: en un ajuste guardado en la base de datos** (tabla `settings`), que el administrador cambia desde el panel con evento; mínimo 3. El tiempo de gracia de los latidos (3 min) va en la misma tabla (REQ-001-27, REQ-001-64).
