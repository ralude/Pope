using System.Diagnostics;
using System.Text.Json;
using Pope.Agent;
using Pope.Bridge;
using Pope.ShellHost;

namespace Pope.DesktopProbe;

// T25 · CA-003-12 / ADR-0023: Alt+Tab entre un juego en pantalla completa y Pope, con la
// cadena real y clics reales de Windows. El juego usa la resolución actual para no cambiar
// el modo de pantalla del equipo de desarrollo. No sustituye los juegos/anticheat del local.
internal static class GameAccessProof
{
    internal static int Run(string directory, string gameDirectory)
    {
        HostBoundary.RequireInteractiveUser();
        if (Directory.Exists(directory)) return 1;
        Directory.CreateDirectory(directory);
        var report = new Dictionary<string, object?> { ["Utc"] = DateTime.UtcNow };
        var stage = "preparacion";
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(110));
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
        var name = PipeEndpoints.NewName();
        using var host = use.Start(Environment.ProcessPath!, "--pause-host", directory, name, Environment.ProcessId.ToString(), Path.Combine(directory, "PauseAudio.json"));
        var channelTask = channel.RunAsync(stop.Token);
        var pipeTask = agent.RunForHostAsync(host, name, stop.Token);
        var nodeTask = nodeDouble.RunAsync();
        Process? game = null;

