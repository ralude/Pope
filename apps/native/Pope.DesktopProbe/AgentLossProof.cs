using System.Diagnostics;
using System.Text.Json;
using Pope.Agent;
using Pope.Bridge;
using Pope.ShellHost;

namespace Pope.DesktopProbe;

// T27 · REQ-003-32 / REQ-002-30/31: el proceso del agente muere con la PC bloqueada, activa o
// pausada, y otro arranca sin nodo. El agente de ensayo es un proceso ordinario aparte (no el
// SCM de T15) que lanza el host como haría T22; su recuperación va a un archivo del ensayo.
internal static class AgentLossProof
{
    internal static int Agent(string directory, string hostDirectory, string useName, string configuration, string recovery)
    {
        HostBoundary.RequireInteractiveUser();
        using var config = AgentConfiguration.Parse(File.ReadAllBytes(configuration));
        var state = new AgentState(config.PcId);
        if (File.Exists(recovery))
        {
            try { state.Restore(File.ReadAllBytes(recovery)); }
            catch (InvalidDataException) { File.WriteAllText(Path.Combine(hostDirectory, "recovery-rejected"), "1"); }
        }
        state.RecoveryChanged += bytes => { File.WriteAllBytes(recovery + ".tmp", bytes); File.Move(recovery + ".tmp", recovery, overwrite: true); };
        var channel = new AgentChannel(config, new AgentLog(hostDirectory)) { Hello = state.Hello, Heartbeat = state.Heartbeat };
        channel.Message += state.Apply;
        using var bridge = new AgentHostBridge(channel, state, config.PcName); bridge.Subscribe();
        using var use = NativeDesktop.Create(useName);
        var pipe = PipeEndpoints.NewName();
        using var host = use.Start(Environment.ProcessPath!, "--pause-host", hostDirectory, pipe, Environment.ProcessId.ToString(), Path.Combine(directory, "PauseAudio.json"));
        File.WriteAllText(Path.Combine(hostDirectory, "host.json"), JsonSerializer.Serialize(new { host.Id }));
        using var stop = new CancellationTokenSource();
        var running = Task.WhenAll(channel.RunAsync(stop.Token), bridge.RunForHostAsync(host, pipe, stop.Token));
        while (!File.Exists(Path.Combine(directory, "stop")) && !host.HasExited)
        {
            // Estado observable por el ensayo: nada de tiempo local antes de oír al nodo.
            var report = JsonSerializer.Serialize(new { state.Known, state.Blocked, state.RemainingSeconds, Hello = JsonSerializer.SerializeToElement(state.Hello()).GetProperty("localRemainingSeconds").ToString() });
            File.WriteAllText(Path.Combine(hostDirectory, "agent.tmp"), report);
            File.Move(Path.Combine(hostDirectory, "agent.tmp"), Path.Combine(hostDirectory, "agent.json"), overwrite: true);
            Thread.Sleep(250);
        }
        stop.Cancel();
        try { running.Wait(5000); } catch (AggregateException) { }
        return 0;
    }

    internal static int Run(string directory)
    {
        HostBoundary.RequireInteractiveUser();
        if (Directory.Exists(directory)) return 1;
        Directory.CreateDirectory(directory);
        var report = new Dictionary<string, object?> { ["Utc"] = DateTime.UtcNow };
        var stage = "preparacion";
        var endpoints = new CoreAudioEndpoints();
        var originals = endpoints.Active().ToDictionary(d => d.Id, d => d.Muted);
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(110));
        using var original = NativeDesktop.Current();
        using var use = NativeDesktop.Create("PopeLockUse" + Guid.NewGuid().ToString("N"));
        using var watchdog = DesktopNative.Start(original.Name, "--restore", original.Name, directory);
        using var node = new ProofNode();
        var configuration = Path.Combine(directory, "agent-config.json");
        File.WriteAllBytes(configuration, node.ConfigurationJson());
        var recovery = Path.Combine(directory, "recovery.json");
        var nodeDouble = new PauseProof.NodeDouble(node, stop.Token);
        var nodeTask = nodeDouble.RunAsync();
        using var app = use.Start(Environment.ProcessPath!, "--window", "app", directory);
        var agents = new List<Process>(); var hosts = new List<Process>();
        var journal = Path.Combine(directory, "PauseAudio.json");

