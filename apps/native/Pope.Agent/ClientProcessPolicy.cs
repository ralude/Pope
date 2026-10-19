namespace Pope.Agent;

// Proceso visto por el agente; Created es FILETIME UTC del kernel (identidad junto al PID).
internal readonly record struct ProcessEntry(uint Pid, uint ParentPid, long Created, uint Session, string? UserSid, string? Image, bool Critical);

// Sesión Pope de un cliente: su sesión de Windows, usuario y logon, y cuándo empezó.
// Boot identifica el arranque de Windows: un ámbito de otro arranque nunca es válido.
internal sealed record ClientScope(string SessionId, uint Session, string UserSid, string LogonSid, long Start, long Boot);

// REQ-003-34 / CA-003-08: decide qué procesos pertenecen al cliente que terminó. Sin efectos.
internal static class ClientProcessPolicy
{
    internal const string WebView = "msedgewebview2.exe";

    internal static IReadOnlyList<ProcessEntry> Targets(IReadOnlyList<ProcessEntry> all, ClientScope scope, long cutoff,
        IReadOnlyCollection<(uint Pid, long Created)> popeRoots, string? popeImage, IReadOnlyCollection<ProcessEntry>? closed = null)
    {
        var byPid = new Dictionary<uint, ProcessEntry>();
        foreach (var entry in all) byPid.TryAdd(entry.Pid, entry);
        bool ChildOf(ProcessEntry child, ISet<uint> parents) =>
            parents.Contains(child.ParentPid) && byPid.TryGetValue(child.ParentPid, out var parent) && parent.Created <= child.Created;
        // Hijo de un objetivo ya cerrado en una pasada anterior, salvo que su PID padre lo tenga
        // ahora un proceso vivo creado antes que el hijo (reutilización del PID).
        bool ChildOfClosed(ProcessEntry child) => closed != null && closed.Any(dead => dead.Pid == child.ParentPid && dead.Created <= child.Created) &&
            !(byPid.TryGetValue(child.ParentPid, out var live) && live.Created <= child.Created && closed.All(dead => dead.Created != live.Created));

        // Pope: el host retenido y sus hijos del mismo ejecutable o de WebView2, en cadena.
        var pope = new HashSet<uint>(all.Where(e => popeRoots.Contains((e.Pid, e.Created))).Select(e => e.Pid));
        for (var changed = true; changed;)
        {
            changed = false;
            foreach (var entry in all)
                if (!pope.Contains(entry.Pid) && ChildOf(entry, pope) && entry.Image is { } image &&
                    (string.Equals(image, popeImage, StringComparison.OrdinalIgnoreCase) || string.Equals(Path.GetFileName(image), WebView, StringComparison.OrdinalIgnoreCase)))
                    changed = pope.Add(entry.Pid) | changed;
        }

        // Solo la sesión y el usuario del cliente; nunca críticos, servicios u otros usuarios.
        bool Candidate(ProcessEntry entry) => entry.Session == scope.Session && entry.Session != 0 && entry.Image != null &&
            string.Equals(entry.UserSid, scope.UserSid, StringComparison.Ordinal) && !entry.Critical && !pope.Contains(entry.Pid);

        // Creados durante la sesión, más sus descendientes posteriores al corte (relanzamientos).
        // Lo nacido tras el corte sin ese parentesco es del cliente siguiente.
        var targets = new HashSet<uint>(all.Where(e => Candidate(e) && e.Created >= scope.Start && e.Created <= cutoff).Select(e => e.Pid));
        for (var changed = true; changed;)
        {
            changed = false;
            foreach (var entry in all)
                if (!targets.Contains(entry.Pid) && Candidate(entry) && entry.Created > cutoff && (ChildOf(entry, targets) || ChildOfClosed(entry)))
                    changed = targets.Add(entry.Pid) | changed;
        }
        return all.Where(e => targets.Contains(e.Pid)).ToList();
    }
}
