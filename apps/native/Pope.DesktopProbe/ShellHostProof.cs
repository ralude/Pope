using System.Text.Json;
using System.Net;
using System.Net.Sockets;
using Microsoft.Web.WebView2.Core;
using Pope.ShellHost;

namespace Pope.DesktopProbe;

// T19: usa la ventana de producto en el escritorio actual, sin instalar ni modificar Windows.
internal static class ShellHostProof
{
    internal static int Run(string directory)
    {
        HostBoundary.RequireInteractiveUser();
        if (Directory.Exists(directory)) return 1;
        Directory.CreateDirectory(directory);
        ApplicationConfiguration.Initialize();
        using var window = new ShellWindow(Path.Combine(AppContext.BaseDirectory, "shell"), Path.Combine(directory, "profile"), fullscreen: false);
        var passed = false;
        window.Shown += async (_, _) =>
        {
            var stage = "inicio";
            try
            {
                var core = await window.Initialized.Task.WaitAsync(TimeSpan.FromSeconds(20));
                stage = "interfaz";
                await Until(async () => await core.ExecuteScriptAsync("document.getElementById('root').children.length > 0") == "true");
                var offline = await core.ExecuteScriptAsync("document.body.innerText.includes('Sin conexión con el servidor')");
                using (var picture = File.Create(Path.Combine(directory, "shell.png")))
                    await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, picture);
                if (offline != "true") throw new InvalidOperationException();

                stage = "mensajes";
                await core.ExecuteScriptAsync("window.proofMessages=[];chrome.webview.addEventListener('message',e=>proofMessages.push(e.data));chrome.webview.postMessage({version:1,kind:'ready'})");
                await Until(async () => await core.ExecuteScriptAsync("proofMessages.some(m=>m.kind==='status'&&m.status==='offline')") == "true");
                await core.ExecuteScriptAsync("proofMessages=[];chrome.webview.postMessage({version:1,kind:'request',request:{type:'logout',requestId:'proof'}})");
                await Until(async () => await core.ExecuteScriptAsync("proofMessages.some(m=>m.message?.requestId==='proof')") == "true");
                await core.ExecuteScriptAsync("proofMessages=[];chrome.webview.postMessage({version:1,kind:'request',request:{type:'hello'}});chrome.webview.postMessage({version:1,kind:'ready',credential:'fictional'})");
                await Task.Delay(150);
                if (await core.ExecuteScriptAsync("proofMessages.length===0") != "true") throw new InvalidOperationException();

                stage = "edad";
                await window.Deliver(JsonSerializer.SerializeToElement(new { version = 1, kind = "message", elapsedSeconds = 7, message = new { type = "state", status = "locked" } }), CancellationToken.None);
                await Task.Delay(1100);
                await core.ExecuteScriptAsync("proofMessages=[];chrome.webview.postMessage({version:1,kind:'ready'})");
                await Until(async () => await core.ExecuteScriptAsync("proofMessages.some(m=>m.message?.type==='state'&&m.elapsedSeconds>=8)") == "true");

                stage = "navegacion";
                var rejected = 0;
                core.NavigationStarting += (_, e) => { if (e.Cancel) rejected++; };
                core.Navigate("https://127.0.0.1:9/forbidden");
                await Until(() => Task.FromResult(rejected > 0));
                if (core.Source != HostBoundary.Home) throw new InvalidOperationException();
                var popups = 0;
                core.NewWindowRequested += (_, e) => { if (e.Handled) popups++; };
                await core.ExecuteScriptAsync("window.open('https://shell.pope.invalid/index.html')");
                await Until(() => Task.FromResult(popups > 0));
                stage = "descargas";
                var downloads = 0;
                core.DownloadStarting += (_, e) => { if (e.Cancel && e.Handled) downloads++; };
                var font = Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "shell", "assets"), "*.woff2").First();
                var download = "https://shell.pope.invalid/assets/" + Path.GetFileName(font);
                await core.ExecuteScriptAsync($"var a=document.createElement('a');a.href={JsonSerializer.Serialize(download)};a.download='proof.woff2';document.body.append(a);a.click();a.remove()");
                await Until(() => Task.FromResult(downloads > 0));
                stage = "red";
                // ExecuteScriptAsync no espera promesas: consultar su resultado publicado en la página.
                using var listener = new TcpListener(IPAddress.Loopback, 0);
                listener.Start();
                using var networkDeadline = new CancellationTokenSource(TimeSpan.FromSeconds(1));
                var accepting = listener.AcceptTcpClientAsync(networkDeadline.Token).AsTask();
                var target = $"https://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}/forbidden";
                await core.ExecuteScriptAsync($"window.proofNetwork=false;fetch({JsonSerializer.Serialize(target)}).catch(()=>window.proofNetwork=true)");
                await Until(async () => await core.ExecuteScriptAsync("window.proofNetwork") == "true");
                try { using var unexpected = await accepting; throw new InvalidOperationException(); }
                catch (OperationCanceledException) when (networkDeadline.IsCancellationRequested) { }
                passed = !core.Settings.AreDevToolsEnabled && !core.Settings.AreHostObjectsAllowed
                    && !core.Settings.IsPasswordAutosaveEnabled && !core.Settings.AreBrowserAcceleratorKeysEnabled;
                File.WriteAllText(Path.Combine(directory, "report.json"), JsonSerializer.Serialize(new
                {
                    Passed = passed,
                    OfflineScreen = true,
                    CorrelatedError = true,
                    InvalidMessagesRejected = true,
                    NavigationRejected = rejected,
                    PopupsRejected = popups,
                    DownloadsRejected = downloads,
                    SnapshotAgePreserved = true,
                    DirectNetworkRejected = true,
                    Elevated = DesktopNative.Elevated(),
                    Runtime = core.Environment.BrowserVersionString,
                    Windows = Environment.OSVersion.Version.ToString(),
                    AgentCredentialProvided = false
                }));
            }
            catch (Exception error)
            {
                File.WriteAllText(Path.Combine(directory, "report.json"), JsonSerializer.Serialize(new { Passed = false, Stage = stage, ErrorKind = error.GetType().Name }));
            }
            finally { window.Close(); }
        };
        Application.Run(window); window.WaitForBridge();
        return passed ? 0 : 1;
    }

    private static async Task Until(Func<Task<bool>> condition)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        while (!await condition()) await Task.Delay(100, deadline.Token);
    }
}
