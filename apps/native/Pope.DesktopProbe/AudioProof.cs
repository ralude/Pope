using System.Diagnostics;
using System.Text.Json;
using Pope.Agent;
using Pope.Bridge;
using Pope.ShellHost;

namespace Pope.DesktopProbe;

// T24: silencio real de las salidas de este Windows durante la pausa y vuelta exacta al mute
// previo. Reversible: el finally devuelve cada salida a su mute original. No toca el volumen.
internal static class AudioProof
{
    internal static int Run(string directory)
    {
        HostBoundary.RequireInteractiveUser();
        if (Directory.Exists(directory)) return 1;
        Directory.CreateDirectory(directory);
        var report = new Dictionary<string, object?> { ["Utc"] = DateTime.UtcNow };
        var stage = "preparacion";
        var endpoints = new CoreAudioEndpoints();
        var originals = endpoints.Active().ToDictionary(d => d.Id, d => d.Muted);
        var volumes = originals.Keys.ToDictionary(id => id, endpoints.Volume);
        report["Devices"] = originals.Count; report["OriginallyMuted"] = originals.Count(p => p.Value);
        var journal = Path.Combine(directory, "PauseAudio.json");
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
        var nodeDouble = new PauseProof.NodeDouble(node, stop.Token);
        var channelTask = channel.RunAsync(stop.Token);
        var nodeTask = nodeDouble.RunAsync();
        Process? host = null; Task? pipeTask = null;

        (Process Host, Task Pipe, string LockName, string Directory) Start(string name)
        {
            var hostDirectory = Path.Combine(directory, name); Directory.CreateDirectory(hostDirectory);
            var pipe = PipeEndpoints.NewName();
            var started = use.Start(Environment.ProcessPath!, "--pause-host", hostDirectory, pipe, Environment.ProcessId.ToString(), journal);
            var task = agent.RunForHostAsync(started, pipe, stop.Token);
            PauseProof.Until(() => File.Exists(Path.Combine(hostDirectory, "parent-ready.json")) && File.Exists(Path.Combine(hostDirectory, "lock-profile", "ready.json")), stop.Token, started);
            var lockName = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(hostDirectory, "parent-ready.json"))).GetProperty("LockName").GetString()!;
            return (started, task, lockName, hostDirectory);
        }
        bool Matches(IReadOnlyDictionary<string, bool> expected) => endpoints.Active().All(d => expected.TryGetValue(d.Id, out var muted) && muted == d.Muted);
        bool AllMuted() => endpoints.Active().All(d => d.Muted);
        void UntilAudio(Func<bool> condition, string error)
        {
            var time = Stopwatch.StartNew();
            while (!condition()) { ProbeRun.Require(time.Elapsed < TimeSpan.FromSeconds(3), error); Thread.Sleep(50); }
            report[stage + "AudioMs"] = time.ElapsedMilliseconds;
        }
        Dictionary<string, bool> Journal() => JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(journal)).GetProperty("devices")
            .EnumerateArray().ToDictionary(d => d.GetProperty("id").GetString()!, d => d.GetProperty("muted").GetBoolean());
        void VolumesKept() => ProbeRun.Require(volumes.All(v => Math.Abs(endpoints.Volume(v.Key) - v.Value) < 0.0001f), "El volumen cambió");
        try
        {
            ProbeRun.Require(originals.Count > 0, "Sin salidas de audio activas");
            stage = "sesion";
            var first = Start("host1"); host = first.Host; pipeTask = first.Pipe;
            PauseProof.Until(() => PauseProof.InputName() == first.LockName, stop.Token, host);
            nodeDouble.Command(PauseProof.Account(paused: false));
            PauseProof.Until(() => PauseProof.InputName() == use.Name, stop.Token, host);
            ProbeRun.Require(Matches(originals) && !File.Exists(journal), "Audio alterado sin pausa");

            stage = "pausa";
            PauseProof.PauseByClient(first.Directory, first.LockName, nodeDouble, stop.Token, host);
            UntilAudio(AllMuted, "La pausa no silenció todas las salidas");
            ProbeRun.Require(Journal().Count == originals.Count && Journal().All(p => originals[p.Key] == p.Value), "Diario distinto de los originales");
            VolumesKept(); var captured = File.ReadAllText(journal);
            report["PauseMutedAll"] = true;

            stage = "reconexion";
            nodeDouble.Drop(TimeSpan.FromSeconds(3));
            PauseProof.Until(() => nodeDouble.Connections >= 2, stop.Token, host); Thread.Sleep(1500);
            ProbeRun.Require(AllMuted() && File.ReadAllText(journal) == captured, "La reconexión recapturó el audio");
            report["ReconnectKeptCapture"] = true;

            stage = "host-reiniciado";
            host.Kill(true); host.WaitForExit(); pipeTask.Wait(5000); use.Activate();
            ProbeRun.Require(AllMuted(), "El silencio dependía del host vivo");
            var second = Start("host2"); host = second.Host; pipeTask = second.Pipe;
            PauseProof.Until(() => PauseProof.InputName() == second.LockName, stop.Token, host); Thread.Sleep(1500);
            ProbeRun.Require(AllMuted() && File.ReadAllText(journal) == captured, "El host nuevo recapturó el audio");
            report["RestartedHostKeptCapture"] = true;

            stage = "reanudar";
            nodeDouble.Command(PauseProof.Account(paused: false));
            PauseProof.Until(() => PauseProof.InputName() == use.Name, stop.Token, host);
            UntilAudio(() => Matches(originals), "Reanudar no restauró el mute original");
            ProbeRun.Require(!File.Exists(journal), "Diario sin retirar"); VolumesKept();
            report["ResumeRestoredOriginals"] = true;

            stage = "mute-previo";
            var premuted = originals.Keys.First(); endpoints.SetMute(premuted, true);
            var expected = new Dictionary<string, bool>(originals) { [premuted] = true };
            PauseProof.PauseByClient(second.Directory, second.LockName, nodeDouble, stop.Token, host);
            UntilAudio(AllMuted, "La segunda pausa no silenció");
            ProbeRun.Require(Journal()[premuted], "El diario perdió el mute previo");
            nodeDouble.Command(PauseProof.Account(paused: false));
            UntilAudio(() => Matches(expected), "Reanudar quitó un mute previo");
            VolumesKept(); report["PremutedStaysMuted"] = true;
            report["Passed"] = true;
        }
        catch (Exception error)
        {
            report["Passed"] = false; report["Stage"] = stage; report["ErrorKind"] = error.GetType().Name;
            report["Error"] = error.Message; report["Inner"] = error.InnerException?.Message;
        }
        finally
        {
            // Primero el audio: devolver cada salida a su mute original, pase lo que pase.
            foreach (var device in originals) { try { endpoints.SetMute(device.Key, device.Value); } catch (System.Runtime.InteropServices.COMException) { } }
            report["AudioRestored"] = Matches(originals);
            report["Restored"] = PauseProof.Restore(original);
            stop.Cancel();
            if (host != null) { if (!host.HasExited) host.Kill(true); host.WaitForExit(); host.Dispose(); }
            foreach (var task in new[] { channelTask, pipeTask, nodeTask }) { try { task?.Wait(5000); } catch (AggregateException) { } }
            File.WriteAllText(Path.Combine(directory, "stop"), "T24 terminada"); recovery.WaitForExit(5000);
            File.WriteAllText(Path.Combine(directory, "report.json"), JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
        }
        return report["Passed"] is true && report["Restored"] is true && report["AudioRestored"] is true ? 0 : 1;
    }
}
