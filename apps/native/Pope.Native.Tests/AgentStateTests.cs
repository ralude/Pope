using System.Text.Json;
using System.Security.Cryptography;
using Pope.Agent;
using Xunit;

namespace Pope.Native.Tests;

public sealed class AgentStateTests
{
    private const string Pc = "01900000-0000-7000-8000-000000000123";
    private const string Session = "01900000-0000-7000-8000-000000000124";
    private static JsonElement Message(object value) => ProtocolValidation.Parse(JsonSerializer.SerializeToUtf8Bytes(value), "node-to-pc");
    private static JsonElement Active(long remaining = 100) => Message(new
    {
        type = "state",
        status = "active",
        vesRate = (object?)null,
        session = new { kind = "temporary", sessionId = Session, startedAt = "2026-10-11T00:00:00Z", name = "Temporal", purchasedSeconds = 100, remainingSeconds = remaining }
    });

    [Fact(DisplayName = "REQ-003-04: el restante solo usa reloj monotónico; host nuevo no concede tiempo")]
    public void ClockAndHostRestart()
    {
        var clock = new Clock(); var state = new AgentState(Pc, clock);
        Assert.True(state.Blocked);
        state.Apply(Active());
        clock.Ticks += 20_900; clock.Utc = DateTimeOffset.MinValue;
        Assert.Equal(80, state.RemainingSeconds);
        Assert.Equal(20, state.Snapshot().ElapsedSeconds);
        Assert.Equal(Session, state.Snapshot().Message.GetProperty("session").GetProperty("sessionId").GetString());
        clock.Utc = DateTimeOffset.MaxValue; clock.Ticks += 80_000;
        Assert.Equal(0, state.RemainingSeconds); Assert.True(state.Blocked);
        Assert.Equal("locked", state.Snapshot().Message.GetProperty("status").GetString());
        state.Apply(Active(20)); Assert.False(state.Blocked); Assert.Equal(20, state.RemainingSeconds);
    }

    [Theory(DisplayName = "REQ-002-30/31: pausa offline sigue bloqueada y solo descuenta si el nodo autorizó billing")]
    [InlineData(false, 100)]
    [InlineData(true, 70)]
    public void PauseDoesNotInventPolicy(bool billing, long expected)
    {
        var clock = new Clock(); var state = new AgentState(Pc, clock);
        state.Apply(Message(new
        {
            type = "state",
            status = "active",
            vesRate = (object?)null,
            session = new
            {
                kind = "account",
                sessionId = Session,
                startedAt = "2026-10-11T00:00:00Z",
                username = "Cliente",
                ratePerHour = new { micros = 1000000, currency = "USD" },
                money = new { micros = 1000000, currency = "USD" },
                moneySeconds = 100,
                comboSeconds = 0,
                remainingSeconds = 100,
                pause = new { startedAt = "2026-10-11T00:00:00Z", maxUntil = "2026-10-11T00:00:10Z", secondsLeft = 10, billing }
            }
        }));
        clock.Ticks += 30_000;
        Assert.True(state.Blocked); Assert.Equal(expected, state.RemainingSeconds);
        Assert.Equal("active", state.Snapshot().Message.GetProperty("status").GetString());
        Assert.Equal(billing, state.Snapshot().Message.GetProperty("session").GetProperty("pause").GetProperty("billing").GetBoolean());
    }

    [Fact(DisplayName = "REQ-002-31/003-04: recuperación conserva identidad; arranque bloqueado sin inventar cierre")]
    public void RecoveryIsNotAuthorization()
    {
        var state = new AgentState(Pc); byte[]? saved = null;
        state.RecoveryChanged += bytes => saved = bytes;
        state.Apply(Active());
        Assert.Equal("unknown", JsonSerializer.SerializeToElement(state.Hello()).GetProperty("recoveryState").GetString());
        state.Apply(Message(new { type = "controlState", serverTime = "2026-10-11T00:00:00Z", context = new { kind = "session", revision = Pc, sessionId = Session } }));
        var restarted = new AgentState(Pc); restarted.Restore(saved!);
        Assert.True(restarted.Blocked); Assert.Null(restarted.RemainingSeconds);
        var hello = JsonSerializer.SerializeToElement(restarted.Hello());
        Assert.Equal("known", hello.GetProperty("recoveryState").GetString());
        Assert.Equal(Session, hello.GetProperty("sessionId").GetString());
        Assert.Equal(JsonValueKind.Null, hello.GetProperty("localRemainingSeconds").ValueKind);
        Assert.Throws<InvalidDataException>(() => new AgentState(Session).Restore(saved!));
        restarted.Apply(Active()); Assert.False(restarted.Blocked);
        restarted.Apply(Message(new { type = "state", status = "locked" }));
        Assert.True(restarted.Blocked); Assert.Equal("unknown", JsonSerializer.SerializeToElement(restarted.Hello()).GetProperty("recoveryState").GetString());
    }

    private sealed class Clock : TimeProvider
    {
        internal long Ticks; internal DateTimeOffset Utc = DateTimeOffset.UtcNow;
        public override long TimestampFrequency => 1000;
        public override long GetTimestamp() => Ticks;
        public override DateTimeOffset GetUtcNow() => Utc;
    }

    [Fact(DisplayName = "REQ-002-31/003-63: copia protegida recupera contexto; corrupción nunca autoriza")]
    public void ProtectedRecovery()
    {
        var original = new AgentState(Pc); byte[]? encrypted = null;
        original.RecoveryChanged += bytes =>
        {
            if (encrypted != null) CryptographicOperations.ZeroMemory(encrypted);
            try { encrypted = AgentCustody.Transform(bytes, protect: true); }
            finally { CryptographicOperations.ZeroMemory(bytes); }
        };
        original.Apply(Active());
        original.Apply(Message(new { type = "controlState", serverTime = "2026-10-11T00:00:00Z", context = new { kind = "session", revision = Pc, sessionId = Session } }));
        var restored = AgentCustody.Transform(encrypted!, protect: false);
        try
        {
            var rebooted = new AgentState(Pc); rebooted.Restore(restored);
            Assert.True(rebooted.Blocked); Assert.Null(rebooted.RemainingSeconds);
            Assert.Equal(Session, JsonSerializer.SerializeToElement(rebooted.Hello()).GetProperty("sessionId").GetString());
            encrypted![0] ^= 255;
            Assert.Throws<InvalidDataException>(() => AgentCustody.Transform(encrypted, protect: false));
            Assert.True(new AgentState(Pc).Blocked);
        }
        finally { CryptographicOperations.ZeroMemory(restored); CryptographicOperations.ZeroMemory(encrypted!); }
    }
}
