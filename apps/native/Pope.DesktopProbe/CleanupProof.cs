using System.Diagnostics;
using System.Text.Json;
using Pope.Agent;
using Pope.Bridge;
using Pope.ShellHost;

namespace Pope.DesktopProbe;

// T26 · REQ-003-34 / CA-003-08: cierre real de procesos del cliente con la política de producto.
// El ensayo corre con el usuario de desarrollo: solo termina descendientes de este proceso y
// anota, sin tocarlos, los demás que la política habría elegido (procesos propios del usuario).
internal static class CleanupProof
{
    internal static int Idle(string directory)
    {
        var watch = Stopwatch.StartNew();
        while (watch.Elapsed < TimeSpan.FromSeconds(120) && !File.Exists(Path.Combine(directory, "stop"))) Thread.Sleep(200);
        return 0;
    }

    // Lanzador de prueba: dos auxiliares que siguen vivos aunque él no haga nada más.
    internal static int Launcher(string directory)
    {
        for (var index = 0; index < 2; index++)
            Process.Start(new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false, CreateNoWindow = true, ArgumentList = { "--idle", directory } })!.Dispose();
        return Idle(directory);
    }

    internal static int Run(string directory)
    {
        HostBoundary.RequireInteractiveUser();
        if (Directory.Exists(directory)) return 1;
        Directory.CreateDirectory(directory);
        var report = new Dictionary<string, object?> { ["Utc"] = DateTime.UtcNow };
        var stage = "preparacion";
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(100));
        using var original = NativeDesktop.Current();
        using var use = NativeDesktop.Create("PopeLockUse" + Guid.NewGuid().ToString("N"));
        using var recovery = DesktopNative.Start(original.Name, "--restore", original.Name, directory);
        using var node = new ProofNode();
        using var configuration = node.Configuration();
        var state = new AgentState(configuration.PcId);
        var channel = new AgentChannel(configuration, new AgentLog(directory)) { Hello = state.Hello, Heartbeat = state.Heartbeat };
        channel.Message += state.Apply;
        using var agent = new AgentHostBridge(channel, state, configuration.PcName); agent.Subscribe();
        var self = ClientProcesses.Describe((uint)Environment.ProcessId)!.Value;
        var outside = new List<string>(); var closedPids = new List<uint>(); var closeLog = new List<string>();
        // Guardia del ensayo: solo descendientes de este proceso (recordados aunque su padre ya
        // esté cerrado); cualquier otro se anota por nombre de ejecutable sin tocarlo.
        var ours = new HashSet<(uint, long)> { (self.Pid, self.Created) };
        bool Ours(ProcessEntry entry, IReadOnlyList<ProcessEntry> all)
        {
            lock (ours)
            {
                if (ours.Contains((entry.Pid, entry.Created))) return true;
                var parent = all.FirstOrDefault(p => p.Pid == entry.ParentPid && p.Created <= entry.Created);
                var mine = parent.Pid != 0 ? Ours(parent, all) : ours.Any(o => o.Item1 == entry.ParentPid && o.Item2 <= entry.Created);
                if (mine) ours.Add((entry.Pid, entry.Created));
                return mine;
            }
        }
        void Remember() { var all = ClientProcesses.Snapshot(); foreach (var entry in all) Ours(entry, all); }
        bool Close(ProcessEntry target)
        {
            if (!Ours(target, ClientProcesses.Snapshot())) { lock (outside) outside.Add(Path.GetFileName(target.Image ?? "?")); return false; }
            var result = ClientProcesses.Close(target);
            lock (closedPids) { closedPids.Add(target.Pid); closeLog.Add($"{Path.GetFileName(target.Image)}:{target.Pid}:{result}"); }
            return result;
        }
        var cleanup = new ClientSessionCleanup(() => agent.Host, ClientProcesses.Snapshot, Close, _ => { });
        state.SessionStarted += cleanup.Started;
        var finishing = new List<Task>();
        state.SessionFinished += id => { lock (finishing) finishing.Add(cleanup.Finished(id)); };
        // T29: el bloqueo que el nodo pide tras cada cierre, con los acuses reales del agente.
        var commands = new AgentCommands(state, cleanup, channel.SendMessageAsync, new AgentLog(directory));
        channel.Message += commands.OnMessage;
        var nodeDouble = new PauseProof.NodeDouble(node, stop.Token);
        var name = PipeEndpoints.NewName();
        using var pre = use.Start(Environment.ProcessPath!, "--idle", directory);
        using var host = use.Start(Environment.ProcessPath!, "--pause-host", directory, name, Environment.ProcessId.ToString(), Path.Combine(directory, "PauseAudio.json"));
        var channelTask = channel.RunAsync(stop.Token);
        var pipeTask = agent.RunForHostAsync(host, name, stop.Token);
        var nodeTask = nodeDouble.RunAsync();
        // Pide el bloqueo como el nodo tras un cierre y espera su resultado; devuelve los ms hasta él.
        long Lock(string id, IReadOnlyList<ProcessEntry> tree)
        {
            var revision = Guid.CreateVersion7().ToString();
            // Hora del nodo = emisión; vence a los 30 s exactos, como en el contrato.
            var now = DateTime.UtcNow;
            static string Utc(DateTime value) => value.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", System.Globalization.CultureInfo.InvariantCulture);
            var issued = Utc(now); var expires = Utc(now.AddSeconds(30));
            var watch = Stopwatch.StartNew();
            nodeDouble.Command(new { type = "controlState", serverTime = issued, context = new { kind = "free", revision } });
            nodeDouble.Command(new
            {
                type = "command",
                command = new
                {
                    id,
                    pcId = configuration.PcId,
                    actor = new { kind = "system" },
                    expected = new { kind = "free", revision },
                    issuedAt = issued,
                    expiresAt = expires,
                    action = new { kind = "lock" }
                }
            });
            string[] Results() { lock (nodeDouble.Acks) return nodeDouble.Acks.Where(a => a.GetProperty("commandId").GetString() == id).Select(a => a.GetProperty("result").GetProperty("status").GetString()!).ToArray(); }
            PauseProof.Until(() => Results().Length == 2, stop.Token, host);
            var elapsed = watch.ElapsedMilliseconds;
            ProbeRun.Require(Results().SequenceEqual(["accepted", "applied"]), $"Bloqueo sin aplicar: {string.Join(",", Results())}");
            // El agente solo confirma cuando ya no queda ningún proceso de la sesión cerrada.
            ProbeRun.Require(!tree.Any(p => ClientProcesses.Describe(p.Pid) is { } live && live.Created == p.Created), "Bloqueo aplicado con procesos del cliente vivos");
            return elapsed;
        }
        var started = new List<Process>(); ClientScope? firstScope = null;
        Process Launch(params string[] arguments) { var process = use.Start(Environment.ProcessPath!, arguments); started.Add(process); return process; }
        IReadOnlyList<ProcessEntry> Tree(Process root)
        {
            var all = ClientProcesses.Snapshot(); var rootEntry = all.FirstOrDefault(p => p.Pid == root.Id);
            return all.Where(p => p.Pid == root.Id || Descends(p, rootEntry, all)).ToList();
        }
        void UntilGone(Process root, IReadOnlyList<ProcessEntry> tree, string error)
        {
            var watch = Stopwatch.StartNew();
            while (!root.HasExited || tree.Any(p => ClientProcesses.Describe(p.Pid) is { } live && live.Created == p.Created))
            {
                var alive = tree.Where(p => ClientProcesses.Describe(p.Pid) is { } live && live.Created == p.Created).Select(p => $"{Path.GetFileName(p.Image)}:{p.Pid}");
                ProbeRun.Require(watch.Elapsed < TimeSpan.FromSeconds(5), $"{error} (raíz viva: {!root.HasExited}; vivos: {string.Join(",", alive)})");
                Thread.Sleep(100);
            }
            report[stage + "ClosedMs"] = watch.ElapsedMilliseconds;
        }
        // El ejecutable del ensayo es de consola: cada proceso lleva además su conhost.exe.
        static int Probes(IReadOnlyList<ProcessEntry> tree) => tree.Count(p => string.Equals(p.Image, Environment.ProcessPath, StringComparison.OrdinalIgnoreCase));
        void Alive(string error, params Process[] processes) => ProbeRun.Require(processes.All(p => !p.HasExited), error);
        try
        {
            stage = "bloqueo";
            PauseProof.Until(() => File.Exists(Path.Combine(directory, "parent-ready.json")) && File.Exists(Path.Combine(directory, "lock-profile", "ready.json")), stop.Token, host);
            var lockName = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(directory, "parent-ready.json"))).GetProperty("LockName").GetString()!;
            var lockPid = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(directory, "lock-profile", "ready.json"))).GetProperty("Pid").GetInt32();
            using var lockChild = Process.GetProcessById(lockPid);
            PauseProof.Until(() => PauseProof.InputName() == lockName, stop.Token, host);
            ProbeRun.Require(agent.Host is { } client && client.Pid == host.Id, "Host sin asociar al agente");

            stage = "sesion";
            nodeDouble.Command(PauseProof.Account(paused: false));
            PauseProof.Until(() => PauseProof.InputName() == use.Name && cleanup.Scope != null, stop.Token, host);
            firstScope = cleanup.Scope;
            Thread.Sleep(200);
            var launcher = Launch("--launcher", directory);
            var window = Launch("--window", "app", directory);
            PauseProof.Until(() => Probes(Tree(launcher)) == 3 && File.Exists(Path.Combine(directory, "app.jsonl")), stop.Token, host);
            var launched = Tree(launcher); Remember();

            stage = "pausa";
            nodeDouble.Command(PauseProof.Account(paused: true));
            PauseProof.Until(() => PauseProof.InputName() == lockName, stop.Token, host); Thread.Sleep(1500);
            Alive("La pausa cerró procesos del cliente", launcher, window);
            ProbeRun.Require(Probes(Tree(launcher)) == 3 && closedPids.Count == 0, "La pausa cerró auxiliares");
            report["PauseKeepsProcesses"] = true;

            stage = "cierre";
            nodeDouble.Command(new { type = "sessionEnded", sessionId = "01900000-0000-7000-8000-000000000124", reason = "staff" });
            nodeDouble.Command(new { type = "state", status = "locked" });
            // T29: el nodo no admite al cliente siguiente hasta que el agente aplica el bloqueo.
            var closedTree = launched.Concat(Tree(window)).ToList();
            report["LockAppliedMs"] = Lock("01900000-0000-7000-8000-000000000140", launched);
            ProbeRun.Require(window.HasExited, "Bloqueo aplicado con la app del cliente abierta");
            report["LockAfterCleanup"] = closedTree.Count;
            // Cliente siguiente: sesión temporal abierta tras el bloqueo, su proceso nace después.
            nodeDouble.Command(new
            {
                type = "state",
                status = "active",
                vesRate = (object?)null,
                session = new { kind = "temporary", sessionId = "01900000-0000-7000-8000-000000000125", startedAt = "2026-10-19T00:00:00Z", name = "Temporal", purchasedSeconds = 600, remainingSeconds = 600 }
            });
            PauseProof.Until(() => cleanup.Scope?.SessionId == "01900000-0000-7000-8000-000000000125", stop.Token, host);
            var next = Launch("--idle", directory); Remember();
            UntilGone(launcher, launched, "No se cerraron el lanzador y sus auxiliares");
            PauseProof.Until(() => window.HasExited, stop.Token, host);
            lock (finishing) Task.WaitAll(finishing.ToArray(), stop.Token);
            Alive("Se cerró algo que no era del cliente", pre, host, lockChild, next);
            report["ClosedSessionProcesses"] = true; report["NextClientKept"] = true; report["PopeAndPreviousKept"] = true;

            stage = "agotamiento-temporal";
            var nextTree = Tree(next);
            nodeDouble.Command(new { type = "sessionEnded", sessionId = "01900000-0000-7000-8000-000000000125", reason = "exhausted" });
            nodeDouble.Command(new { type = "state", status = "locked" });
            report["ExhaustedLockAppliedMs"] = Lock("01900000-0000-7000-8000-000000000141", nextTree);
            UntilGone(next, nextTree, "No se cerró el proceso de la temporal agotada");
            lock (finishing) Task.WaitAll(finishing.ToArray(), stop.Token);
            Alive("El agotamiento cerró Pope o procesos previos", pre, host, lockChild);
            ProbeRun.Require(PauseProof.InputName() == lockName, "Cierre sin bloqueo");
            report["TemporaryExhaustedClosed"] = true;
            report["ClosedByProof"] = closedPids.Count;
            lock (outside) report["OutsideProofWouldClose"] = outside.Distinct().ToArray();
            report["Passed"] = true;
        }
        catch (Exception error)
        {
            report["Passed"] = false; report["Stage"] = stage; report["ErrorKind"] = error.GetType().Name;
            report["DiagClosed"] = closeLog.ToArray(); lock (outside) report["DiagOutside"] = outside.ToArray();
            if (firstScope != null) report["DiagTargets"] = ClientProcessPolicy.Targets(ClientProcesses.Snapshot(), firstScope, DateTime.UtcNow.ToFileTimeUtc(), [], null).Select(t => Path.GetFileName(t.Image)).ToArray();
            report["DiagScope"] = firstScope?.ToString(); report["DiagHost"] = agent.Host?.ToString();
            report["Error"] = error.Message; report["Inner"] = error.InnerException?.Message;
        }
        finally
        {
            report["Restored"] = PauseProof.Restore(original);
            stop.Cancel();
            File.WriteAllText(Path.Combine(directory, "stop"), "T26 terminada");
            foreach (var child in started.Append(host).Append(pre)) { if (!child.HasExited) child.Kill(true); child.WaitForExit(); }
            foreach (var task in new[] { channelTask, pipeTask, nodeTask }) { try { task.Wait(5000); } catch (AggregateException) { } }
            recovery.WaitForExit(5000);
            File.WriteAllText(Path.Combine(directory, "report.json"), JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
        }
        return report["Passed"] is true && report["Restored"] is true ? 0 : 1;
    }

    private static bool Descends(ProcessEntry entry, ProcessEntry? root, IReadOnlyList<ProcessEntry> all)
    {
        if (root is not { } ancestor) return false;
        var byPid = all.GroupBy(p => p.Pid).ToDictionary(g => g.Key, g => g.First());
        for (var current = entry; byPid.TryGetValue(current.ParentPid, out var parent) && parent.Created <= current.Created; current = parent)
            if (parent.Pid == ancestor.Pid && parent.Created == ancestor.Created) return true;
        return false;
    }
}
