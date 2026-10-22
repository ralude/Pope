using System.Text.Json;
using Pope.ShellHost;
using Xunit;

namespace Pope.Native.Tests;

public sealed class DesktopAuthorizationTests
{
    [Fact(DisplayName = "REQ-003-33: un cambio Win32 fallido nunca confirma desbloqueo ni éxito de bloqueo")]
    public void FailedSwitchIsNotAcknowledged()
    {
        var fail = false; var calls = 0;
        var transition = new DesktopTransition(_ => { calls++; if (fail) throw new System.ComponentModel.Win32Exception(5); });
        transition.Apply(true); fail = true;
        Assert.Throws<System.ComponentModel.Win32Exception>(() => transition.Apply(false));
        Assert.True(transition.Blocked); Assert.False(transition.Confirmed);
        fail = false; transition.Apply(false); Assert.False(transition.Blocked); Assert.True(transition.Confirmed);
        fail = true; Assert.Throws<System.ComponentModel.Win32Exception>(() => transition.Apply(true));
        Assert.False(transition.Confirmed); Assert.Equal(4, calls);
    }
    [Fact(DisplayName = "REQ-002-04/30: SwitchDesktop rechazado no cierra el host y se reintenta hasta aplicar la pausa")]
    public void RejectedSwitchIsRetried()
    {
        var rejected = 2; var applied = new List<bool>();
        var transition = new DesktopTransition(blocked =>
        {
            if (blocked && rejected-- > 0) throw new System.ComponentModel.Win32Exception(5);
            applied.Add(blocked);
        });
        Assert.True(transition.TryApply(false)); Assert.False(transition.Blocked);
        Assert.False(transition.TryApply(true)); Assert.False(transition.TryApply(true));
        Assert.False(transition.Blocked); Assert.False(transition.Confirmed); Assert.Equal(2, transition.Failures);
        Assert.True(transition.TryApply(true)); Assert.True(transition.Blocked); Assert.True(transition.Confirmed);
        Assert.Equal(0, transition.Failures); Assert.Equal([false, true], applied);
        Assert.True(transition.TryApply(true)); Assert.Equal(2, applied.Count);
    }
    [Theory(DisplayName = "REQ-002-04/22/30: pausa vencida cobrando o sin red sigue aislada aunque se agote el restante")]
    [InlineData(true)]
    [InlineData(false)]
    public void PauseStaysIsolated(bool billing)
    {
        var clock = new Clock(); var state = new DesktopAuthorization(clock);
        state.Apply(State(paused: true, billing: billing));
        state.Apply(JsonSerializer.SerializeToElement(new { version = 1, kind = "status", status = "offline", pcName = "PC ensayo" }));
        clock.Ticks = 150_000;
        Assert.True(state.Blocked); Assert.True(state.HasSession);
        var snapshot = state.Snapshot();
        Assert.Equal(billing, snapshot.GetProperty("message").GetProperty("session").GetProperty("pause").GetProperty("billing").GetBoolean());
        Assert.Equal(150, snapshot.GetProperty("elapsedSeconds").GetInt64());
    }
    [Fact(DisplayName = "REQ-002-13: reanudar desde el panel abre uso; cerrar desde el panel en pausa deja bloqueo sin sesión")]
    public void PanelResumeAndClose()
    {
        var state = new DesktopAuthorization();
        state.Apply(State(paused: true)); Assert.True(state.Blocked);
        state.Apply(State()); Assert.False(state.Blocked); Assert.True(state.HasSession);
        state.Apply(State(paused: true));
        state.Apply(JsonSerializer.SerializeToElement(new { version = 1, kind = "message", elapsedSeconds = 0, message = new { type = "sessionEnded", sessionId = "01900000-0000-7000-8000-000000000124", reason = "staff" } }));
        Assert.True(state.Blocked); Assert.False(state.HasSession);
        Assert.Equal("locked", state.Snapshot().GetProperty("message").GetProperty("status").GetString());
        state.Apply(State(paused: true));
        state.Apply(JsonSerializer.SerializeToElement(new { version = 1, kind = "message", elapsedSeconds = 0, message = new { type = "state", status = "locked" } }));
        Assert.True(state.Blocked); Assert.False(state.HasSession);
    }
    [Fact(DisplayName = "REQ-002-07: el silencio sigue solo a la pausa del nodo y espera a la primera copia")]
    public void AudioFollowsNodePause()
    {
        var state = new DesktopAuthorization();
        Assert.False(state.Known); Assert.False(state.Paused);
        state.Apply(JsonSerializer.SerializeToElement(new { version = 1, kind = "status", status = "online", pcName = "PC ensayo" }));
        Assert.False(state.Known);
        state.Apply(State(paused: true, billing: true)); Assert.True(state.Known); Assert.True(state.Paused);
        state.Apply(JsonSerializer.SerializeToElement(new { version = 1, kind = "status", status = "offline", pcName = "PC ensayo" }));
        Assert.True(state.Paused);
        state.Apply(State()); Assert.False(state.Paused);
        state.Apply(State(paused: true));
        state.Apply(JsonSerializer.SerializeToElement(new { version = 1, kind = "message", elapsedSeconds = 0, message = new { type = "state", status = "locked" } }));
        Assert.False(state.Paused);
    }
    private static JsonElement State(bool paused = false, long age = 0, bool billing = false) => JsonSerializer.SerializeToElement(new
    {
        version = 1,
        kind = "message",
        elapsedSeconds = age,
        message = new
        {
            type = "state",
            status = "active",
            vesRate = (object?)null,
            session = new
            {
                kind = "account",
                sessionId = "01900000-0000-7000-8000-000000000124",
                startedAt = "2026-10-12T00:00:00Z",
                username = "Cliente",
                ratePerHour = new { micros = 1000000, currency = "USD" },
                money = new { micros = 1000000, currency = "USD" },
                moneySeconds = 100,
                comboSeconds = 0,
                remainingSeconds = 100,
                pause = paused ? new { startedAt = "2026-10-12T00:00:00Z", maxUntil = "2026-10-12T00:00:10Z", secondsLeft = billing ? 0 : 10, billing } : null
            }
        }
    });
    [Fact(DisplayName = "REQ-003-33/002-30: edad monotónica bloquea al agotarse, status offline no concede ni borra autorización")]
    public void AuthorizationAndAge()
    {
        var clock = new Clock(); var state = new DesktopAuthorization(clock);
        Assert.True(state.Blocked); Assert.False(state.HasSession);
        state.Apply(State(age: 50)); Assert.False(state.Blocked); Assert.True(state.HasSession);
        state.Apply(JsonSerializer.SerializeToElement(new { version = 1, kind = "status", status = "offline", pcName = "PC ensayo" }));
        clock.Ticks = 49_999; Assert.False(state.Blocked);
        clock.Ticks++; Assert.True(state.Blocked);
        Assert.Equal(100, state.Snapshot().GetProperty("elapsedSeconds").GetInt64());
        var fresh = new DesktopAuthorization(); Assert.True(fresh.Blocked);
        state.Apply(JsonSerializer.SerializeToElement(new { version = 1, kind = "message", elapsedSeconds = 0, message = new { type = "state", status = "locked" } }));
        Assert.True(state.Blocked); Assert.False(state.HasSession);
        Assert.Throws<InvalidDataException>(() => state.Apply(JsonSerializer.SerializeToElement(new { kind = "unlock" })));
    }
    [Fact(DisplayName = "REQ-002-04/30: pausa vencida permanece aislada hasta autorización explícita del nodo")]
    public void PauseCannotReleaseItself()
    {
        var clock = new Clock(); var state = new DesktopAuthorization(clock);
        state.Apply(State(paused: true)); clock.Ticks = 1_000_000;
        Assert.True(state.Blocked); Assert.True(state.HasSession);
        state.Apply(State()); Assert.False(state.Blocked);
    }
    [Fact(DisplayName = "REQ-003-30: revocación conserva selector de sesión, pero ningún estado del agente revocado abre uso")]
    public void RevocationRemainsIsolated()
    {
        var state = new DesktopAuthorization(); state.Apply(State());
        state.Apply(JsonSerializer.SerializeToElement(new { version = 1, kind = "message", elapsedSeconds = 0, message = new { type = "pcAuthenticationError", code = "pc_credential_revoked", message = "Credencial revocada" } }));
        state.Apply(JsonSerializer.SerializeToElement(new { version = 1, kind = "message", elapsedSeconds = 0, message = new { type = "state", status = "locked" } }));
        Assert.True(state.Blocked); Assert.True(state.HasSession);
        state.Apply(State()); Assert.True(state.Blocked);
        Assert.Equal("locked", state.Snapshot().GetProperty("message").GetProperty("status").GetString());
    }
    private sealed class Clock : TimeProvider
    {
        internal long Ticks;
        public override long TimestampFrequency => 1000;
        public override long GetTimestamp() => Ticks;
    }

