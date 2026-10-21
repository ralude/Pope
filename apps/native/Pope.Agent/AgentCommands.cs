using System.Globalization;
using System.Text.Json;

namespace Pope.Agent;

// REQ-003-20/34 (T29): órdenes del nodo. Solo acciones cerradas del contrato, nunca un
// ejecutable, ruta o script. El agente las compara con su último controlState y con la hora
// del nodo antes de ejecutar, y responde con un acuse que no impone actor.
internal sealed class AgentCommands(AgentState state, ClientSessionCleanup cleanup,
    Func<ReadOnlyMemory<byte>, CancellationToken, Task<bool>> send, AgentLog? log = null)
{
    private const int Remembered = 64;
    private static readonly TimeSpan Lifetime = TimeSpan.FromSeconds(30);
    private readonly SemaphoreSlim serial = new(1, 1);
    // Último acuse de cada orden reciente: una orden repetida (reenvío al reconectar) no se
    // vuelve a ejecutar. En memoria: repetir un bloqueo tras reiniciar el agente es inocuo.
    private readonly Dictionary<string, byte[]> answered = [];
    private readonly Queue<string> order = new();
    private readonly object gate = new();
    private Task running = Task.CompletedTask;

    // Lo llama el canal por cada mensaje del nodo; la orden se atiende fuera del bucle de recepción.
    internal void OnMessage(JsonElement message)
    {
        if (message.GetProperty("type").GetString() != "command") return;
        var command = message.GetProperty("command").Clone();
        lock (gate) running = HandleAsync(command, CancellationToken.None);
    }

    // Para los tests: espera a que se atiendan las órdenes ya recibidas.
    internal Task Idle() { lock (gate) return running; }

    internal async Task HandleAsync(JsonElement command, CancellationToken token)
    {
        await serial.WaitAsync(token);
        try { await Execute(command, token); }
        // Sin respuesta: el nodo la repite o la da por vencida; nunca contenido en el log.
        catch (Exception error) when (error is not OperationCanceledException) { log?.Write(AgentLogCode.CommandRejected); }
        finally { serial.Release(); }
    }

    private async Task Execute(JsonElement command, CancellationToken token)
    {
        var id = command.GetProperty("id").GetString()!;
        var kind = command.GetProperty("action").GetProperty("kind").GetString()!;
        if (answered.TryGetValue(id, out var previous)) { await send(previous, token); return; }
        var (context, now) = state.Control();
        var refusal = Refusal(command, context, now);
        if (refusal != null)
        {
            log?.Write(AgentLogCode.CommandRejected);
            await Answer(id, Failed(kind, refusal, "La orden no corresponde al estado de esta PC."), now, token);
            return;
        }
        // Cada tipo se activa en su tarea: reiniciar/apagar (T31), mensajes (T32), mantenimiento (T37/T40).
        if (kind != "lock")
        {
            log?.Write(AgentLogCode.CommandRejected);
            await Answer(id, Failed(kind, "invalid_action", "Orden no disponible en este agente."), now, token);
            return;
        }
        await send(Ack(id, new { status = "accepted", kind }, now), token);
        state.EndLocalSession();
        // REQ-003-34: el bloqueo solo se confirma cuando la limpieza del último fin de sesión
        // terminó sin dejar procesos del cliente; si quedan, la PC sigue sin admitir clientes.
        var remaining = await cleanup.Settled();
        log?.Write(remaining == 0 ? AgentLogCode.LockApplied : AgentLogCode.LockFailed);
        await Answer(id, remaining == 0
            ? new { status = "applied", effect = new { kind } }
            : Failed(kind, "native_failure", "Quedan procesos del cliente abiertos."), state.Control().NodeNow, token);
    }

    // Equivalente a isPcCommandCurrent de @pope/shared: vigencia de 30 s con la hora del nodo y
    // el mismo contexto (tipo, revisión e IDs). Devuelve el código de fallo o null si vale.
    internal static string? Refusal(JsonElement command, JsonElement? context, DateTimeOffset? now)
    {
        var issued = Instant(command.GetProperty("issuedAt"));
        var expires = Instant(command.GetProperty("expiresAt"));
        if (now is null || context is null) return "stale_context";
        if (expires - issued != Lifetime || now < issued || now >= expires) return "expired";
        var expected = command.GetProperty("expected");
        var current = context.Value;
        var kind = expected.GetProperty("kind").GetString();
        if (kind != current.GetProperty("kind").GetString() ||
            expected.GetProperty("revision").GetString() != current.GetProperty("revision").GetString()) return "stale_context";
        if (kind == "session" && expected.GetProperty("sessionId").GetString() != current.GetProperty("sessionId").GetString()) return "stale_context";
        if (kind == "maintenance" && expected.GetProperty("maintenanceId").GetString() != current.GetProperty("maintenanceId").GetString()) return "stale_context";
        return null;
    }

    private static DateTimeOffset Instant(JsonElement value) =>
        DateTimeOffset.Parse(value.GetString()!, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal);

    private static object Failed(string kind, string code, string message) => new { status = "failed", kind, code, message };

    private static byte[] Ack(string id, object result, DateTimeOffset? now) => JsonSerializer.SerializeToUtf8Bytes(new
    {
        type = "commandAck",
        commandId = id,
        occurredAt = (now ?? DateTimeOffset.UtcNow).UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture),
        result
    });

    private async Task Answer(string id, object result, DateTimeOffset? now, CancellationToken token)
    {
        var bytes = Ack(id, result, now);
        answered[id] = bytes; order.Enqueue(id);
        while (order.Count > Remembered) answered.Remove(order.Dequeue());
        // Sin conexión el acuse se pierde: el nodo repite el bloqueo al reconectar (T29b).
        await send(bytes, token);
    }
}
