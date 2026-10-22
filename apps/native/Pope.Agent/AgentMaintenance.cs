using System.Globalization;
using System.Text.Json;

namespace Pope.Agent;

// T40 · REQ-003-41, REQ-003-43, REQ-003-44, CA-003-09: el mantenimiento visto desde el agente.
// Terminar y bloquear nunca espera a la red: se cierra el entorno, se bloquea, se guarda la
// salida en el diario protegido y solo entonces se intenta enviar. La salida se reenvía hasta
// que el nodo la reconoce, así que el nodo la registra una sola vez aunque haya cortes. Una
// pérdida de conexión no termina el mantenimiento ni inicia otro (REQ-003-44).
internal sealed class AgentMaintenance(IReadOnlyList<ExitEntry> saved, Action<IReadOnlyList<ExitEntry>> store,
    Func<ReadOnlyMemory<byte>, CancellationToken, Task<bool>> send,
    // T37 cerrará aquí la sesión de Windows de mantenimiento y sus procesos propios.
    Func<CancellationToken, Task<bool>> closeSession,
    // Bloqueo local por el mismo camino que la orden `lock`: termina la sesión local y limpia.
    Func<CancellationToken, Task<bool>> lockPc,
    Func<DateTimeOffset?> nodeNow, TimeProvider? timeProvider = null, AgentLog? log = null)
{
    private const string InstantFormat = "yyyy-MM-dd'T'HH:mm:ss.fff'Z'";
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    private readonly SemaphoreSlim serial = new(1, 1);
    private readonly object gate = new();
    private IReadOnlyList<ExitEntry> entries = saved;
    private string? maintenanceId;
    private DateTimeOffset? startedAt;
    private long learnedAt;

    // Mensajes del nodo: el mantenimiento vigente y el reconocimiento de una salida.
    internal void OnMessage(JsonElement message)
    {
        switch (message.GetProperty("type").GetString())
        {
            case "maintenanceState":
                var maintenance = message.GetProperty("maintenance");
                lock (gate)
                {
                    if (maintenance.ValueKind == JsonValueKind.Null) { maintenanceId = null; startedAt = null; return; }
                    var id = maintenance.GetProperty("id").GetString();
                    // Un estado repetido (tras reconectar) no reinicia la marca monotónica.
                    if (id != maintenanceId) learnedAt = clock.GetTimestamp();
                    maintenanceId = id;
                    startedAt = DateTimeOffset.Parse(maintenance.GetProperty("startedAt").GetString()!, CultureInfo.InvariantCulture);
                }
                break;
            case "maintenanceExitAcknowledged":
                Acknowledge(message.GetProperty("exitId").GetString()!);
                break;
        }
    }

    private void Acknowledge(string exitId)
    {
        lock (gate)
        {
            // Un reconocimiento duplicado o de otra salida no cambia nada ni toca el disco.
            if (entries.All(e => e.ExitId != exitId)) return;
            var next = MaintenanceExitJournal.Remove(entries, exitId);
            try { store(next); }
            // Sin guardar, se conserva la entrada: como mucho se reenvía una vez más.
            catch { log?.Write(AgentLogCode.ExitJournalRejected); return; }
            entries = next;
        }
    }

    internal string? Current { get { lock (gate) return maintenanceId; } }

    // Primera salida pendiente, para el `hello` (pendingMaintenanceExitId).
    internal string? FirstPending() { lock (gate) return entries.FirstOrDefault()?.ExitId; }

    internal IReadOnlyList<ExitEntry> Pending { get { lock (gate) return entries; } }

    // Cierra el entorno, bloquea y guarda la salida antes de enviarla. `exitId` es el de la orden
    // del panel; sin él, uno nuevo. Devuelve la salida o el motivo del fallo. Idempotente: una
    // orden repetida cuya salida ya está guardada devuelve esa misma salida.
    internal async Task<(ExitEntry? Exit, string? Failure)> FinishAsync(string? exitId, string? expectedMaintenance, CancellationToken token)
    {
        await serial.WaitAsync(token);
        try
        {
            string? current; DateTimeOffset? started; long learned;
            lock (gate)
            {
                current = maintenanceId; started = startedAt; learned = learnedAt;
                if (current is null && exitId != null && entries.FirstOrDefault(e => e.ExitId == exitId) is { } done) return (done, null);
            }
            if (current is null) return (null, "No hay un mantenimiento abierto en esta PC.");
            if (expectedMaintenance != null && expectedMaintenance != current) return (null, "El mantenimiento no corresponde al de esta PC.");
            if (!await closeSession(token)) return (null, "No se pudo cerrar el entorno de mantenimiento.");
            if (!await lockPc(token)) return (null, "Quedan procesos del cliente abiertos.");

            var now = nodeNow() ?? DateTimeOffset.UtcNow;
            // Duración: lo que dice el nodo si lo sabemos y, si no, el reloj monotónico del agente.
            var viaNode = nodeNow() is { } node && started is { } begin ? (long)Math.Max(0, (node - begin).TotalSeconds) : 0;
            var viaClock = (long)Math.Max(0, clock.GetElapsedTime(learned).TotalSeconds);
            var entry = new ExitEntry(exitId ?? Guid.CreateVersion7().ToString(), current,
                now.UtcDateTime.ToString(InstantFormat, CultureInfo.InvariantCulture), Math.Max(viaNode, viaClock));

            lock (gate)
            {
                var (next, added) = MaintenanceExitJournal.TryAdd(entries, entry);
                // Con el diario lleno no se descarta ninguna salida pendiente: se avisa y se conserva todo.
                if (!added) { log?.Write(AgentLogCode.ExitJournalFull); return (null, "Hay demasiadas salidas pendientes de registrar."); }
                try { store(next); }
                catch { log?.Write(AgentLogCode.ExitJournalRejected); return (null, "No se pudo guardar la salida del mantenimiento."); }
                entries = next; maintenanceId = null; startedAt = null;
            }
            log?.Write(AgentLogCode.ExitRecorded);
            return (entry, null);
        }
        finally { serial.Release(); }
    }

    // «Terminar y bloquear» pulsado en la PC: la salida va al nodo como mensaje propio.
    internal async Task<bool> EndForShellAsync(string maintenance, CancellationToken token)
    {
        var (exit, _) = await FinishAsync(null, maintenance, token);
        if (exit is null) return false;
        await SendExitAsync(exit, token);
        return true;
    }

    internal static object Describe(ExitEntry entry) => new
    {
        id = entry.ExitId,
        maintenanceId = entry.MaintenanceId,
        endedAt = entry.EndedAt,
        durationSeconds = entry.DurationSeconds
    };

    // Sin red, el envío falla y la salida sigue en el diario hasta que el nodo la reconozca.
    internal async Task SendExitAsync(ExitEntry entry, CancellationToken token)
    {
        try { await send(JsonSerializer.SerializeToUtf8Bytes(new { type = "maintenanceExit", exit = Describe(entry) }), token); }
        catch (Exception error) when (error is not OperationCanceledException) { /* Se reenvía al reconectar. */ }
    }

    // Al reconectar: todas las pendientes, una por mensaje; el nodo reconoce cada una una vez.
    internal async Task ResendPendingAsync(CancellationToken token)
    {
        foreach (var entry in Pending) await SendExitAsync(entry, token);
    }
}
