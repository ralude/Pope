using System.Diagnostics;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.Json;
using Microsoft.Win32;

namespace Pope.DesktopProbe;

// REQ-003-40/43: observación manual de sesión Windows; no implementa entrada/retorno.
internal sealed class SessionWindow : Form
{
    private readonly string id, role, directory, fixture, fixtureHash;
    private readonly ProbeToken.TokenState token;
    private readonly bool profileMatches;
    private readonly DateTime startedUtc;
    private readonly Stopwatch lifetime = Stopwatch.StartNew();
    private readonly System.Windows.Forms.Timer timer = new() { Interval = 1000 };
    private readonly List<Process> children = [];
    private long? explorerSince;
    private (int Pid, DateTime StartedUtc)? trackedExplorer;
    private long maxExplorerObservedMs;
    private bool seenOnConsole;
    private JsonElement? clientEvidence;
    private string? error;

    private SessionWindow(string id, string role, ProbeToken.TokenState token)
    {
        this.id = id; this.role = role; this.token = token;
        using var current = Process.GetCurrentProcess();
        startedUtc = current.StartTime.ToUniversalTime();
        directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Pope", "Probes", "OwnSession", id);
        Directory.CreateDirectory(directory);
        ProbeRun.Require(!File.Exists(Path.Combine(directory, role + ".json")), "Ya existe observación de este rol; conservar evidencia antes de repetir");
        fixture = Path.Combine(directory, role + "-fixture.txt");
        ProbeRun.Require(!File.Exists(fixture), "No reemplazar un archivo previo");
        File.WriteAllText(fixture, "Archivo ficticio Pope T10 " + id + " " + role);
        fixtureHash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(fixture)));
        var expectedProfile = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\" + token.User, "ProfileImagePath", null) as string;
        profileMatches = expectedProfile != null && string.Equals(
            Path.GetFullPath(Environment.ExpandEnvironmentVariables(expectedProfile)),
            Path.GetFullPath(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)), StringComparison.OrdinalIgnoreCase);
        ProbeRun.Require(profileMatches, "El perfil no coincide con la identidad Windows");
        Text = role switch { "client" => "Pope T10 · Cliente", "admin" => "Pope T10 · Windows administrador", _ => "Pope T10 · Herramienta elevada" };
        Size = new Size(620, 280); StartPosition = FormStartPosition.CenterScreen;
        var information = new Label
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(24),
            Text =
            role == "client" ? "Cliente estándar observado.\nConserva esta ventana al cambiar de usuario.\nLa prueba dura un máximo de 15 minutos." :
            "Observación de Windows y del perfil.\nMantén esta ventana abierta al menos 30 segundos.\nAl terminar, cierra la sesión desde Windows."
        };
        Controls.Add(information);
        if (role == "admin")
        {
            var elevate = new Button { Text = "Abrir herramienta con UAC", Dock = DockStyle.Bottom, Height = 48 };
            elevate.Click += (_, _) =>
            {
                try
                {
                    var child = Process.Start(new ProcessStartInfo(Environment.ProcessPath!, "--session-window " + id + " elevated")
                    { UseShellExecute = true, Verb = "runas", WindowStyle = ProcessWindowStyle.Normal });
                    if (child == null) throw new IOException("No se inició la herramienta");
                    children.Add(child); elevate.Enabled = false;
                }
                catch (Exception exception) { error = exception.GetType().Name; Save(); }
            };
            Controls.Add(elevate);
        }
        timer.Tick += (_, _) =>
        {
            try { Save(); }
            catch (Exception exception) { error = exception.GetType().Name; timer.Stop(); information.Text = "La observación falló. Conservar evidencia y detener el ensayo."; }
            if (lifetime.Elapsed > TimeSpan.FromMinutes(15)) Close();
        };
        Shown += (_, _) => { Save(); timer.Start(); };
        FormClosed += (_, _) =>
        {
            timer.Dispose();
            try { Save(); } finally { foreach (var child in children) child.Dispose(); }
            // No termina procesos ni sesiones: Windows controla el cierre manual de esta etapa.
        };
    }

    internal static int Run(string id, string role)
    {
        MaintenanceRunner.RequireVm();
        using var identity = WindowsIdentity.GetCurrent();
        var token = ProbeToken.Inspect(identity.Token);
        ProbeRun.Require(Environment.UserInteractive && token.Session != 0 && !identity.IsSystem, "Se necesita una sesión Windows de usuario");
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Pope-T10Session-" + id);
        using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "manifest.json")));
        var state = manifest.RootElement;
        ProbeRun.Require(state.GetProperty("RunId").GetString() == id && state.GetProperty("Stage").GetString() == "Ready" &&
            state.GetProperty("StandardVerified").GetBoolean(), "Preparación de cuenta no verificada");
        var expectedUser = state.GetProperty(role == "client" ? "ClientSid" : "AdminSid").GetString();
        ProbeRun.Require(token.User == expectedUser && token.Logon != null, "Identidad de sesión incorrecta");
        ProbeRun.Require(role == "elevated" ? token.Elevated && token.Integrity == 12288 : !token.Elevated && token.Integrity == 8192,
            "El token no corresponde al rol observado");
        ApplicationConfiguration.Initialize();
        using var window = new SessionWindow(id, role, token);
        if (role == "elevated")
        {
            var clientSid = state.GetProperty("ClientSid").GetString()!;
            var clientProfile = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\" + clientSid, "ProfileImagePath", null) as string;
            ProbeRun.Require(clientProfile != null, "Falta el perfil del cliente de ensayo");
            var clientFile = Path.Combine(Environment.ExpandEnvironmentVariables(clientProfile!), "AppData", "Local", "Pope", "Probes", "OwnSession", id, "client.json");
            using var client = JsonDocument.Parse(File.ReadAllText(clientFile));
            var sample = client.RootElement;
            ProbeRun.Require(sample.GetProperty("RunId").GetString() == id && sample.GetProperty("Role").GetString() == "client" &&
                sample.GetProperty("Token").GetProperty("User").GetString() == clientSid &&
                sample.GetProperty("Token").GetProperty("Session").GetUInt32() != token.Session,
                "Cliente ausente o sin separación de sesión Windows");
            window.clientEvidence = sample.Clone();
        }
        Application.Run(window);
        return 0;
    }

    private void Save()
    {
        var explorers = new List<ExplorerSample>();
        foreach (var process in Process.GetProcessesByName("explorer"))
        {
            using (process)
            {
                if ((uint)process.SessionId != token.Session) continue;
                using var explorerToken = ProbeToken.ForProcess(process.Id);
                var state = explorerToken.State;
                var imageMatches = string.Equals(process.MainModule?.FileName,
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe"), StringComparison.OrdinalIgnoreCase);
                ProbeRun.Require(state.User == token.User && state.Logon == token.Logon && state.Session == token.Session &&
                    !state.Elevated && state.Integrity == 8192 && imageMatches, "Explorer tiene identidad/token/imagen inesperados");
                explorers.Add(new ExplorerSample(process.Id, process.StartTime.ToUniversalTime(), state, imageMatches));
            }
        }
        if (explorers.Count == 0) { explorerSince = null; trackedExplorer = null; }
        else if (!explorers.Any(sample => (sample.Pid, sample.StartedUtc) == trackedExplorer))
        {
            trackedExplorer = (explorers[0].Pid, explorers[0].StartedUtc);
            explorerSince = lifetime.ElapsedMilliseconds;
        }
        var observedMs = explorerSince == null ? 0 : lifetime.ElapsedMilliseconds - explorerSince.Value;
        maxExplorerObservedMs = Math.Max(maxExplorerObservedMs, observedMs);
        var console = ProbeToken.ConsoleSession();
        seenOnConsole |= console == token.Session;
        var report = new
        {
            Utc = DateTime.UtcNow,
            RunId = id,
            Role = role,
            Pid = Environment.ProcessId,
            StartedUtc = startedUtc,
            Token = token,
            ConsoleSession = console,
            SeenOnConsole = seenOnConsole,
            ProfileMatches = profileMatches,
            HeartbeatMs = lifetime.ElapsedMilliseconds,
            FixtureUnchanged = File.Exists(fixture) && Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(fixture))) == fixtureHash,
            Explorers = explorers,
            ExplorerObservedMs = observedMs,
            MaxExplorerObservedMs = maxExplorerObservedMs,
            Children = children.Select(child => new { Pid = child.Id, Ended = child.HasExited }).ToArray(),
            ClientEvidence = clientEvidence,
            Error = error
        };
        var target = Path.Combine(directory, role + ".json");
        var temporary = target + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(report));
        File.Move(temporary, target, true);
        if (role == "client" && !File.Exists(Path.Combine(directory, "client-first.json")))
            File.Copy(target, Path.Combine(directory, "client-first.json"));
    }
    private sealed record ExplorerSample(int Pid, DateTime StartedUtc, ProbeToken.TokenState Token, bool ImageMatches);
}
