using System.Text.Json;

namespace Pope.Agent;

// REQ-003-04 / REQ-002-30/31: contador de autorización, nunca cálculo de cobro.
internal sealed class AgentState(string pcId, TimeProvider? timeProvider = null)
{
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    private readonly object gate = new();
    private JsonElement? state;
    private JsonElement? context;
    private string? sessionId;
    private long remaining;
    private long timestamp;
    private bool paused;
    private bool billing;
    private bool rejected;
    private bool authorized;
    internal event Action<byte[]>? RecoveryChanged;

    internal void Apply(JsonElement message)
    {
        // Aunque llegue de otro componente interno, validar antes de conservar identidad.
        message = ProtocolValidation.Parse(JsonSerializer.SerializeToUtf8Bytes(message), "node-to-pc");
        lock (gate)
        {
            switch (message.GetProperty("type").GetString())
            {
                case "state":
                    state = message; timestamp = clock.GetTimestamp(); authorized = !rejected;
                    sessionId = null; remaining = 0; paused = false; billing = true;
                    if (message.GetProperty("status").GetString() == "active")
                    {
                        var session = message.GetProperty("session");
                        sessionId = session.GetProperty("sessionId").GetString();
                        remaining = session.GetProperty("remainingSeconds").GetInt64();
                        paused = session.TryGetProperty("pause", out var pause) && pause.ValueKind != JsonValueKind.Null;
                        if (paused) billing = pause.GetProperty("billing").GetBoolean();
                    }
                    PersistRecovery();
                    break;
                case "controlState":
                    context = message.GetProperty("context"); PersistRecovery(); break;
                case "sessionEnded":
                    state = null; sessionId = null; remaining = 0; paused = false; PersistRecovery(); break;
                case "pcAuthenticationError":
                    rejected = true; authorized = false; break;
            }
        }
    }

    internal long? RemainingSeconds
    {
        get { lock (gate) return Remaining(); }
    }
    internal bool Blocked
    {
        get { lock (gate) return !authorized || rejected || sessionId is null || paused || Remaining() <= 0; }
    }
    private long? Remaining() => sessionId is null || !authorized ? null :
        Math.Max(0, remaining - (paused && !billing ? 0 : Elapsed()));
    private long Elapsed() => (long)Math.Max(0, Math.Floor(clock.GetElapsedTime(timestamp).TotalSeconds));

    // El host nuevo recibe la misma copia y su edad monotónica, sin reiniciar el contador.
    internal (JsonElement Message, long ElapsedSeconds) Snapshot()
    {
        lock (gate)
        {
            if (!authorized || rejected || state is null || (!paused && sessionId != null && Remaining() <= 0))
                return (JsonSerializer.SerializeToElement(new { type = "state", status = "locked" }), 0);
            return (state.Value, Elapsed());
        }
    }

    internal object Hello()
    {
        lock (gate) return Recovery(includeRemaining: true);
    }
    internal object Heartbeat()
    {
        lock (gate) return new { type = "heartbeat", sessionId, localRemainingSeconds = Remaining(), controlContext = Compatible() ? context : null };
    }
    private bool Compatible() => context is JsonElement value &&
        ((sessionId is null && value.GetProperty("kind").GetString() == "free") ||
         (sessionId != null && value.GetProperty("kind").GetString() == "session" && value.GetProperty("sessionId").GetString() == sessionId));
    private object Recovery(bool includeRemaining) => new
    {
        type = "hello",
        protocolVersion = 2,
        pcId,
        recoveryState = Compatible() ? "known" : "unknown",
        sessionId = Compatible() ? sessionId : null,
        localRemainingSeconds = Compatible() && includeRemaining ? Remaining() : null,
        controlContext = Compatible() ? context : null,
        pendingMaintenanceExitId = (string?)null
    };
    private void PersistRecovery() => RecoveryChanged?.Invoke(JsonSerializer.SerializeToUtf8Bytes(Recovery(includeRemaining: false)));

    internal void Restore(ReadOnlyMemory<byte> bytes)
    {
        var hello = ProtocolValidation.Parse(bytes, "pc-to-node");
        if (hello.GetProperty("type").GetString() != "hello" || hello.GetProperty("pcId").GetString() != pcId ||
            hello.GetProperty("pendingMaintenanceExitId").ValueKind != JsonValueKind.Null ||
            (hello.TryGetProperty("localRemainingSeconds", out var local) && local.ValueKind != JsonValueKind.Null))
            throw new InvalidDataException("Recuperación no válida.");
        lock (gate)
        {
            // Tras reiniciar nunca reutilizar autorización/tiempo de otro arranque.
            authorized = false; state = null; remaining = 0; paused = false;
            sessionId = hello.GetProperty("sessionId").GetString();
            context = hello.GetProperty("controlContext").ValueKind == JsonValueKind.Null ? null : hello.GetProperty("controlContext");
            if (hello.GetProperty("recoveryState").GetString() == "known" && !Compatible())
            {
                sessionId = null; context = null;
                throw new InvalidDataException("Recuperación no válida.");
            }
        }
    }
}
