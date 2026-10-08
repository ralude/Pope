using System.Diagnostics;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Pope.DesktopProbe;

internal sealed class ProbeWindow : Form
{
    private readonly string role;
    private readonly string directory;
    private readonly string desktop;
    private readonly System.Windows.Forms.Timer timer = new() { Interval = 200 };
    private readonly Stopwatch lifetime = Stopwatch.StartNew();
    private bool ready;
    private int keys, clicks;
    private string? error, version;

    internal ProbeWindow(string role, string directory)
    {
        this.role = role;
        this.directory = directory;
        desktop = DesktopNative.Name(DesktopNative.GetThreadDesktop(DesktopNative.GetCurrentThreadId()));
        Text = role == "app" ? "Aplicación de prueba · T09" : $"Pope · {role} · T09";
        Size = new Size(800, 600);
        BackColor = Color.FromArgb(20, 24, 36);
        KeyPreview = true;
        StartPosition = FormStartPosition.CenterScreen;
        if (role == "lock") { FormBorderStyle = FormBorderStyle.None; WindowState = FormWindowState.Maximized; }
        KeyDown += (_, _) => keys++;
        MouseDown += (_, _) => clicks++;
        timer.Tick += (_, _) =>
        {
            Save();
            if (lifetime.Elapsed > TimeSpan.FromSeconds(180) || File.Exists(Path.Combine(directory, "stop"))) Close();
        };
        Shown += Initialize;
        FormClosed += (_, _) => { timer.Dispose(); Save(); };
    }

    private async void Initialize(object? sender, EventArgs args)
    {
        timer.Start();
        try
        {
            if (DesktopNative.Elevated()) throw new InvalidOperationException("La prueba exige token sin elevación");
            if (role == "app") { ready = true; return; }
            var view = new WebView2 { Dock = DockStyle.Fill };
            Controls.Add(view);
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: Path.Combine(directory, $"profile-{role}"));
            await view.EnsureCoreWebView2Async(environment);
            version = view.CoreWebView2.Environment.BrowserVersionString;
            view.CoreWebView2.Settings.AreDevToolsEnabled = false;
            view.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            view.CoreWebView2.NewWindowRequested += (_, e) => e.Handled = true;
            view.CoreWebView2.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
            view.CoreWebView2.WebMessageReceived += async (_, e) =>
            {
                switch (e.TryGetWebMessageAsString())
                {
                    case "ready":
                        ready = true;
                        using (var file = File.Create(Path.Combine(directory, $"{role}-webview.png")))
                            await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, file);
                        break;
                    case "key": keys++; break;
                    case "click": clicks++; break;
                }
            };
            view.CoreWebView2.NavigateToString($"""
                <!doctype html><html lang="es"><meta charset="utf-8"><body style="background:#141824;color:#fff;font:28px sans-serif;padding:48px">
                <h1>Pope · Prototipo T09</h1><p>Escritorio: {desktop}</p><p>Ventana: {role}</p>
                <p>REQ-003-33 · REQ-002-04/05</p><p>Prueba de WebView2. Retorno automático; sin sesión ni cobro.</p>
                <script>window.addEventListener('keydown',()=>chrome.webview.postMessage('key'));
                window.addEventListener('mousedown',()=>chrome.webview.postMessage('click'));
                requestAnimationFrame(()=>requestAnimationFrame(()=>chrome.webview.postMessage('ready')));</script></body></html>
                """);
        }
        catch (Exception exception) { error = exception.ToString(); Save(); }
    }

    private void Save()
    {
        var state = new
        {
            Role = role,
            Pid = Environment.ProcessId,
            Session = Process.GetCurrentProcess().SessionId,
            Desktop = desktop,
            CurrentDesktop = DesktopNative.Name(DesktopNative.GetThreadDesktop(DesktopNative.GetCurrentThreadId())),
            Window = Handle.ToInt64(),
            Ready = ready,
            Keys = keys,
            Clicks = clicks,
            HeartbeatMs = lifetime.ElapsedMilliseconds,
            Elevated = DesktopNative.Elevated(),
            Version = version,
            Error = error
        };
        // Historial acotado por los 180 s de prueba; evita reemplazar un archivo leído.
        File.AppendAllText(Path.Combine(directory, $"{role}.jsonl"), JsonSerializer.Serialize(state) + "\n");
    }
}
