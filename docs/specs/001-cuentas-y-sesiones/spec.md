# Spec 001: Cuentas y sesiones

- **Estado:** Borrador
- **Fecha:** 2026-09-25
- **ADRs relacionados:** ADR-0001, ADR-0007, ADR-0008
- **Specs relacionadas:** 002, 003, 006

## Problema

El local necesita que solo quien tenga saldo use una PC, que el tiempo se cobre con
exactitud y que quede registrado quién abrió cada sesión: el propio cliente o un
encargado. El dueño lo revisa desde España.

## Actores

- **Cliente:** tiene cuenta y saldo; inicia sesión en la PC.
- **Encargado:** crea cuentas, recarga saldo y abre o cierra sesiones.
- **Administrador del local:** configura tarifas, grupos de PC y encargados.
- **Sistema:** descuenta tiempo y cierra sesiones.

## Historias de usuario

- Como **cliente**, quiero iniciar sesión en cualquier PC con mi usuario para usar mi saldo.
- Como **encargado**, quiero crear una cuenta y recargarla en segundos desde el panel.
- Como **encargado**, quiero abrir una sesión en una PC para un cliente sin cuenta que paga en efectivo.
- Como **dueño**, quiero saber qué sesiones abrió cada encargado para detectar abusos.

## Requisitos funcionales

**Cuentas**
- **REQ-001-01:** Las cuentas de cliente solo se crean en el nodo local (desde el panel). La PC nunca crea ni guarda cuentas.
- **REQ-001-02:** Una cuenta debe tener usuario único y contraseña. Nombre y teléfono son opcionales.
- **REQ-001-03:** El encargado debe poder recargar saldo indicando importe y método de pago. La recarga queda asociada a su turno de caja (spec 005).
- **REQ-001-04:** El encargado debe poder bloquear o desactivar una cuenta.

**Tarifas**
- **REQ-001-10:** Las PCs se agrupan (p. ej. Normal, VIP) y cada grupo tiene un precio por hora.
- **REQ-001-11:** El tiempo disponible que se muestra al cliente se calcula como saldo ÷ tarifa del grupo de la PC.

**Sesiones**
- **REQ-001-20:** El cliente debe iniciar sesión en el Shell con usuario y contraseña. El nodo local valida y abre la sesión si hay saldo suficiente para al menos 1 minuto.
- **REQ-001-21:** Una cuenta solo puede tener **una** sesión activa a la vez.
- **REQ-001-22:** El encargado debe poder abrir una sesión **sin cuenta** en una PC, por tiempo fijo o importe cobrado en caja. Queda registrado como actor.
- **REQ-001-23:** El cobro se calcula con el reloj del nodo local, por minuto (ADR-0007).
- **REQ-001-24:** El Shell debe avisar al cliente cuando le queden 5 minutos y 1 minuto.
- **REQ-001-25:** Al agotarse el saldo o el tiempo, la sesión se cierra y la PC se bloquea.
- **REQ-001-26:** El cliente puede cerrar su sesión desde el Shell. El encargado puede cerrar cualquier sesión desde el panel.
- **REQ-001-27:** Si una PC deja de enviar latidos más tiempo del de gracia (por defecto 3 min, configurable), el nodo cierra la sesión y cobra solo hasta el último latido.

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

- **CA-001-01** (REQ-001-20, REQ-001-11)
  - **Dado** un cliente con 2,00 de saldo y una PC Normal a 1,00/hora
  - **Cuando** inicia sesión
  - **Entonces** la PC se desbloquea y muestra 2:00:00 restantes.
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

## Fuera de alcance

- Paquetes de horas, bonos y programa de fidelidad.
- Tarifas por franja horaria o por día de la semana.
- Registro de cuentas por el propio cliente desde la PC.
- Reservas de PC.
- Pagos en línea.

## Preguntas abiertas

- [ ] ¿El saldo se guarda en **dinero** o en **tiempo**? (Propuesta: dinero.)
- [ ] ¿En qué **moneda** se cobra: USD, VES o ambas? Afecta también a la spec 005.
- [ ] ¿Redondeo del cobro: por minuto iniciado o por minuto completo?
- [ ] ¿Se permiten sesiones **postpago** (se usa y se paga al final)?
- [ ] ¿Las cuentas valen en varias sucursales en el futuro?
