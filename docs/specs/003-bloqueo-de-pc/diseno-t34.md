# Diseño T34: revocación conservando la sesión

- **Estado:** Aprobado por el mantenedor (2026-10-22), con las decisiones del final.
- **Cubre:** REQ-003-11, REQ-003-63; REQ-002-33, CA-002-09.
- **Parte de:** ADR-0020 (recuperación), ADR-0021 (permisos), ADR-0022 (código local).
- **Responde a:** la pregunta abierta «Contratos y confirmación tras revocación» de la
  [spec](spec.md) y la condición de T34 en [tasks](tasks.md): «proponer primero el diseño de
  contratos, confirmación del bloqueo, corte de consumo y acuses perdidos».

## Resumen en cinco frases

1. El encargado o administrador **revoca** una PC desde el panel: el nodo invalida su
   credencial, corta su conexión y, si tiene sesión, la **retiene** (no la cierra ni la pausa).
2. Desde ese instante el nodo **no cobra** esa sesión, ni el proceso de latidos la cierra, ni
   corre su pausa. Las apps del cliente siguen abiertas tras el bloqueo y el audio no se toca.
3. Para recuperarla, el personal genera en el panel un **código de recuperación** (el mismo
   tipo de código que el de instalación, ligado a esa PC) y lo introduce en el asistente de
   la PC, que obtiene una credencial nueva. La PC vuelve a conectar, pero **sigue bloqueada**.
4. El personal pulsa **«Autorizar continuar»**: la sesión vuelve a como estaba (activa o en
   pausa con el tiempo de pausa que le quedaba), sin pausas nuevas en los contadores.
5. Si nadie la recupera, el personal puede **cerrar la sesión retenida** desde el panel con el
   cierre de siempre, cobrando solo hasta el inicio de la retención.

## Por qué no hace falta un acuse de la PC

La credencial revocada ya no sirve para hablar con el nodo, así que la PC no puede confirmar
nada. El diseño no lo necesita, porque el cobro del nodo depende de que la PC esté viva
(REQ-001-27, `SessionsService.billableUntil`): solo se cobra hasta el último contacto.

| Situación al revocar | Qué ve la PC | Hasta cuándo se cobra |
|---|---|---|
| PC conectada | Recibe `pcAuthenticationError` (`pc_credential_revoked`) y el nodo cierra el socket. Si el mensaje se pierde, al reconectar el nodo la rechaza con el mismo código. En ambos casos se bloquea (T21 ya lo hace) | Hasta el instante de la revocación (el nodo cobra hasta «ahora» antes de retener) |
| PC sin red | Sigue con su cuenta atrás local (ADR-0007) hasta que vuelve la red; al reconectar la rechazan y se bloquea | Hasta su último contacto, como en cualquier corte (REQ-001-27). El uso sin red no se cobra, igual que hoy |

Por eso el **inicio efectivo del corte de consumo es el instante de la revocación en el
reloj del nodo** (`session_holds.started_at`), y el cobro ya hecho nunca pasa de ahí. Un
corte de red o un fallo TLS no revocan nada: sin la acción del personal no hay retención.

## Contratos

### Panel → nodo (encargado y administrador; el dueño recibe 403 por `@Roles`)

| Ruta | Cuerpo | Respuesta | Errores (`{ code, message }`) |
|---|---|---|---|
| `POST /pcs/:pcId/revoke` | `{ id }` (UUIDv7; repetirlo devuelve lo mismo) | `{ pc: { id, name }, revokedAt, heldSessionId \| null }` | `unknown_pc` 404 · `pc_not_registered` 409 (sin credencial vigente) · `pc_unavailable` 409 (mantenimiento abierto u orden en curso) · `idempotency_conflict` 409 |
| `POST /pcs/installation-codes` (existe, T12) | `{ pcId }` | igual que hoy | Hoy exige PC libre y sin mantenimiento. **Cambio:** también se admite si la PC tiene una retención abierta |
| `POST /pcs/register` (existe, T12) | igual que hoy | igual que hoy | **Cambio:** con una retención abierta, sustituye la credencial **sin cerrar la sesión ni la retención** |
| `POST /pcs/:pcId/continue` | `{ id, sessionId }` | `{ sessionId, heldSeconds }` | `unknown_pc` 404 · `pc_not_held` 409 · `pc_not_relinked` 409 (aún sin credencial nueva) · `pc_disconnected` 409 · `idempotency_conflict` 409 |

El cierre de una sesión retenida usa el cierre del personal que ya existe; el nodo termina la
retención en la misma transacción.

### Nodo → PC

`state` gana una tercera variante, en `stateMessageSchema` y `nativeStateMessageSchema`:

```ts
{ type: 'state', status: 'held', sessionId, reason: 'credential_revoked' }
```

Se envía tras el `hello` de una PC con retención abierta (ya con su credencial nueva). El Shell
muestra una pantalla «PC bloqueada por el encargado · Tu sesión y tu tiempo están a salvo»,
sin botones. Al autorizar continuar, el nodo envía el `state` normal (activo o en pausa).

### Eventos (`packages/shared/src/events.ts`)

- `pc.credential_revoked` v1, actor del personal: `{ requestId, pc, credentialId, heldSessionId | null }`.
- `session.hold_ended` v1, actor del personal: `{ holdId, sessionId, pc, startedAt, endedAt, heldSeconds, reason: 'continued' | 'session_closed' }`.
- La revinculación usa el `pc.registered` existente con `recovery: true`.