        (Process Agent, Process Host, string LockName, nint LockWindow, uint LockPid, string Directory) Start(string name)
        {
            var hostDirectory = Path.Combine(directory, name); Directory.CreateDirectory(hostDirectory);
            var agent = Process.Start(new ProcessStartInfo(Environment.ProcessPath!)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                ArgumentList = { "--proof-agent", directory, hostDirectory, use.Name, configuration, recovery }
            })!;
            agents.Add(agent);
            PauseProof.Until(() => File.Exists(Path.Combine(hostDirectory, "host.json")), stop.Token, agent);
            var host = Process.GetProcessById(JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(hostDirectory, "host.json"))).GetProperty("Id").GetInt32());
            hosts.Add(host);
            PauseProof.Until(() => File.Exists(Path.Combine(hostDirectory, "parent-ready.json")) && File.Exists(Path.Combine(hostDirectory, "lock-profile", "ready.json")), stop.Token, host);
            var lockInfo = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(hostDirectory, "lock-profile", "ready.json")));
            var lockName = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(hostDirectory, "parent-ready.json"))).GetProperty("LockName").GetString()!;
            return (agent, host, lockName, (nint)lockInfo.GetProperty("Window").GetInt64(), lockInfo.GetProperty("Pid").GetUInt32(), hostDirectory);
        }
        // Matar solo el proceso del agente: el host (su hijo) debe seguir vivo y bloqueado.
        double Kill(Process agent, string lockName)
        {
            var watch = Stopwatch.StartNew();
            agent.Kill(entireProcessTree: false); agent.WaitForExit();
            while (PauseProof.InputName() != lockName) { ProbeRun.Require(watch.Elapsed < TimeSpan.FromSeconds(3), "Sin agente no se bloqueó"); Thread.Sleep(5); }
            return Math.Round(watch.Elapsed.TotalMilliseconds, 1);
        }
        void Retire(Process host) { if (!host.HasExited) host.Kill(true); host.WaitForExit(); use.Activate(); Thread.Sleep(300); }
        void Isolated(string lockName, nint lockWindow, uint lockPid)
        {
            var before = ProbeRun.Read(directory, "app");
            using (var locked = PauseProof.Open(lockName)) ProbeInput.On(locked.DangerousGetHandle(), () =>
            {
                ProbeInput.Focus(lockWindow); ProbeInput.Tap(0x41); ProbeInput.ClickAt(0.03, 0.03); ProbeInput.AltTab();
                ProbeRun.Require(ProbeInput.ForegroundPid() == lockPid, "Alt+Tab escapó sin agente");
            });
            Thread.Sleep(400);
            var after = ProbeRun.Read(directory, "app");
            ProbeRun.Require(before.GetProperty("Keys").GetInt32() == after.GetProperty("Keys").GetInt32() &&
                before.GetProperty("Clicks").GetInt32() == after.GetProperty("Clicks").GetInt32() && !app.HasExited, "Entrada escapó o la app terminó");
        }
        bool Muted() => endpoints.Active().All(d => d.Muted);
        bool Restored() => endpoints.Active().All(d => originals.TryGetValue(d.Id, out var muted) && muted == d.Muted);
        void UntilConnected(int count) => PauseProof.Until(() => nodeDouble.Connections >= count, stop.Token, null);
        try
        {
            stage = "bloqueada";
            var a = Start("a"); UntilConnected(1);
            PauseProof.Until(() => PauseProof.InputName() == a.LockName, stop.Token, a.Host);
            a.Agent.Kill(entireProcessTree: false); a.Agent.WaitForExit(); Thread.Sleep(1000);
            ProbeRun.Require(PauseProof.InputName() == a.LockName && !a.Host.HasExited, "Sin agente se abrió el uso");
            Isolated(a.LockName, a.LockWindow, a.LockPid); report["LockedStaysLocked"] = true;
            Retire(a.Host);

            stage = "activa";
            var b = Start("b"); UntilConnected(2);
            nodeDouble.Command(PauseProof.Account(paused: false));
            PauseProof.Until(() => PauseProof.InputName() == use.Name, stop.Token, b.Host);
            report["ActiveLockMs"] = Kill(b.Agent, b.LockName);
            Thread.Sleep(500);
            Isolated(b.LockName, b.LockWindow, b.LockPid);
            using (var shot = PauseProof.Open(b.LockName)) ProbeRun.Capture(shot.DangerousGetHandle(), directory, "agent-lost");
            report["ActiveLocksWithoutSession"] = true;
            Retire(b.Host);

            stage = "pausada";
            var c = Start("c"); UntilConnected(3);
            nodeDouble.Command(PauseProof.Account(paused: false));
            PauseProof.Until(() => PauseProof.InputName() == use.Name, stop.Token, c.Host);
            nodeDouble.Command(PauseProof.Account(paused: true));
            PauseProof.Until(() => PauseProof.InputName() == c.LockName && Muted(), stop.Token, c.Host);
            var captured = File.ReadAllText(journal);
            c.Agent.Kill(entireProcessTree: false); c.Agent.WaitForExit(); Thread.Sleep(1500);
            ProbeRun.Require(PauseProof.InputName() == c.LockName && Muted() && File.ReadAllText(journal) == captured, "Sin agente se perdió la pausa o el silencio");
            Isolated(c.LockName, c.LockWindow, c.LockPid); report["PausedStaysLockedAndMuted"] = true;
            Retire(c.Host);

            stage = "reinicio-sin-nodo";
            nodeDouble.Drop(TimeSpan.FromSeconds(4));
            var d = Start("d");
            Thread.Sleep(2500);
            var agentState = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(d.Directory, "agent.json")));
            ProbeRun.Require(!agentState.GetProperty("Known").GetBoolean() && agentState.GetProperty("Blocked").GetBoolean() &&
                agentState.GetProperty("RemainingSeconds").ValueKind == JsonValueKind.Null, "El agente reiniciado concedió algo sin nodo");
            ProbeRun.Require(PauseProof.InputName() == d.LockName && Muted() && File.ReadAllText(journal) == captured, "El reinicio sin nodo abrió uso o devolvió el sonido");
            report["RestartWithoutNodeStaysLocked"] = true; report["RecoveryRejected"] = File.Exists(Path.Combine(d.Directory, "recovery-rejected"));
            UntilConnected(4); Thread.Sleep(1500);
            report["RestartHello"] = nodeDouble.LastHello; report["RestartHelloLocalRemaining"] = nodeDouble.LastHelloRemaining;
            report["RefusedWhileNodeDown"] = nodeDouble.Refused;
            ProbeRun.Require(PauseProof.InputName() == d.LockName && Muted() && File.ReadAllText(journal) == captured, "La pausa recuperada perdió el bloqueo o recapturó el audio");
            nodeDouble.Command(PauseProof.Account(paused: false));
            PauseProof.Until(() => PauseProof.InputName() == use.Name && Restored() && !File.Exists(journal), stop.Token, d.Host);
            report["ResumeAfterRestartRestoresAudio"] = true;
            report["Passed"] = true;
        }
        catch (Exception error)
        {
            report["Passed"] = false; report["Stage"] = stage; report["ErrorKind"] = error.GetType().Name;
            report["Error"] = error.Message; report["Inner"] = error.InnerException?.Message;
        }
        finally
        {
            foreach (var device in originals) { try { endpoints.SetMute(device.Key, device.Value); } catch (System.Runtime.InteropServices.COMException) { } }
            report["AudioRestored"] = Restored();
            report["Restored"] = PauseProof.Restore(original);
            stop.Cancel();
            File.WriteAllText(Path.Combine(directory, "stop"), "T27 terminada");
            foreach (var process in agents.Concat(hosts).Append(app)) { if (!process.HasExited) process.Kill(true); process.WaitForExit(); }
            try { nodeTask.Wait(5000); } catch (AggregateException) { }
            watchdog.WaitForExit(5000);
            File.Delete(configuration);
            File.WriteAllText(Path.Combine(directory, "report.json"), JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
        }
        return report["Passed"] is true && report["Restored"] is true && report["AudioRestored"] is true ? 0 : 1;
    }
}
