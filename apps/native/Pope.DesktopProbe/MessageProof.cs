using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Pope.Agent;
using Pope.Bridge;
using Pope.ShellHost;

namespace Pope.DesktopProbe;

// T32 · REQ-003-20: mensaje del encargado en escritorios reales, con la cadena del agente y del
// host de producto y el doble del nodo. Comprueba que se ve, que no quita el foco ni la
// entrada, que dura 5 s, que el texto es texto plano y que uno de otra sesión no se muestra.
internal static class MessageProof
{
    private const string Hostile = "<b>negrita</b> & <script>alert(1)</script>";

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
        var commands = new AgentCommands(state, new ClientSessionCleanup(() => null, () => [], _ => false, _ => { }), channel.SendMessageAsync,
            new AgentLog(directory), present: (id, text, token) => agent.ShowStaffMessageAsync(id, text, TimeSpan.FromSeconds(10), token));
        channel.Message += commands.OnMessage;
        var nodeDouble = new PauseProof.NodeDouble(node, stop.Token);
        var name = PipeEndpoints.NewName();
        using var app = use.Start(Environment.ProcessPath!, "--window", "app", directory);
        using var host = use.Start(Environment.ProcessPath!, "--pause-host", directory, name, Environment.ProcessId.ToString(), Path.Combine(directory, "PauseAudio.json"));
        var channelTask = channel.RunAsync(stop.Token);
        var pipeTask = agent.RunForHostAsync(host, name, stop.Token);
        var nodeTask = nodeDouble.RunAsync();

