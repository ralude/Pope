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
    private static JsonElement State(bool paused = false, long age = 0) => JsonSerializer.SerializeToElement(new
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
                pause = paused ? new { startedAt = "2026-10-12T00:00:00Z", maxUntil = "2026-10-12T00:00:10Z", secondsLeft = 10, billing = false } : null
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
}
