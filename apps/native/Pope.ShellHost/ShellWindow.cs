using System.Diagnostics;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Pope.ShellHost;

// REQ-003-03/04/63: interfaz local sin credencial de PC ni privilegios del servicio.
internal sealed class ShellWindow : Form
{
    private readonly WebView2 view = new() { Dock = DockStyle.Fill };
    private readonly string assets, profile;
    private readonly HostBridge? bridge;
    private readonly CancellationTokenSource closing = new();
    private Task? bridgeTask;
    private bool ready;
    private JsonElement status = HostBridge.Offline();
    private JsonElement? state;
    private long stateAt;
    internal bool Failed { get; private set; }
    internal TaskCompletionSource<CoreWebView2> Initialized { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

    internal ShellWindow(string assets, string profile, HostBridge? bridge = null, bool fullscreen = true)
    {
        this.assets = assets; this.profile = profile; this.bridge = bridge;
        Text = "Pope"; BackColor = Color.FromArgb(20, 24, 36);
        if (fullscreen) { FormBorderStyle = FormBorderStyle.None; WindowState = FormWindowState.Maximized; }
        else { Size = new Size(1280, 800); StartPosition = FormStartPosition.CenterScreen; }
        Controls.Add(view);
        Shown += Initialize;
        FormClosing += (_, _) => { closing.Cancel(); bridge?.Stop(); };
    }

    private async void Initialize(object? sender, EventArgs args)
    {
        try
        {
            HostBoundary.RequireInteractiveUser();
            if (!File.Exists(Path.Combine(assets, "index.html"))) throw new InvalidDataException();
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: profile,
                options: new CoreWebView2EnvironmentOptions { ExclusiveUserDataFolderAccess = true });
            await view.EnsureCoreWebView2Async(environment);
            if (closing.IsCancellationRequested) return;
            var core = view.CoreWebView2;
            var settings = core.Settings;
            settings.AreDevToolsEnabled = false; settings.AreDefaultContextMenusEnabled = false;
            settings.AreBrowserAcceleratorKeysEnabled = false; settings.AreHostObjectsAllowed = false;
            settings.AreDefaultScriptDialogsEnabled = false; settings.IsStatusBarEnabled = false;
            settings.IsGeneralAutofillEnabled = false; settings.IsPasswordAutosaveEnabled = false;
            settings.IsZoomControlEnabled = false; settings.IsPinchZoomEnabled = false;
            settings.IsSwipeNavigationEnabled = false;
            core.NavigationStarting += (_, e) => { if (!HostBoundary.Allows(e.Uri)) e.Cancel = true; else ready = false; };
            core.FrameNavigationStarting += (_, e) => e.Cancel = true;
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.DownloadStarting += (_, e) => { e.Cancel = true; e.Handled = true; };
            core.PermissionRequested += (_, e) => { e.State = CoreWebView2PermissionState.Deny; e.Handled = true; };
            core.LaunchingExternalUriScheme += (_, e) => e.Cancel = true;
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
            core.WebResourceRequested += (_, e) =>
            {
                if (!HostBoundary.Allows(e.Request.Uri)) e.Response = environment.CreateWebResourceResponse(null, 403, "Forbidden", "Content-Type: text/plain");
            };
            core.WebMessageReceived += Message;
            core.SetVirtualHostNameToFolderMapping(HostBoundary.HostName, assets, CoreWebView2HostResourceAccessKind.DenyCors);
            core.Navigate(HostBoundary.Home);
            if (bridge != null) bridgeTask = bridge.RunAsync(Deliver, closing.Token);
            Initialized.TrySetResult(core);
        }
        catch
        {
            Failed = true; Initialized.TrySetException(new InvalidOperationException("No se pudo cargar la interfaz local."));
            Controls.Remove(view); view.Dispose();
            Controls.Add(new Label { Dock = DockStyle.Fill, ForeColor = Color.White, TextAlign = ContentAlignment.MiddleCenter, Text = "No se pudo cargar la interfaz de Pope. Contacta al encargado." });
        }
    }

    private void Message(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            if (!HostBoundary.Allows(view.CoreWebView2.Source)) return;
            var envelope = HostBoundary.ReadRequest(e.Source, e.WebMessageAsJson);
            if (envelope.GetProperty("kind").GetString() == "ready")
            {
                ready = true; Post(status); ReplayState(); return;
            }
            var request = envelope.GetProperty("request");
            if (bridge?.Send(request) == true) return;
            var error = new Dictionary<string, object?> { ["type"] = "error", ["code"] = "internal_error", ["message"] = "Sin conexión con el servidor." };
            if (request.TryGetProperty("requestId", out var id)) error["requestId"] = id.GetString();
            Post(JsonSerializer.SerializeToElement(new { version = 1, kind = "message", message = error, elapsedSeconds = 0 }));
        }
        catch { /* Origen/tipo/tamaño inválido: descartar, nunca copiar datos a logs. */ }
    }

    internal Task Deliver(JsonElement envelope, CancellationToken token) => InvokeAsync(() =>
    {
        if (envelope.GetProperty("kind").GetString() == "status") status = envelope.Clone();
        else if (envelope.GetProperty("message").GetProperty("type").GetString() == "state")
        { state = envelope.Clone(); stateAt = Stopwatch.GetTimestamp(); }
        Post(envelope);
    }, token);

    private void ReplayState()
    {
        if (state is not { } saved) return;
        var age = saved.GetProperty("elapsedSeconds").GetInt64() + (long)Stopwatch.GetElapsedTime(stateAt).TotalSeconds;
        Post(JsonSerializer.SerializeToElement(new { version = 1, kind = "message", message = saved.GetProperty("message"), elapsedSeconds = age }));
    }
    private void Post(JsonElement envelope)
    {
        if (ready && !closing.IsCancellationRequested && HostBoundary.Allows(view.CoreWebView2.Source))
            view.CoreWebView2.PostWebMessageAsJson(envelope.GetRawText());
    }
    internal void WaitForBridge()
    {
        try { bridgeTask?.WaitAsync(TimeSpan.FromSeconds(5)).GetAwaiter().GetResult(); }
        catch { /* La ventana cerrada cancela lector, escritor y publicaciones pendientes. */ }
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing) { if (!closing.IsCancellationRequested) closing.Cancel(); closing.Dispose(); view.Dispose(); }
        base.Dispose(disposing);
    }
}