### Base de datos (una migración nueva)

`session_holds`: `id` uuid PK · `session_id` FK · `pc_id` FK · `revoked_credential_id` FK a
`pc_credentials` · `started_at` · `started_by` (jsonb, actor del personal) · `ended_at` ·
`ended_by` · `end_reason` (`continued` | `session_closed`). Checks: los tres campos de fin van
juntos; índice único parcial «una retención abierta por sesión». `pc_credentials` ya tiene
`revoked_at` y quién la revocó.

## Reglas del nodo

1. **Revocar** (una transacción, con `lockPc`):
   - sin credencial vigente → `pc_not_registered`; mantenimiento abierto u orden en curso
     (`holder` + `inFlight`) → `pc_unavailable` (decisión propuesta: la revocación espera a
     que termine el mantenimiento o la orden);
   - si hay sesión activa: `checkpoint` (cobra hasta ahora o hasta el último contacto) e
     insertar la retención;
   - marcar la credencial como revocada y emitir `pc.credential_revoked`.
   - Tras el commit: `PcGateway` cierra la conexión viva con `pc_credential_revoked` (como ya
     hace con `pc.registered` de recuperación) y `SessionsService` deja de vigilar la sesión.
2. **Mientras haya retención abierta** (`SessionsService` y `PausesService`):
   - `checkpoint` no cobra: avanza `lastHeartbeatAt` hasta ahora sin cobrar, igual que en una
     pausa que no cobra;
   - `attend`/`watch` no programan avisos ni agotamiento;
   - `closeStale` excluye la sesión (no se cierra por falta de latidos);
   - `reconcile` no la cierra aunque la PC no la nombre;
   - la pausa no vence (`expireIfDue`/`expire` la ignoran) y el personal no puede reanudarla;
     el cliente no puede pausar ni reanudar (el nodo responde con el `state` retenido);
   - login, temporal y restauración en esa PC ya se rechazan porque hay una sesión activa.
3. **Recuperar**: el código y el registro de T12 aceptan una PC con retención abierta. El
   registro sustituye la credencial, conserva sesión y retención, y emite `pc.registered`.
4. **Autorizar continuar** (una transacción): retención abierta de esa sesión, credencial
   vigente creada después del inicio de la retención y PC conectada. Cierra la retención
   (`continued`); si la sesión estaba en una pausa que no cobra, suma a su `max_until` lo
   que duró la retención (los contadores de pausas no cambian); pone `lastHeartbeatAt` en
   ahora; emite `session.hold_ended`. Tras el commit: reprograma el vencimiento de la pausa
   si la hay y envía a la PC su `state` normal con `review`.
5. **Cerrar la sesión retenida** desde el panel: el cierre de siempre, que con la retención
   abierta no cobra nada más (regla 2), cierra la retención (`session_closed`) en la misma
   transacción y pide el bloqueo de sistema de T29 (la PC lo recibirá cuando reconecte).

## PC (agente, host y Shell)

- Al recibir `pc_credential_revoked` (en vivo o al reconectar): el host ya bloquea (T21). Se
  añade: **detener la cuenta atrás local** (que no agote ni limpie procesos) y guardar la
  marca «retenida» para mantener el bloqueo si el agente reinicia. Las apps del cliente siguen
  abiertas y el audio no se silencia (a diferencia de la pausa).
- Al cambiar la credencial en la custodia, el canal vuelve a intentar conectar (hoy deja de
  reintentar tras una revocación). La introducción física del código es el asistente de T51;
  hasta entonces se prueba con el simulador y con tests.
- `state: held` → bloqueo, sesión conservada, sin limpieza ni silencio. `state: active` →
  desbloquea. `state` con pausa → pantalla de pausa (con su silencio de siempre).

## Pruebas que deben existir

- Revocar con PC libre, con sesión activa, en pausa, en pausa vencida que cobra, temporal y sin
  red. Revocar dos veces (idempotencia) y con mantenimiento u orden en curso.
- El cobro no avanza durante la retención, ni con temporizadores ni con el proceso de latidos.
- CA-002-09: pausa con 8 min, retención de 20 min, continuar: sigue en pausa con 8 min, mismos
  contadores, vence a los 8 min según la política.
- Credencial anterior rechazada; nueva sin desbloqueo; continuar sin credencial nueva, sin
  conexión o dos veces; cerrar la sesión retenida.
- Roles: encargado y administrador sí; dueño, cliente y peticiones sin sesión, no.
- Reinicio del nodo con una retención abierta: sigue retenida y sin cobro.

## Decisiones del mantenedor (2026-10-22)

1. **Apps abiertas, con audio:** la retención no cierra procesos ni silencia el audio. Una
   sesión que ya estaba en pausa conserva el silencio de su pausa.
2. **Uso sin red sin cobrar:** el uso antes de enterarse de la revocación no se cobra, igual
   que un corte normal (REQ-001-27).
3. **Revocar espera:** no se revoca con un mantenimiento abierto ni con una orden en curso.
4. **Diseño aprobado:** código de recuperación con la tabla y las rutas de T12, ampliadas solo
   a PCs con retención abierta; «Autorizar continuar»; cierre de la sesión retenida desde el
   panel.