        // Envía el contexto y el mensaje como el nodo; devuelve los resultados del acuse.
        string[] Send(string text, object context, out string id, bool control = true)
        {
            // Sin controlState nuevo, la hora del agente es la del último (truncada al ms): se emite
            // 1 s antes para que la vigencia no dependa de ese redondeo del doble del nodo.
            var now = DateTime.UtcNow.AddSeconds(control ? 0 : -1);
            static string Utc(DateTime value) => value.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", System.Globalization.CultureInfo.InvariantCulture);
            var commandId = Guid.CreateVersion7().ToString(); id = commandId;
            if (control) nodeDouble.Command(new { type = "controlState", serverTime = Utc(now), context });
            nodeDouble.Command(new
            {
                type = "command",
                command = new
                {
                    id = commandId,
                    pcId = configuration.PcId,
                    actor = new { kind = "staff", staffId = configuration.PcId, name = "Ana" },
                    expected = context,
                    issuedAt = Utc(now),
                    expiresAt = Utc(now.AddSeconds(30)),
                    action = new { kind = "showMessage", text }
                }
            });
            string[] Results() { lock (nodeDouble.Acks) return nodeDouble.Acks.Where(a => a.GetProperty("commandId").GetString() == commandId).Select(a => a.GetProperty("result").GetProperty("status").GetString() + ":" + (a.GetProperty("result").TryGetProperty("code", out var c) ? c.GetString() : "")).ToArray(); }
            PauseProof.Until(() => Results().Any(r => !r.StartsWith("accepted", StringComparison.Ordinal)), stop.Token, host);
            return Results();
        }
        try
        {
            stage = "bloqueo";
            PauseProof.Until(() => File.Exists(Path.Combine(directory, "parent-ready.json")) && File.Exists(Path.Combine(directory, "lock-profile", "ready.json")), stop.Token, host);
            var lockName = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(directory, "parent-ready.json"))).GetProperty("LockName").GetString()!;
            var lockPid = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(directory, "lock-profile", "ready.json"))).GetProperty("Pid").GetUInt32();
            PauseProof.Until(() => PauseProof.InputName() == lockName, stop.Token, host);

            stage = "libre";
            var freeWatch = Stopwatch.StartNew();
            var free = Send("La PC 04 queda reservada para un torneo a las 20:00.", new { kind = "free", revision = Guid.CreateVersion7().ToString() }, out _);
            ProbeRun.Require(free.SequenceEqual(["accepted:", "applied:"]), "Mensaje sin mostrar en el bloqueo: " + string.Join(",", free));
            nint lockMessage;
            using (var locked = PauseProof.Open(lockName)) lockMessage = Find(locked.DangerousGetHandle(), lockPid);
            ProbeRun.Require(lockMessage != 0, "No hay ventana de mensaje en el escritorio de bloqueo");
            using (var locked = PauseProof.Open(lockName)) ProbeRun.Capture(locked.DangerousGetHandle(), directory, "message-lock");
            // Desde el ensayo IsWindow no ve las ventanas del escritorio de bloqueo (DACL del host);
            // enumerarlas sí, así que se espera a que la ventana del mensaje deje de estar.
            PauseProof.Until(() => { using var locked = PauseProof.Open(lockName); return Find(locked.DangerousGetHandle(), lockPid) == 0; }, stop.Token, host);
            report["LockMessageClosedMs"] = freeWatch.ElapsedMilliseconds;
            // El bloqueo sigue intacto al quitarse el mensaje.
            using (var locked = PauseProof.Open(lockName)) ProbeRun.Capture(locked.DangerousGetHandle(), directory, "message-lock-after");

            stage = "sesion";
            nodeDouble.Command(PauseProof.Account(paused: false));
            PauseProof.Until(() => PauseProof.InputName() == use.Name, stop.Token, host);
            PauseProof.Until(() => File.Exists(Path.Combine(directory, "app.jsonl")), stop.Token, host); Thread.Sleep(300);
            var appWindow = (nint)ProbeRun.Read(directory, "app").GetProperty("Window").GetInt64();
            ProbeInput.On(use.DangerousGetHandle(), () => ProbeInput.Focus(appWindow));
            var session = new { kind = "session", revision = Guid.CreateVersion7().ToString(), sessionId = "01900000-0000-7000-8000-000000000124" };
            var started = Stopwatch.StartNew();
            var shown = Send(Hostile, session, out _);
            ProbeRun.Require(shown.SequenceEqual(["accepted:", "applied:"]), "Mensaje sin mostrar sobre la app: " + string.Join(",", shown));
            var useMessage = Find(use.DangerousGetHandle(), (uint)host.Id);
            ProbeRun.Require(useMessage != 0, "No hay ventana de mensaje en el escritorio de uso");
            report["ShownMs"] = started.ElapsedMilliseconds;
            nint foreground = 0;
            ProbeInput.On(use.DangerousGetHandle(), () => foreground = GetForegroundWindow());
            ProbeRun.Require(foreground == appWindow, "El mensaje quitó el foco a la app");
            report["FocusKept"] = true;
            var texts = Texts(useMessage);
            ProbeRun.Require(texts.Contains(Hostile), "El texto no se muestra tal cual: " + string.Join(" | ", texts));
            report["PlainText"] = true;
            using (var shot = PauseProof.Open(use.Name)) ProbeRun.Capture(shot.DangerousGetHandle(), directory, "message-use");
            // Tecla y clic en el centro de la app, justo debajo del mensaje: los recibe la app.
            var before = ProbeRun.Read(directory, "app");
            string? press = null;
            ProbeInput.On(use.DangerousGetHandle(), () => press = ProbeInput.Press());
            PauseProof.Until(() => ProbeRun.Read(directory, "app").GetProperty("Keys").GetInt32() > before.GetProperty("Keys").GetInt32() &&
                ProbeRun.Read(directory, "app").GetProperty("Clicks").GetInt32() > before.GetProperty("Clicks").GetInt32(), stop.Token, host);
            ProbeRun.Require(IsWindowVisible(useMessage), "El mensaje se cerró antes de probar la entrada");
            report["InputPassesThrough"] = true; report["PressDiagnostic"] = press;
            PauseProof.Until(() => !IsWindow(useMessage), stop.Token, host);
            report["UseMessageClosedMs"] = started.ElapsedMilliseconds;

            stage = "otra-sesion";
            var other = Send("Para el cliente anterior", new { kind = "session", revision = Guid.CreateVersion7().ToString(), sessionId = "01900000-0000-7000-8000-000000000999" }, out _, control: false);
            ProbeRun.Require(other.SequenceEqual(["failed:stale_context"]), "Un mensaje de otra sesión no se descartó: " + string.Join(",", other));
            Thread.Sleep(500);
            ProbeRun.Require(Find(use.DangerousGetHandle(), (uint)host.Id) == 0, "Se mostró un mensaje de otra sesión");
            report["OtherSessionDiscarded"] = true;
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
            foreach (var task in new[] { channelTask, pipeTask, nodeTask }) { try { task.Wait(5000); } catch (AggregateException) { } }
            foreach (var child in new[] { host, app }) { if (!child.HasExited) child.Kill(true); child.WaitForExit(); }
            File.WriteAllText(Path.Combine(directory, "stop"), "T32 terminada"); recovery.WaitForExit(5000);
            File.WriteAllText(Path.Combine(directory, "report.json"), JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
        }
        return report["Passed"] is true && report["Restored"] is true ? 0 : 1;
    }

    // Ventana visible del proceso con los cinco estilos del mensaje (TOPMOST, TRANSPARENT,
    // TOOLWINDOW, LAYERED y NOACTIVATE): WebView2 crea otras con alguno de ellos.
    private static nint Find(nint desktop, uint pid)
    {
        nint found = 0;
        // EnumDesktopWindows: recorre las ventanas de primer nivel de ese escritorio.
        EnumDesktopWindows(desktop, (window, _) =>
        {
            GetWindowThreadProcessId(window, out var owner);
            var style = GetWindowLongPtrW(window, -20).ToInt64();
            if (owner == pid && IsWindowVisible(window) && (style & 0x080800A8) == 0x080800A8) { found = window; return false; }
            return true;
        }, 0);
        return found;
    }

    // Textos de los controles hijos: lo que el cliente ve escrito, sin interpretar.
    private static List<string> Texts(nint window)
    {
        var texts = new List<string>();
        // EnumChildWindows + GetWindowTextW: lee el texto de cada etiqueta de la ventana.
        EnumChildWindows(window, (child, _) =>
        {
            var buffer = new StringBuilder(2048);
            GetWindowTextW(child, buffer, buffer.Capacity);
            texts.Add(buffer.ToString()); return true;
        }, 0);
        return texts;
    }

    private delegate bool EnumProc(nint window, nint parameter);
    [DllImport("user32.dll")] private static extern bool EnumDesktopWindows(nint desktop, EnumProc callback, nint parameter);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(nint parent, EnumProc callback, nint parameter);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out uint pid);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint window);
    // IsWindow: la ventana sigue existiendo (el mensaje la destruye al cerrarse a los 5 s).
    [DllImport("user32.dll")] private static extern bool IsWindow(nint window);
    [DllImport("user32.dll")] private static extern nint GetWindowLongPtrW(nint window, int index);
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextW(nint window, StringBuilder text, int length);
}
