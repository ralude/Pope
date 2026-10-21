using System.Text.Json;

namespace Pope.Agent;

// Host del cliente asociado al agente: identidad retenida que protege a Pope y fija el ámbito.
internal sealed record ClientHost(uint Session, string UserSid, string LogonSid, uint Pid, long Created, string? Image);

// REQ-003-34 / CA-003-08: abre el ámbito al empezar una sesión Pope y, cuando el nodo la
// termina, cierra sus procesos. Pausa, revocación y agotamiento local sin red no cierran nada.
internal sealed class ClientSessionCleanup(Func<ClientHost?> host, Func<IReadOnlyList<ProcessEntry>> snapshot,
    Func<ProcessEntry, bool> close, Action<ClientScope?> persist, AgentLog? log = null)
{
    private const long Minute = 600_000_000; // FILETIME en unidades de 100 ns.
    private readonly SemaphoreSlim serial = new(1, 1);
    private readonly object gate = new();
    private ClientScope? scope;
    // T29: la última limpieza y cuántos procesos del cliente dejó; el bloqueo la espera.
    private Task<int> last = Task.FromResult(0);
    internal Func<long> Now { get; init; } = () => DateTime.UtcNow.ToFileTimeUtc();
    // Arranque de Windows aproximado al segundo: un ámbito de otro arranque nunca se usa.
    internal Func<long> Boot { get; init; } = () => DateTime.UtcNow.AddMilliseconds(-Environment.TickCount64).ToFileTimeUtc();
    internal int Passes { get; init; } = 3;
    internal TimeSpan Interval { get; init; } = TimeSpan.FromMilliseconds(500);
    internal ClientScope? Scope { get { lock (gate) return scope; } }

    internal void Restore(ClientScope? saved)
    {
        lock (gate)
        {
            scope = saved != null && Math.Abs(saved.Boot - Boot()) < Minute && saved.Start >= saved.Boot ? saved : null;
            if (saved != null && scope is null) { persist(null); log?.Write(AgentLogCode.ClientScopeRejected); }
        }
    }

    internal void Started(string sessionId)
    {
        lock (gate)
        {
            // Sin host asociado no hay sesión de Windows conocida: no se abre ámbito ni se cerrará nada.
            scope = host() is { } client ? new ClientScope(sessionId, client.Session, client.UserSid, client.LogonSid, Now(), Boot()) : null;
            persist(scope);
        }
    }

    // Devuelve cuántos procesos del cliente quedaron abiertos (0 sin ámbito que limpiar).
    internal Task<int> Finished(string sessionId)
    {
        ClientScope ended; long cutoff;
        lock (gate)
        {
            cutoff = Now();
            if (scope is null || scope.SessionId != sessionId) return last = Task.FromResult(0);
            ended = scope; scope = null; persist(null);
            return last = Task.Run(() => Run(ended, cutoff));
        }
    }

    // La limpieza del último fin de sesión, terminada o en curso.
    internal Task<int> Settled() { lock (gate) return last; }

    private async Task<int> Run(ClientScope ended, long cutoff)
    {
        await serial.WaitAsync();
        try
        {
            var client = host();
            // Otro logon del cliente (cambio de cuenta o sesión) no comparte procesos con este ámbito.
            if (client != null && client.LogonSid != ended.LogonSid) { log?.Write(AgentLogCode.ClientScopeRejected); return 0; }
            IReadOnlyCollection<(uint, long)> roots = client is null ? [] : [(client.Pid, client.Created)];
            var closed = new List<ProcessEntry>();
            for (var pass = 0; pass < Passes; pass++)
            {
                var targets = ClientProcessPolicy.Targets(snapshot(), ended, cutoff, roots, client?.Image, closed);
                if (targets.Count == 0) break;
                foreach (var target in targets) if (close(target)) closed.Add(target);
                await Task.Delay(Interval);
            }
            var remaining = ClientProcessPolicy.Targets(snapshot(), ended, cutoff, roots, client?.Image, closed).Count;
            if (closed.Count > 0) log?.Write(AgentLogCode.ClientProcessesClosed);
            if (remaining > 0) log?.Write(AgentLogCode.ClientProcessesRemaining);
            return remaining;
        }
        // Sin nombres ni excepciones en el log; un fallo no puede confirmar la limpieza.
        catch { log?.Write(AgentLogCode.ClientProcessesRemaining); return 1; }
        finally { serial.Release(); }
    }

    internal static byte[] Serialize(ClientScope value) => JsonSerializer.SerializeToUtf8Bytes(new
    {
        version = 1,
        sessionId = value.SessionId,
        session = value.Session,
        userSid = value.UserSid,
        logonSid = value.LogonSid,
        start = value.Start,
        boot = value.Boot
    });

    internal static ClientScope Parse(ReadOnlySpan<byte> bytes)
    {
        try
        {
            if (bytes.Length is < 1 or > 4096) throw new InvalidDataException();
            using var document = JsonDocument.Parse(bytes.ToArray());
            var root = document.RootElement;
            if (root.EnumerateObject().Count() != 7 || root.GetProperty("version").GetInt32() != 1) throw new InvalidDataException();
            var id = root.GetProperty("sessionId").GetString()!;
            if (!Guid.TryParseExact(id, "D", out _)) throw new InvalidDataException();
            var user = root.GetProperty("userSid").GetString()!; var logon = root.GetProperty("logonSid").GetString()!;
            if (!user.StartsWith("S-1-", StringComparison.Ordinal) || !logon.StartsWith("S-1-5-5-", StringComparison.Ordinal) || user.Length > 184 || logon.Length > 184)
                throw new InvalidDataException();
            var parsed = new ClientScope(id, root.GetProperty("session").GetUInt32(), user, logon, root.GetProperty("start").GetInt64(), root.GetProperty("boot").GetInt64());
            if (parsed.Session == 0 || parsed.Start <= 0 || parsed.Boot <= 0) throw new InvalidDataException();
            return parsed;
        }
        catch (Exception error) when (error is not InvalidDataException) { throw new InvalidDataException("Ámbito no válido."); }
    }
}
