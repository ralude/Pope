using System.Text.Json;

namespace Pope.ShellHost;

internal readonly record struct AudioEndpoint(string Id, bool Muted);

// Salidas de audio activas; la implementación de Windows es CoreAudioEndpoints.
internal interface IAudioEndpoints
{
    IReadOnlyList<AudioEndpoint> Active();
    void SetMute(string id, bool muted);
}

// REQ-002-07: silencio durante la pausa y vuelta exacta al mute previo de cada salida.
// Diario escrito antes de silenciar: un host reiniciado o una reconexión no vuelven a
// capturar como «original» un silencio que puso Pope. Solo cambia el mute, nunca el volumen.
internal sealed class PauseAudio(IAudioEndpoints endpoints, string journal)
{
    internal const int MaximumDevices = 64;
    private const int MaximumBytes = 65_536;
    private Dictionary<string, bool>? captured;
    internal IReadOnlyDictionary<string, bool>? Captured => captured;

    internal void Load()
    {
        captured = null;
        if (!File.Exists(journal)) return;
        try
        {
            var bytes = File.ReadAllBytes(journal);
            if (bytes.Length > MaximumBytes) throw new InvalidDataException();
            using var document = JsonDocument.Parse(bytes);
            var root = document.RootElement;
            if (root.EnumerateObject().Count() != 2 || root.GetProperty("version").GetInt32() != 1) throw new InvalidDataException();
            var devices = root.GetProperty("devices");
            if (devices.GetArrayLength() > MaximumDevices) throw new InvalidDataException();
            var loaded = new Dictionary<string, bool>(StringComparer.Ordinal);
            foreach (var device in devices.EnumerateArray())
            {
                if (device.EnumerateObject().Count() != 2) throw new InvalidDataException();
                var id = device.GetProperty("id").GetString();
                if (id is not { Length: > 0 and <= 512 } || !loaded.TryAdd(id, device.GetProperty("muted").GetBoolean())) throw new InvalidDataException();
            }
            captured = loaded;
        }
        catch (Exception error) when (error is InvalidDataException or JsonException or InvalidOperationException or KeyNotFoundException or FormatException)
        {
            // Sin originales fiables no se inventan: se descarta y la próxima pausa captura de nuevo.
            File.Delete(journal);
        }
    }

    // Un ciclo idempotente: se llama al cambiar el estado y cada segundo mientras haga falta.
    internal bool Cycle(bool paused)
    {
        var active = endpoints.Active();
        if (paused)
        {
            captured ??= new Dictionary<string, bool>(StringComparer.Ordinal);
            var added = false;
            foreach (var device in active)
                if (captured.Count < MaximumDevices && captured.TryAdd(device.Id, device.Muted)) added = true;
            if (added) Save();
            foreach (var device in active)
                if (!device.Muted && captured.ContainsKey(device.Id)) Try(() => endpoints.SetMute(device.Id, true));
            return true;
        }
        if (captured is null) return false;
        foreach (var device in active)
        {
            if (!captured.TryGetValue(device.Id, out var original)) continue;
            if (device.Muted == original || Try(() => endpoints.SetMute(device.Id, original))) captured.Remove(device.Id);
        }
        // Una salida desconectada conserva su original hasta reaparecer.
        if (captured.Count == 0) { captured = null; File.Delete(journal); return false; }
        Save();
        return true;
    }

    private static bool Try(Action action)
    {
        // Una salida que desaparece a mitad del ciclo no detiene el resto.
        try { action(); return true; }
        catch (Exception error) when (error is System.Runtime.InteropServices.COMException or InvalidOperationException) { return false; }
    }

    private void Save()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(journal)!);
        var temporary = journal + ".tmp";
        File.WriteAllBytes(temporary, JsonSerializer.SerializeToUtf8Bytes(new
        {
            version = 1,
            devices = captured!.Select(device => new { id = device.Key, muted = device.Value })
        }));
        File.Move(temporary, journal, overwrite: true);
    }
}
