# Tareas 005 · Parte 1: tasa de cambio manual

- **Estado:** Aprobado (2026-10-02)
- **Plan:** [plan.md](plan.md)

Reglas: una tarea = un commit. Marca `[x]` en el mismo commit que la implementa. Cada
commit deja el repo compilando y con `pnpm test` en verde. Los tests nombran el REQ que
prueban. Si una tarea resulta más grande de lo previsto (> 400 líneas), divídela aquí
antes de seguir.

## Fase 1: Tasa manual

- [x] **T01: Contratos de la tasa**
  - **Cubre:** REQ-005-33, REQ-005-35, REQ-005-36
  - **Hacer:** en `@pope/shared`, los esquemas de la tasa (respuesta de `GET`, cuerpo de `POST`), el evento `exchange_rate.set`, el mensaje `exchangeRate` del canal del panel, y las funciones puras `currentRate` (vigente entre varias) y `businessDaysOld` (antigüedad de lunes a viernes, en hora de Caracas).
  - **Verificar:** tests unitarios de la tasa vigente y de los días hábiles con un fin de semana por medio.
  - **Commit:** `feat(shared): añade los contratos de la tasa de cambio`
  - **Decidido al implementarla:** módulo `exchange-rate.ts`. La tasa vigente exige además haberse guardado antes del instante consultado: así "vale desde que se guarda" queda en la propia regla. La fecha valor es `AAAA-MM-DD` en hora de Caracas (`localDateInCaracas`). Tope de 10.000.000 Bs por USD. `setBy` es el nombre de quien la escribió, o `null` si viene del BCV. El mensaje del canal del panel es `{ type: 'exchangeRate', rate, stale }`, como dice el plan.

- [x] **T02: Guardar y consultar la tasa en el nodo**
  - **Cubre:** REQ-005-33, REQ-005-34
  - **Hacer:** tabla `exchange_rates` con su migración, `ExchangeRatesService` (vigente en memoria, guardar con evento dentro de `inTransaction`) y `GET`/`POST /exchange-rate` (`POST` solo encargado y administrador).
  - **Verificar:** e2e: el dueño no puede guardar; una tasa válida queda vigente al momento con su evento (actor y fuente `manual`); valores fuera de rango se rechazan.
  - **Commit:** `feat(server): guarda la tasa de cambio manual`
  - **Decidido al implementarla:** módulo `exchange-rates` con migración `0015_exchange_rates`. El servicio guarda en memoria las 20 tasas más recientes (al arrancar las lee de la base) y responde la vigente sin consultar la base; la memoria solo cambia tras confirmar la transacción. `POST` responde 201 con el estado nuevo (tasa y `stale`), igual que `GET`. `setBy` sale del actor del evento. Verificado: 7 tests e2e, también contra PostgreSQL real (roles, validación, evento, sustitución con historia, CA-005-05 y lectura al reiniciar).

- [ ] **T03: Repartir la tasa a las PCs y al panel**
  - **Cubre:** REQ-005-36, REQ-001-13
  - **Hacer:** el `state` de las PCs lleva la tasa vigente; al cambiarla, el nodo reenvía el `state` a las PCs con sesión. El canal del panel envía `exchangeRate` al conectar, al cambiar la tasa y al cambiar de día.
  - **Verificar:** e2e: una PC con sesión recibe un `state` con la tasa nueva y el panel el mensaje `exchangeRate`.
  - **Commit:** `feat(server): reparte la tasa de cambio a las PCs y al panel`

- [ ] **T04: La tasa en el panel**
  - **Cubre:** REQ-005-34, REQ-005-35, REQ-005-36
  - **Hacer:** píldora de la tasa en la barra superior (vigente, sin tasa o desactualizada) y diálogo "Tasa del día" para el encargado y el administrador. Lectura del valor escrito a µVES.
  - **Verificar:** tests de la lectura del valor; a mano, guardar una tasa y verla en dos pestañas del panel a la vez.
  - **Commit:** `feat(panel): muestra y permite cambiar la tasa de cambio`

- [ ] **T05: Bs en el mapa, Clientes y cobros**
  - **Cubre:** REQ-005-30, REQ-001-13
  - **Hacer:** equivalente en Bs, debajo del importe en USD, en el detalle de la PC del mapa, Clientes, Recargar saldo y Vender combo.
  - **Verificar:** a mano, con tasa y sin tasa.
  - **Commit:** `feat(panel): muestra el equivalente en Bs en el mapa y los cobros`

- [ ] **T06: Bs en tarifas, combos y sesiones temporales**
  - **Cubre:** REQ-005-30, REQ-001-13
  - **Hacer:** equivalente en Bs en Tarifas, Combos (precio y precio por hora) y en el diálogo de sesión temporal.
  - **Verificar:** a mano, con tasa y sin tasa.
  - **Commit:** `feat(panel): muestra el equivalente en Bs en tarifas, combos y temporales`

## Cierre

- [ ] **T07: Verificación de la parte 1**
  - **Cubre:** CA-005-06, REQ-001-13
  - **Hacer:** probar CA-005-06 en Chrome (panel y Shell). Marcar REQ-001-13 como hecho en la spec 001 y anotar la verificación en `mediciones.md` de la spec 001.
  - **Verificar:** revisión del mantenedor.
  - **Commit:** `docs(specs): verifica la tasa de cambio manual`