    [Fact(DisplayName = "REQ-003-11/T34: tras revocar y revincular, el estado retenido sigue bloqueado y aislado; continuar lo libera")]
    public void HeldKeepsIsolationAndContinueUnblocks()
    {
        var state = new DesktopAuthorization();
        JsonElement Envelope(object message) => JsonSerializer.SerializeToElement(new { version = 1, kind = "message", elapsedSeconds = 0, message });
        var session = "01900000-0000-7000-8000-000000000124";
        var active = new
        {
            type = "state",
            status = "active",
            vesRate = (object?)null,
            session = new { kind = "temporary", sessionId = session, startedAt = "2026-10-22T20:00:00Z", name = "Temporal", purchasedSeconds = 100, remainingSeconds = 100 }
        };
        state.Apply(Envelope(active));
        Assert.False(state.Blocked);
        state.Apply(Envelope(new { type = "pcAuthenticationError", code = "pc_credential_revoked", message = "Credencial revocada" }));
        Assert.True(state.Blocked);
        // Aunque llegara un estado activo con la revocación vigente, sigue bloqueada.
        state.Apply(Envelope(active));
        Assert.True(state.Blocked);

        state.Apply(Envelope(new { type = "state", status = "held", sessionId = session, reason = "credential_revoked" }));
        Assert.True(state.Blocked);
        Assert.True(state.HasSession);
        Assert.False(state.Paused);
        Assert.Equal("held", state.Snapshot().GetProperty("message").GetProperty("status").GetString());

        state.Apply(Envelope(active));
        Assert.False(state.Blocked);
        Assert.False(state.Paused);
    }
}
