using System.Text.Json;
using Pope.Bridge;

namespace Pope.ShellHost;

// REQ-003-33 / REQ-002-30: solo interpreta autorización y edad; nunca decide cobro/fin de pausa.
internal sealed class DesktopAuthorization(TimeProvider? timeProvider = null)
{
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    private readonly object gate = new();
    private JsonElement? saved;
    private long at, age, remaining;
    private bool active, paused, session, revoked, known;
    internal bool HasSession { get { lock (gate) return session; } }
    // REQ-002-07: silencio solo con pausa del nodo; Known evita actuar antes de la primera copia.
    internal bool Known { get { lock (gate) return known; } }
    internal bool Paused { get { lock (gate) return active && paused; } }
    internal bool Blocked { get { lock (gate) return !active || paused || remaining <= Age(); } }
    private long Age() => age + (long)Math.Max(0, clock.GetElapsedTime(at).TotalSeconds);
    internal void Apply(JsonElement envelope)
    {
        envelope = ProtocolValidation.Parse(JsonSerializer.SerializeToUtf8Bytes(envelope), "bridge-event");
        if (envelope.GetProperty("kind").GetString() != "message") return;
        var message = envelope.GetProperty("message");
        lock (gate)
        {
            known |= message.GetProperty("type").GetString() is "pcAuthenticationError" or "sessionEnded" or "state";
            if (message.GetProperty("type").GetString() == "pcAuthenticationError") { active = false; revoked = true; return; }
            if (message.GetProperty("type").GetString() == "sessionEnded") { active = false; session = false; saved = null; return; }
            if (message.GetProperty("type").GetString() != "state") return;
            saved = envelope; at = clock.GetTimestamp(); age = envelope.GetProperty("elapsedSeconds").GetInt64();
            if (message.GetProperty("status").GetString() == "held")
            {
                // T34: la PC se revinculó y el nodo retiene su sesión: sigue bloqueada, aislada como con la
                // revocación (Alt+Tab no llega al juego) y sin silenciar el audio; el rechazo anterior ya no vale.
                active = false; session = true; paused = false; remaining = 0; revoked = false;
                return;
            }
            active = !revoked && message.GetProperty("status").GetString() == "active";
            session = active || (revoked && session); paused = false; remaining = 0;
            if (active)
            {
                var value = message.GetProperty("session"); remaining = value.GetProperty("remainingSeconds").GetInt64();
                paused = value.TryGetProperty("pause", out var pause) && pause.ValueKind != JsonValueKind.Null;
            }
        }
    }
    internal JsonElement Snapshot()
    {
        lock (gate)
        {
            var message = saved is { } value && (active || value.GetProperty("message").GetProperty("status").GetString() is "locked" or "held")
                ? value.GetProperty("message") : JsonSerializer.SerializeToElement(new { type = "state", status = "locked" });
            return JsonSerializer.SerializeToElement(new { version = 1, kind = "message", message, elapsedSeconds = saved is null ? 0 : Age() });
        }
    }
}