        JsonElement? Locate(string target)
        {
            var result = Path.Combine(directory, target + ".json");
            var watch = Stopwatch.StartNew();
            while (watch.Elapsed < TimeSpan.FromSeconds(3))
            {
                File.Delete(result);
                File.WriteAllText(Path.Combine(directory, "locate.tmp"), "1");
                File.Move(Path.Combine(directory, "locate.tmp"), Path.Combine(directory, "locate-" + target));
                PauseProof.Until(() => File.Exists(result), stop.Token, host);
                var found = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(result));
                if (found.ValueKind == JsonValueKind.Object) return found;
                Thread.Sleep(100);
            }
            return null;
        }
        long Click(string target)
        {
            var found = Locate(target) ?? throw new InvalidOperationException("No se encontró " + target);
            var at = 0L;
            ProbeInput.On(use.DangerousGetHandle(), () => at = ProbeInput.ClickAt(found.GetProperty("x").GetDouble(), found.GetProperty("y").GetDouble()));
            return at;
        }
        void ToPope() => ProbeInput.On(use.DangerousGetHandle(), () =>
        {
            ProbeInput.AltTab(); ProbeRun.Require(ProbeInput.ForegroundPid() == host.Id, "Alt+Tab no llegó a Pope");
        });
        try
        {
            stage = "sin-sesion";
            PauseProof.Until(() => File.Exists(Path.Combine(directory, "parent-ready.json")) && File.Exists(Path.Combine(directory, "lock-profile", "ready.json")), stop.Token, host);
            var lockName = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(directory, "parent-ready.json"))).GetProperty("LockName").GetString()!;
            var lockInfo = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(directory, "lock-profile", "ready.json")));
            var lockWindow = (nint)lockInfo.GetProperty("Window").GetInt64();
            var lockPid = lockInfo.GetProperty("Pid").GetUInt32();
            PauseProof.Until(() => PauseProof.InputName() == lockName, stop.Token, host);
            using (var locked = PauseProof.Open(lockName)) ProbeInput.On(locked.DangerousGetHandle(), () =>
            {
                ProbeInput.Focus(lockWindow); ProbeInput.AltTab();
                ProbeRun.Require(ProbeInput.ForegroundPid() == lockPid, "Alt+Tab sin sesión escapó");
            });
            report["NoSessionAltTabInhibited"] = true;

            stage = "juego";
            nodeDouble.Command(PauseProof.Account(paused: false));
            PauseProof.Until(() => PauseProof.InputName() == use.Name, stop.Token, host);
            var resolution = DesktopNative.Resolution();
            var config = Path.Combine(directory, "doom.cfg");
            var extra = Path.Combine(directory, "chocolate.cfg");
            var demo = Path.Combine(directory, "input");
            // default.cfg conserva los scan codes DOS, no los valores ASCII de WASD.
            File.WriteAllText(config, "mouse_sensitivity 0\nuse_mouse 1\nkey_up 17\nkey_down 31\nkey_left 30\nkey_right 32\n");
            File.WriteAllText(extra, $"fullscreen 1\nfullscreen_width {resolution.Width}\nfullscreen_height {resolution.Height}\nforce_software_renderer 1\nstartup_delay 0\nshow_endoom 0\n");
            game = DesktopNative.StartExternal(use.Name, Path.Combine(gameDirectory, "chocolate", "chocolate-doom.exe"),
                "-iwad", Path.Combine(gameDirectory, "data", "freedoom-0.13.0", "freedoom1.wad"),
                "-config", config, "-extraconfig", extra, "-warp", "1", "1", "-nomonsters", "-nosound", "-nogui", "-record", demo);
            nint gameWindow = 0; var launched = Stopwatch.StartNew();
            ProbeInput.On(use.DangerousGetHandle(), () =>
            {
                while (gameWindow == 0 && launched.Elapsed < TimeSpan.FromSeconds(15))
                { ProbeRun.Require(!game.HasExited, "El juego terminó al arrancar"); game.Refresh(); gameWindow = game.MainWindowHandle; Thread.Sleep(200); }
            });
            ProbeRun.Require(gameWindow != 0, "El juego no creó ventana");
            Thread.Sleep(3000);
            void ToGame() => ProbeInput.On(use.DangerousGetHandle(), () =>
            {
                ProbeInput.Focus(gameWindow); ProbeRun.Require(ProbeInput.ForegroundPid() == game.Id, "No se volvió al juego");
            });
            ProbeInput.On(use.DangerousGetHandle(), () => { ProbeInput.Focus(gameWindow); ProbeInput.Hold(0x57, 500); });
            report["GameResolution"] = DesktopNative.Resolution(); report["ResolutionUnchanged"] = DesktopNative.Resolution() == resolution;

            stage = "ida-vuelta";
            var pauses = nodeDouble.Pauses;
            ToPope();
            ProbeInput.On(use.DangerousGetHandle(), () =>
            {
                ProbeInput.AltTab(); ProbeRun.Require(ProbeInput.ForegroundPid() == game.Id, "Alt+Tab no volvió al juego");
            });
            Thread.Sleep(500);
            ProbeRun.Require(nodeDouble.Pauses == pauses && PauseProof.InputName() == use.Name, "Cambiar de ventana pausó");
            report["AccountAltTabBothWaysWithoutPause"] = true;

            stage = "cancelar";
            ToPope(); Click("pause"); Click("cancel"); Thread.Sleep(700);
            ProbeRun.Require(nodeDouble.Pauses == pauses && PauseProof.InputName() == use.Name, "Cancelar pausó");
            ToGame(); report["CancelDoesNotPause"] = true;

            stage = "latencia";
            var samples = new List<double>();
            for (var cycle = 0; cycle < 8; cycle++)
            {
                ToPope(); Click("pause");
                var at = Click("confirm");
                var limit = Stopwatch.StartNew();
                while (PauseProof.InputName() != lockName) { ProbeRun.Require(limit.Elapsed < TimeSpan.FromSeconds(2), "La pausa no bloqueó la entrada"); Thread.Sleep(2); }
                samples.Add(Math.Round(Stopwatch.GetElapsedTime(at).TotalMilliseconds, 1));
                ProbeRun.Require(nodeDouble.Pauses == pauses + cycle + 1, "La pausa no pasó por el nodo");
                nodeDouble.Command(PauseProof.Account(paused: false));
                PauseProof.Until(() => PauseProof.InputName() == use.Name, stop.Token, host);
                ToGame();
            }
            var sorted = samples.Order().ToArray();
            report["PauseLatencyMs"] = samples; report["PauseLatencyP50Ms"] = sorted[sorted.Length / 2];
            report["PauseLatencyMaxMs"] = sorted[^1];
            ProbeRun.Require(sorted[^1] < 1000, "REQ-002-50: la pausa tardó 1 s o más");

            stage = "aislamiento-juego";
            ProbeInput.On(use.DangerousGetHandle(), () => { ProbeInput.Focus(gameWindow); ProbeInput.Hold(0x31, 200); }); // Marca 1 en la demo.
            ToPope(); Click("pause"); Click("confirm");
            PauseProof.Until(() => PauseProof.InputName() == lockName, stop.Token, host);
            var cpu = game.TotalProcessorTime;
            using (var locked = PauseProof.Open(lockName)) ProbeInput.On(locked.DangerousGetHandle(), () =>
            {
                ProbeInput.Focus(lockWindow); ProbeInput.Hold(0x41, 2000, click: true); ProbeInput.AltTab();
                ProbeRun.Require(ProbeInput.ForegroundPid() != game.Id, "Alt+Tab escapó al juego en pausa");
            });
            ProbeRun.Require(!game.HasExited && PauseProof.InputName() == lockName, "Pausa perdió el juego o el aislamiento");
            game.Refresh(); report["GameCpuDuringPauseMs"] = (game.TotalProcessorTime - cpu).TotalMilliseconds;
            nodeDouble.Command(PauseProof.Account(paused: false));
            PauseProof.Until(() => PauseProof.InputName() == use.Name, stop.Token, host);
            ProbeInput.On(use.DangerousGetHandle(), () =>
            {
                ProbeInput.Focus(gameWindow); ProbeInput.Hold(0x32, 200); ProbeInput.Hold(0x53, 500, click: true); // Marca 2 y controles positivos.
            });

            stage = "temporal";
            nodeDouble.Command(new
            {
                type = "state",
                status = "active",
                vesRate = (object?)null,
                session = new { kind = "temporary", sessionId = "01900000-0000-7000-8000-000000000125", startedAt = "2026-10-18T00:00:00Z", name = "Temporal", purchasedSeconds = 3600, remainingSeconds = 3600 }
            });
            Thread.Sleep(500);
            pauses = nodeDouble.Pauses;
            ToPope();
            ProbeRun.Require(Locate("pause") is null, "La sesión temporal ofrece Pausar");
            ToGame();
            ProbeRun.Require(nodeDouble.Pauses == pauses, "La temporal pausó");
            report["TemporaryAltTabBothWaysWithoutPauseButton"] = true;

            stage = "demo";
            ProbeInput.On(use.DangerousGetHandle(), () => { ProbeInput.Focus(gameWindow); ProbeInput.Hold(0x51, 200); }); // Q guarda la demo.
            ProbeRun.Require(game.WaitForExit(5000), "El juego no guardó la demo");
            GameProbe.VerifyDemo(demo + ".lmp", report);

            stage = "revocacion";
            nodeDouble.Command(new { type = "pcAuthenticationError", code = "pc_credential_revoked", message = "Credencial revocada" });
            PauseProof.Until(() => PauseProof.InputName() == lockName, stop.Token, host);
            using (var locked = PauseProof.Open(lockName)) ProbeInput.On(locked.DangerousGetHandle(), () =>
            {
                ProbeInput.Focus(lockWindow); ProbeInput.AltTab();
                ProbeRun.Require(ProbeInput.ForegroundPid() == lockPid, "Alt+Tab escapó de la revocación");
            });
            report["RevocationIsolated"] = true;
            report["NoExplorer"] = !DesktopNative.HasExplorer(use.DangerousGetHandle());
            report["Monitors"] = Screen.AllScreens.Length;
            report["Passed"] = true;
        }
        catch (Exception error)
        {
            report["Passed"] = false; report["Stage"] = stage; report["ErrorKind"] = error.GetType().Name;
            report["Error"] = error.Message; report["Inner"] = error.InnerException?.Message;
        }
        finally
        {
            report["Restored"] = PauseProof.Restore(original);
            stop.Cancel();
            foreach (var child in new[] { host, game }) { if (child is { HasExited: false }) child.Kill(true); child?.WaitForExit(); }
            foreach (var task in new[] { channelTask, pipeTask, nodeTask }) { try { task.Wait(5000); } catch (AggregateException) { } }
            game?.Dispose();
            File.WriteAllText(Path.Combine(directory, "stop"), "T25 terminada"); recovery.WaitForExit(5000);
            File.WriteAllText(Path.Combine(directory, "report.json"), JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
        }
        return report["Passed"] is true && report["Restored"] is true ? 0 : 1;
    }
}
