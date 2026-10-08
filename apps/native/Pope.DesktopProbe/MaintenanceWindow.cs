using System.Diagnostics;
using System.Security.Principal;
using System.Text.Json;

namespace Pope.DesktopProbe;

internal sealed class MaintenanceWindow : Form
{
    private readonly string id, role;
    private readonly System.Windows.Forms.Timer timer = new() { Interval = 200 };
    private readonly Stopwatch time = Stopwatch.StartNew();
    private Process? child;
    internal MaintenanceWindow(string id, string role)
    {
        this.id = id; this.role = role;
        using var identity = WindowsIdentity.GetCurrent();
        ProbeRun.Require(DesktopNative.Elevated() && !identity.IsSystem, "La ventana administrativa exige usuario elevado, nunca SYSTEM");
        Text = "Pope · Mantenimiento elevado T10 · " + role;
        Size = new Size(800, 500); StartPosition = FormStartPosition.CenterScreen;
        Controls.Add(new Label
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(32),
            ForeColor = Color.White,
            BackColor = Color.FromArgb(20, 24, 36),
            Font = new Font("Segoe UI", 16),
            Text = $"Prototipo T10 · REQ-003-40/43\n\nUsuario: {identity.Name}\nPerfil: {Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)}\n\nEsta ventana debe estar elevada; WebView2 continúa limitado.\nSalida automática, solo procesos del ensayo."
        });
        Shown += (_, _) =>
        {
            if (role == "admin")
            {
                var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false };
                start.ArgumentList.Add("--maintenance-window"); start.ArgumentList.Add(id); start.ArgumentList.Add("child");
                child = Process.Start(start) ?? throw new IOException("No se creó el hijo administrativo");
            }
            Save(); timer.Start();
        };
        timer.Tick += (_, _) => { Save(); if (time.Elapsed.TotalSeconds > 90) Close(); };
        FormClosed += (_, _) => { timer.Dispose(); child?.Dispose(); };
    }
    private void Save()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var state = new
        {
            Role = role,
            Pid = Environment.ProcessId,
            Session = Process.GetCurrentProcess().SessionId,
            Token = ProbeToken.Inspect(identity.Token),
            Profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            Desktop = DesktopNative.Name(DesktopNative.GetThreadDesktop(DesktopNative.GetCurrentThreadId())),
            Window = Handle.ToInt64(),
            ChildPid = child?.Id,
            HeartbeatMs = time.ElapsedMilliseconds,
            Ready = true
        };
        File.AppendAllText(Path.Combine(Evidence(id), role + ".jsonl"), JsonSerializer.Serialize(state) + "\n");
    }
    internal static string Evidence(string id) => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonDocuments),
        "PopeMaintenanceProbe-" + Guid.ParseExact(id, "N").ToString("N"));
}
