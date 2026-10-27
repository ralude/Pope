using System.Security.Cryptography;
using System.Text.Json;
using System.Net;
using System.Net.Sockets;
using Microsoft.Web.WebView2.Core;
using Pope.ShellHost;

namespace Pope.DesktopProbe;

// T19: usa la ventana de producto en el escritorio actual, sin instalar ni modificar Windows.
internal static class ShellHostProof
{
    // WebP sin pérdida de 1×1 píxel, para la etapa «fondo».
    private static readonly byte[] BackgroundImage = Convert.FromBase64String("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==");

    // El aviso del agente al Shell: solo metadatos; `null` es «sin imagen» (el fondo de Pope).
    private static JsonElement Background(int revision, string? sha256, int? size = null, int width = 1, int height = 1) => JsonSerializer.SerializeToElement(new
    {
        version = 1,
        kind = "message",
        elapsedSeconds = 0,
        message = new
        {
            type = "lockBackground",
            revision,
            background = sha256 is null ? null : new { sha256, size = size ?? BackgroundImage.Length, mimeType = "image/webp", width, height }
        }
    });

    // Prueba visual con una imagen real (la que prepara el panel): abre la ventana real del Shell, entrega el aviso con
    // los metadatos del archivo y la deja a la vista `seconds` segundos. No toca %ProgramData% ni modifica Windows.
    internal static int View(string directory, string imagePath, int width, int height, int seconds)
    {
        HostBoundary.RequireInteractiveUser();
        if (Directory.Exists(directory) || !File.Exists(imagePath)) return 1;
        var bytes = File.ReadAllBytes(imagePath);
        var sha256 = Convert.ToHexStringLower(SHA256.HashData(bytes));
        var backgrounds = Path.Combine(directory, "background");
        Directory.CreateDirectory(backgrounds);
        File.WriteAllBytes(Path.Combine(backgrounds, sha256 + ".webp"), bytes);
        ApplicationConfiguration.Initialize();
        using var window = new ShellWindow(Path.Combine(AppContext.BaseDirectory, "shell"), Path.Combine(directory, "profile"), fullscreen: false, backgroundDirectory: backgrounds);
        var passed = false;
        window.Shown += async (_, _) =>
        {
            try
            {
                var core = await window.Initialized.Task.WaitAsync(TimeSpan.FromSeconds(20));
                await Until(async () => await core.ExecuteScriptAsync("document.getElementById('root').children.length > 0") == "true");
                // Si llega antes de que la página avise `ready`, el host lo recuerda y se lo repite.
                await window.Deliver(Background(1, sha256, bytes.Length, width, height), CancellationToken.None);
                await Until(async () => await core.ExecuteScriptAsync($"(()=>{{const i=document.querySelector('.wp-photo');return !!i&&i.src==='https://background.pope.invalid/{sha256}.webp'&&i.complete&&i.naturalWidth>0}})()") == "true");
                await Task.Delay(500);
                using (var picture = File.Create(Path.Combine(directory, "background-real.png")))
                    await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, picture);
                await Task.Delay(TimeSpan.FromSeconds(seconds));
                passed = true;
            }
            catch (Exception error)
            {
                File.WriteAllText(Path.Combine(directory, "error.txt"), error.GetType().Name);
            }
            finally { window.Close(); }
        };
        Application.Run(window); window.WaitForBridge();
        return passed ? 0 : 1;
    }

    internal static int Run(string directory)
    {
        HostBoundary.RequireInteractiveUser();
        if (Directory.Exists(directory)) return 1;
        Directory.CreateDirectory(directory);
        // REQ-003-73: una carpeta de fondos propia de la sonda, con una imagen; no toca %ProgramData%.
        var backgrounds = Path.Combine(directory, "background");
        var backgroundHash = new string('a', 64);
        Directory.CreateDirectory(backgrounds);
        File.WriteAllBytes(Path.Combine(backgrounds, backgroundHash + ".webp"), BackgroundImage);
        ApplicationConfiguration.Initialize();
        using var window = new ShellWindow(Path.Combine(AppContext.BaseDirectory, "shell"), Path.Combine(directory, "profile"), fullscreen: false, backgroundDirectory: backgrounds);
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

                stage = "fondo";
                // El agente avisa al host; al recargar o enviar `ready`, el host repite el último fondo tal cual.
                await window.Deliver(Background(1, backgroundHash), CancellationToken.None);
                await core.ExecuteScriptAsync("proofMessages=[];chrome.webview.postMessage({version:1,kind:'ready'})");
                await Until(async () => await core.ExecuteScriptAsync("proofMessages.some(m=>m.message?.type==='lockBackground'&&m.message.revision===1&&m.elapsedSeconds===0)") == "true");
                // El Shell pinta la imagen en la pantalla de bloqueo, ya cargada, desde el host de fondos.
                string PhotoLoaded(string hash) => $"(()=>{{const i=document.querySelector('.wp-photo');return !!i&&i.src==='https://background.pope.invalid/{hash}.webp'&&i.complete&&i.naturalWidth===1}})()";
                await Until(async () => await core.ExecuteScriptAsync(PhotoLoaded(backgroundHash)) == "true");
                using (var picture = File.Create(Path.Combine(directory, "background.png")))
                    await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, picture);
                // Una imagen que no carga (revisión 2, archivo que no existe) no deja nada roto: vuelve el fondo de Pope.
                await window.Deliver(Background(2, new string('b', 64)), CancellationToken.None);
                await Until(async () => await core.ExecuteScriptAsync("document.querySelector('.wp-photo')===null&&document.querySelector('.wp-shapes')!==null") == "true");
                // Sin imagen (valor inicial o fondo quitado) tampoco hay <img>; y una imagen buena vuelve a pintarse.
                await window.Deliver(Background(3, null), CancellationToken.None);
                await Until(async () => await core.ExecuteScriptAsync("document.querySelector('.wp-photo')===null&&document.querySelector('.wp-shapes')!==null") == "true");
                await window.Deliver(Background(4, backgroundHash), CancellationToken.None);
                await Until(async () => await core.ExecuteScriptAsync(PhotoLoaded(backgroundHash)) == "true");
                // La imagen sale del host de fondos (solo lectura); la que no existe falla limpio (-1).
                await core.ExecuteScriptAsync(("window.proofImages=null;(async()=>{const w=u=>new Promise(d=>{const i=new Image();i.onload=()=>d(i.naturalWidth);i.onerror=()=>d(-1);setTimeout(()=>d(-2),3000);i.src=u});"
                    + "window.proofImages={shown:await w('https://background.pope.invalid/HASH.webp'),missing:await w('https://background.pope.invalid/MISSING.webp')}})()")
                    .Replace("HASH", backgroundHash).Replace("MISSING", new string('b', 64)));
                await Until(async () => await core.ExecuteScriptAsync("window.proofImages!==null") == "true");
                if (await core.ExecuteScriptAsync("window.proofImages.shown===1&&window.proofImages.missing===-1") != "true")
                {
                    File.WriteAllText(Path.Combine(directory, "images.json"), await core.ExecuteScriptAsync("JSON.stringify(window.proofImages)"));
                    throw new InvalidOperationException();
                }

                stage = "navegacion";
                var rejected = 0;
                core.NavigationStarting += (_, e) => { if (e.Cancel) rejected++; };
                core.Navigate("https://127.0.0.1:9/forbidden");
                await Until(() => Task.FromResult(rejected > 0));
                if (core.Source != HostBoundary.Home) throw new InvalidOperationException();
                // Al host de fondos solo se le piden imágenes: navegar a él se cancela como a cualquier otro origen.
                var beforeBackground = rejected;
                core.Navigate($"https://{HostBoundary.BackgroundHost}/{backgroundHash}.webp");
                await Until(() => Task.FromResult(rejected > beforeBackground));
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
                    BackgroundReplayedOnReady = true,
                    BackgroundImageShown = true,
                    ShellPaintsBackground = true,
                    ShellFallsBackToDefault = true,
                    BackgroundMissingFailsCleanly = true,
                    BackgroundHostNotNavigable = true,
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
