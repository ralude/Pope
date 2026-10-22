using System.Globalization;
using System.Text.Json;

namespace Pope.Agent;

// T40 · REQ-003-41, REQ-003-44: salida del mantenimiento guardada antes de enviarla al nodo.
// La PC la conserva, aunque se reinicie o no haya red, hasta que el nodo la reconoce; así se
// registra una sola vez con su actor y duración. EndedAt es la hora del nodo estimada y
// DurationSeconds sale del reloj monotónico, nunca de restar relojes de Windows.
internal sealed record ExitEntry(string ExitId, string MaintenanceId, string EndedAt, long DurationSeconds);

internal static class MaintenanceExitJournal
{
    // Techo de pendientes. Una salida de auditoría pendiente nunca se descarta para hacer sitio.
    internal const int Capacity = 16;
    private const string InstantFormat = "yyyy-MM-dd'T'HH:mm:ss.fff'Z'";

    // Añade la entrada si cabe. Repetir un ExitId no cambia nada; con el diario lleno devuelve
    // false y conserva todas las demás, para que el llamador no dé por registrada la salida.
    internal static (IReadOnlyList<ExitEntry> Entries, bool Added) TryAdd(IReadOnlyList<ExitEntry> entries, ExitEntry entry)
    {
        if (entries.Any(e => e.ExitId == entry.ExitId)) return (entries, true);
        if (entries.Count >= Capacity) return (entries, false);
        return (entries.Append(entry).ToList(), true);
    }

    internal static IReadOnlyList<ExitEntry> Remove(IReadOnlyList<ExitEntry> entries, string exitId) =>
        entries.Where(e => e.ExitId != exitId).ToList();

    internal static byte[] Serialize(IReadOnlyList<ExitEntry> entries) => JsonSerializer.SerializeToUtf8Bytes(new
    {
        version = 1,
        entries = entries.Select(e => new { exitId = e.ExitId, maintenanceId = e.MaintenanceId, endedAt = e.EndedAt, durationSeconds = e.DurationSeconds })
    });

    internal static IReadOnlyList<ExitEntry> Parse(ReadOnlySpan<byte> bytes)
    {
        try
        {
            if (bytes.Length is < 1 or > 8192) throw new InvalidDataException();
            using var document = JsonDocument.Parse(bytes.ToArray());
            var root = document.RootElement;
            if (root.EnumerateObject().Count() != 2 || root.GetProperty("version").GetInt32() != 1) throw new InvalidDataException();
            var entries = new List<ExitEntry>();
            foreach (var item in root.GetProperty("entries").EnumerateArray())
            {
                if (item.EnumerateObject().Count() != 4) throw new InvalidDataException();
                var exitId = item.GetProperty("exitId").GetString()!;
                var maintenanceId = item.GetProperty("maintenanceId").GetString()!;
                var endedAt = item.GetProperty("endedAt").GetString()!;
                var duration = item.GetProperty("durationSeconds").GetInt64();
                if (!Guid.TryParseExact(exitId, "D", out _) || !Guid.TryParseExact(maintenanceId, "D", out _) ||
                    !DateTimeOffset.TryParseExact(endedAt, InstantFormat, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out _) ||
                    duration is < 0 or > int.MaxValue)
                    throw new InvalidDataException();
                entries.Add(new ExitEntry(exitId, maintenanceId, endedAt, duration));
            }
            if (entries.Count > Capacity || entries.DistinctBy(e => e.ExitId).Count() != entries.Count) throw new InvalidDataException();
            return entries;
        }
        catch (Exception error) when (error is not InvalidDataException) { throw new InvalidDataException("Diario de salidas no válido."); }
    }
}
