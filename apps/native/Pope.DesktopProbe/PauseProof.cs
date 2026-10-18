using System.Diagnostics;
using System.Net.WebSockets;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Pope.Agent;
using Pope.Bridge;
using Pope.ShellHost;

namespace Pope.DesktopProbe;

// T23: pausa del nodo en escritorios reales. El ensayo es el broker ordinario (agente + doble
// del nodo); el EXE de producto sigue exigiendo SYSTEM/sesión 0. No altera el shell de Windows.
internal static class PauseProof
{
    private const string SessionId = "01900000-0000-7000-8000-000000000124";

    // Host de uso del ensayo: igual que el de producto, más un disparador para pulsar «Pausar».
    internal static int Host(string directory, string pipe, int parentId)
    {
        HostBoundary.RequireInteractiveUser();
        using var parent = Process.GetProcessById(parentId);
        using var retained = new RetainedProcess(parent);
        using var bridge = new HostBridge(pipe, retained);
        ApplicationConfiguration.Initialize();
        using var window = new ShellWindow(Path.Combine(AppContext.BaseDirectory, "shell"), Path.Combine(directory, "use-profile"), bridge);
        using var desktops = new DesktopCoordinator(bridge, Path.Combine(directory, "lock-profile"));
        window.NativeDelivery = desktops.Apply;
        window.ReadyReceived = () => File.WriteAllText(Path.Combine(directory, "parent-ready.json"), JsonSerializer.Serialize(new { LockName = desktops.LockName }));
        using var trigger = new System.Windows.Forms.Timer { Interval = 50 };
        var busy = false;
        trigger.Tick += async (_, _) =>
        {
            var request = Path.Combine(directory, "click-pause");
            if (busy || !File.Exists(request)) return;
            busy = true; File.Delete(request);
            try
            {
                var core = await window.Initialized.Task;
                await core.ExecuteScriptAsync("document.querySelector('.pause-btn').click()");
                await Until(core, "document.querySelector('.dialog.pausing .btn-primary')");
                var clicked = Stopwatch.GetTimestamp();
                await core.ExecuteScriptAsync("document.querySelector('.dialog.pausing .btn-primary').click()");
                File.WriteAllText(Path.Combine(directory, "pause-clicked.json"), JsonSerializer.Serialize(new { Timestamp = clicked }));
            }
            catch (Exception error) { File.WriteAllText(Path.Combine(directory, "pause-clicked.json"), JsonSerializer.Serialize(new { Error = error.GetType().Name })); }
            finally { busy = false; }
        };
        trigger.Start();
        Application.Run(window); window.WaitForBridge(); return window.Failed ? 1 : 0;
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
        var nodeDouble = new NodeDouble(node, stop.Token);
        var name = PipeEndpoints.NewName();
        using var app = use.Start(Environment.ProcessPath!, "--window", "app", directory);
        using var host = use.Start(Environment.ProcessPath!, "--pause-host", directory, name, Environment.ProcessId.ToString());
        var channelTask = channel.RunAsync(stop.Token);
        var pipeTask = agent.RunForHostAsync(host, name, stop.Token);
        var nodeTask = nodeDouble.RunAsync();
        try
        {
            stage = "bloqueo";
            Until(() => File.Exists(Path.Combine(directory, "parent-ready.json")) && File.Exists(Path.Combine(directory, "lock-profile", "ready.json")), stop.Token, host);
            var lockName = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(directory, "parent-ready.json"))).GetProperty("LockName").GetString()!;
            var lockInfo = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(directory, "lock-profile", "ready.json")));
            var lockWindow = (nint)lockInfo.GetProperty("Window").GetInt64();
            Until(() => InputName() == lockName, stop.Token, host);

            stage = "sesion"; nodeDouble.Command(Account(paused: false));
            Until(() => InputName() == use.Name, stop.Token, host);
            Until(() => File.Exists(Path.Combine(directory, "app.jsonl")), stop.Token, host); Thread.Sleep(300);
            var appWindow = (nint)ProbeRun.Read(directory, "app").GetProperty("Window").GetInt64();
            ReachesApp(directory, use, appWindow, stop.Token);
            report["ActiveInputReachesApp"] = true;

            stage = "pausa-cliente";
            var latencies = new List<double> { PauseByClient(directory, lockName, nodeDouble, stop.Token, host) };
            Isolated(directory, lockName, lockWindow, app); report["PauseIsolated"] = true;
            using (var shot = Open(lockName)) ProbeRun.Capture(shot.DangerousGetHandle(), directory, "pause");

            stage = "pausa-vencida";
            nodeDouble.Command(Account(paused: true, billing: true)); Thread.Sleep(1000);
            ProbeRun.Require(InputName() == lockName, "Pausa vencida abrió uso");
            Isolated(directory, lockName, lockWindow, app); report["ExpiredBillingPauseIsolated"] = true;
            using (var shot = Open(lockName)) ProbeRun.Capture(shot.DangerousGetHandle(), directory, "billing");

            stage = "sin-red";
            nodeDouble.Drop(TimeSpan.FromSeconds(4)); Thread.Sleep(2000);
            ProbeRun.Require(InputName() == lockName && state.Blocked, "Sin red abrió uso");
            Isolated(directory, lockName, lockWindow, app);
            Until(() => nodeDouble.Connections >= 2, stop.Token, host); Thread.Sleep(500);
            ProbeRun.Require(InputName() == lockName, "Reconexión abrió uso");
            report["OfflinePauseIsolated"] = true; report["ReconnectedHello"] = nodeDouble.LastHello;

            stage = "reanudar-panel";
            nodeDouble.Command(Account(paused: false));
            Until(() => InputName() == use.Name, stop.Token, host);
            ReachesApp(directory, use, appWindow, stop.Token); report["PanelResume"] = true;

            stage = "reanudar-cliente";
            latencies.Add(PauseByClient(directory, lockName, nodeDouble, stop.Token, host));
            var resumes = nodeDouble.Resumes;
            using (var locked = Open(lockName)) ProbeInput.On(locked.DangerousGetHandle(), () =>
            {
                ProbeInput.Focus(lockWindow);
                ProbeInput.Tap(0x09, 0x0d); Thread.Sleep(500); // Reanudar → «¿Eres Cliente?»
                ProbeInput.Tap(0x09, 0x0d);                    // Cancelar → «Sí, reanudar»
            });
            Until(() => InputName() == use.Name, stop.Token, host);
            ProbeRun.Require(nodeDouble.Resumes == resumes + 1, "La reanudación no pasó por el nodo");
            ReachesApp(directory, use, appWindow, stop.Token); report["ClientResumeConfirmed"] = true;

            stage = "cierre-en-pausa";
            latencies.Add(PauseByClient(directory, lockName, nodeDouble, stop.Token, host));
            nodeDouble.Command(new { type = "sessionEnded", sessionId = SessionId, reason = "staff" });
            nodeDouble.Command(new { type = "state", status = "locked" }); Thread.Sleep(1000);
            using (var locked = Open(lockName)) ProbeInput.On(locked.DangerousGetHandle(), () =>
            {
                ProbeInput.Focus(lockWindow); ProbeInput.AltTab();
                ProbeRun.Require(ProbeInput.ForegroundPid() == lockInfo.GetProperty("Pid").GetUInt32(), "Alt+Tab sin sesión escapó");
            });
            ProbeRun.Require(InputName() == lockName && !app.HasExited, "Cierre en pausa abrió uso o cerró la app");
            report["ClosedWhilePausedStaysLocked"] = true;
            report["AppSamePidAlive"] = !app.HasExited;
            report["PauseLatencyMs"] = latencies;
            report["PauseLatencyMaxMs"] = latencies.Max();
            report["Monitors"] = Screen.AllScreens.Length;
            report["NoExplorer"] = !DesktopNative.HasExplorer(use.DangerousGetHandle());
            report["Passed"] = true;
        }
        catch (Exception error)
        {
            report["Passed"] = false; report["Stage"] = stage; report["ErrorKind"] = error.GetType().Name;
            report["Error"] = error.Message; report["Inner"] = error.InnerException?.Message;
        }
        finally
        {
            original.Activate(); report["Restored"] = InputName() == original.Name;
            stop.Cancel();
            foreach (var task in new[] { channelTask, pipeTask, nodeTask }) { try { task.Wait(5000); } catch (AggregateException) { } }
            foreach (var child in new[] { host, app }) { if (!child.HasExited) child.Kill(true); child.WaitForExit(); }
            File.WriteAllText(Path.Combine(directory, "stop"), "T23 terminada"); recovery.WaitForExit(5000);
            File.WriteAllText(Path.Combine(directory, "report.json"), JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
        }
        return report["Passed"] is true && report["Restored"] is true ? 0 : 1;
    }

    // REQ-002-50 (medición previa de T25): desde confirmar «Pausar» hasta que el bloqueo recibe la entrada.
    private static double PauseByClient(string directory, string lockName, NodeDouble node, CancellationToken token, Process host)
    {
        var clicked = Path.Combine(directory, "pause-clicked.json");
        File.Delete(clicked);
        var pauses = node.Pauses;
        File.WriteAllText(Path.Combine(directory, "click-pause"), "1");
        while (InputName() != lockName) { token.ThrowIfCancellationRequested(); ProbeRun.Require(!host.HasExited, "Host terminado"); Thread.Sleep(5); }
        var locked = Stopwatch.GetTimestamp();
        Until(() => File.Exists(clicked), token, host);
        var click = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(clicked));
        ProbeRun.Require(click.TryGetProperty("Timestamp", out var at), "No se pulsó Pausar");
        ProbeRun.Require(node.Pauses == pauses + 1, "La pausa no pasó por el nodo");
        return Math.Round(Stopwatch.GetElapsedTime(at.GetInt64(), locked).TotalMilliseconds, 1);
    }

    private static void ReachesApp(string directory, NativeDesktop use, nint appWindow, CancellationToken token)
    {
        var before = ProbeRun.Read(directory, "app");
        ProbeInput.On(use.DangerousGetHandle(), () => { ProbeInput.Focus(appWindow); ProbeInput.Press(); });
        Until(() => ProbeRun.Read(directory, "app").GetProperty("Keys").GetInt32() > before.GetProperty("Keys").GetInt32() &&
            ProbeRun.Read(directory, "app").GetProperty("Clicks").GetInt32() > before.GetProperty("Clicks").GetInt32(), token, null);
    }

    // REQ-002-04/05: teclas, clic y Alt+Tab no llegan a la app, que sigue viva y sin suspender.
    private static void Isolated(string directory, string lockName, nint lockWindow, Process app)
    {
        var before = ProbeRun.Read(directory, "app");
        using (var locked = Open(lockName)) ProbeInput.On(locked.DangerousGetHandle(), () =>
        {
            ProbeInput.Focus(lockWindow); ProbeInput.Tap(0x41); ProbeInput.ClickAt(0.03, 0.03); ProbeInput.AltTab();
        });
        Thread.Sleep(400);
        var after = ProbeRun.Read(directory, "app");
        ProbeRun.Require(before.GetProperty("Keys").GetInt32() == after.GetProperty("Keys").GetInt32() &&
            before.GetProperty("Clicks").GetInt32() == after.GetProperty("Clicks").GetInt32(), "Entrada escapó de la pausa");
        ProbeRun.Require(!app.HasExited && after.GetProperty("HeartbeatMs").GetInt64() > before.GetProperty("HeartbeatMs").GetInt64(), "App detenida en pausa");
        ProbeRun.Require(InputName() == lockName, "Alt+Tab escapó de la pausa");
    }

    internal static Dictionary<string, object?> Account(bool paused, bool billing = false, string? requestId = null)
    {
        var now = DateTimeOffset.UtcNow;
        var started = billing ? now.AddSeconds(-900) : now;
        var state = new Dictionary<string, object?>
        {
            ["type"] = "state",
            ["status"] = "active",
            ["vesRate"] = null,
            ["session"] = new
            {
                kind = "account",
                sessionId = SessionId,
                startedAt = "2026-10-18T00:00:00Z",
                username = "Cliente",
                ratePerHour = new { micros = 1000000, currency = "USD" },
                money = new { micros = 1000000, currency = "USD" },
                moneySeconds = 3600,
                comboSeconds = 0,
                remainingSeconds = 3600,
                pause = paused ? new { startedAt = started.ToString("yyyy-MM-ddTHH:mm:ssZ"), maxUntil = started.AddSeconds(900).ToString("yyyy-MM-ddTHH:mm:ssZ"), secondsLeft = billing ? 0 : 900, billing } : null,
                pausesLeft = 3,
                pauseLimit = (string?)null,
                pauseMaxSeconds = 900
            }
        };
        if (requestId != null) state["requestId"] = requestId;
        return state;
    }

    private static void Until(Func<bool> condition, CancellationToken token, Process? host)
    {
        while (!condition()) { token.ThrowIfCancellationRequested(); ProbeRun.Require(host is null || !host.HasExited, "Host terminado"); Thread.Sleep(50); }
    }
    private static async Task Until(CoreWebView2 core, string condition)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        while (await core.ExecuteScriptAsync($"Boolean({condition})") != "true") await Task.Delay(20, deadline.Token);
    }
    private static string InputName()
    {
        var handle = DesktopNative.OpenInputDesktop(0, false, 0x20101);
        if (handle == 0) return "error:" + System.Runtime.InteropServices.Marshal.GetLastWin32Error();
        try { return DesktopNative.Name(handle); } finally { DesktopNative.CloseDesktop(handle); }
    }
    // El mismo nombre abre el objeto de bloqueo existente, con el mismo logon.
    private static NativeDesktop Open(string name) => NativeDesktop.Create(name);

    // Responde como el nodo: estado tras cada latido, pausa/reanudación con su requestId.
    private sealed class NodeDouble(ProofNode node, CancellationToken token)
    {
        private readonly object gate = new();
        private WebSocket? socket;
        private object current = new { type = "state", status = "locked" };
        private DateTime refuseUntil;
        internal int Connections, Pauses, Resumes;
        internal string? LastHello;

        internal async Task RunAsync()
        {
            while (!token.IsCancellationRequested)
            {
                var wait = refuseUntil - DateTime.UtcNow;
                if (wait > TimeSpan.Zero) await Task.Delay(wait, token);
                using var accepted = await node.Accept(token);
                var hello = await ProofNode.Read(accepted, token);
                if (hello.GetProperty("type").GetString() != "hello") throw new InvalidDataException();
                LastHello = hello.GetProperty("recoveryState").GetString();
                lock (gate) { socket = accepted; Connections++; }
                await node.Send(accepted, Current(), token);
                try
                {
                    while (true)
                    {
                        var message = await ProofNode.Read(accepted, token);
                        switch (message.GetProperty("type").GetString())
                        {
                            case "heartbeat": await node.Send(accepted, Current(), token); break;
                            case "pause":
                                Interlocked.Increment(ref Pauses);
                                await Reply(accepted, Account(paused: true, requestId: message.GetProperty("requestId").GetString())); break;
                            case "resume":
                                Interlocked.Increment(ref Resumes);
                                await Reply(accepted, Account(paused: false, requestId: message.GetProperty("requestId").GetString())); break;
                        }
                    }
                }
                catch (Exception) when (!token.IsCancellationRequested) { /* Corte provocado: se acepta la reconexión. */ }
                finally { lock (gate) if (socket == accepted) socket = null; }
            }
        }
        private object Current() { lock (gate) return current; }
        private async Task Reply(WebSocket target, Dictionary<string, object?> state)
        {
            lock (gate) current = state.Where(p => p.Key != "requestId").ToDictionary(p => p.Key, p => p.Value);
            await node.Send(target, state, token);
        }
        internal void Command(object message)
        {
            WebSocket target;
            lock (gate)
            {
                if (message is Dictionary<string, object?> || message.GetType().GetProperty("status") != null) current = message;
                target = socket ?? throw new InvalidOperationException("Agente sin conexión");
            }
            node.Send(target, message, token).GetAwaiter().GetResult();
        }
        internal void Drop(TimeSpan refuse)
        {
            lock (gate) { refuseUntil = DateTime.UtcNow + refuse; socket?.Abort(); }
        }
    }
}
