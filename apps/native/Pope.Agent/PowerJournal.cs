using System.Text.Json;

namespace Pope.Agent;

// T31 · REQ-003-20: resultado de cada reinicio o apagado, guardado antes de pedírselo a
// Windows. Tras reiniciar, una orden repetida con el mismo ID no vuelve a ejecutarse.
internal sealed record PowerEntry(string Id, string Kind, string Status, string? Code);

internal static class PowerJournal
{
    internal const int Capacity = 16;
    private static readonly string[] Kinds = ["restart", "powerOff"];

    // Añade o sustituye la entrada y conserva solo las más recientes.
    internal static IReadOnlyList<PowerEntry> With(IReadOnlyList<PowerEntry> entries, PowerEntry entry) =>
        entries.Where(e => e.Id != entry.Id).Append(entry).TakeLast(Capacity).ToList();

    internal static byte[] Serialize(IReadOnlyList<PowerEntry> entries) => JsonSerializer.SerializeToUtf8Bytes(new
    {
        version = 1,
        entries = entries.Select(e => new { id = e.Id, kind = e.Kind, status = e.Status, code = e.Code })
    });

    internal static IReadOnlyList<PowerEntry> Parse(ReadOnlySpan<byte> bytes)
    {
        try
        {
            if (bytes.Length is < 1 or > 8192) throw new InvalidDataException();
            using var document = JsonDocument.Parse(bytes.ToArray());
            var root = document.RootElement;
            if (root.EnumerateObject().Count() != 2 || root.GetProperty("version").GetInt32() != 1) throw new InvalidDataException();
            var entries = new List<PowerEntry>();
            foreach (var item in root.GetProperty("entries").EnumerateArray())
            {
                if (item.EnumerateObject().Count() != 4) throw new InvalidDataException();
                var id = item.GetProperty("id").GetString()!;
                var kind = item.GetProperty("kind").GetString()!;
                var status = item.GetProperty("status").GetString()!;
                var code = item.GetProperty("code").ValueKind == JsonValueKind.Null ? null : item.GetProperty("code").GetString();
                if (!Guid.TryParseExact(id, "D", out _) || !Kinds.Contains(kind) ||
                    (status, code) is not (("accepted", null) or ("failed", "native_failure")))
                    throw new InvalidDataException();
                entries.Add(new PowerEntry(id, kind, status, code));
            }
            if (entries.Count > Capacity || entries.DistinctBy(e => e.Id).Count() != entries.Count) throw new InvalidDataException();
            return entries;
        }
        catch (Exception error) when (error is not InvalidDataException) { throw new InvalidDataException("Diario de energía no válido."); }
    }
}
