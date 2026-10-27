using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Pope.DesktopProbe;

// Historia 1 del fondo: prueba acotada del diseño de cómo llega la imagen al Shell.
//  A) ¿Se lanza WebResourceRequested para un host con SetVirtualHostNameToFolderMapping? (No.)
//  B) ¿Funciona un manejador para un host sin mapear? (Control: sí.)
//  C) ¿Sirve un segundo host mapeado a una carpeta aparte una imagen al <img> de la página del
//     Shell, y falla limpio si el archivo no existe? Es lo que usa el host de producto.
//  D) ¿Se puede mapear una carpeta que aún no existe? (No: lanza DirectoryNotFoundException.)
// Solo un WebView2 con carpetas temporales: no usa la ventana del Shell ni modifica Windows.
internal static class LockBackgroundProof
{
    private const string ShellHost = "shell.pope.invalid", BackgroundHost = "background.pope.invalid", HandlerHost = "handler.pope.invalid", LateHost = "late.pope.invalid";
    private static readonly string Served = new('a', 64), Missing = new('b', 64);
    // WebP sin pérdida de 1×1 píxel.
    private static readonly byte[] Image = Convert.FromBase64String("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==");

    internal static int Run(string directory)
    {
        if (Directory.Exists(directory)) return 1;
        var assets = Path.Combine(directory, "assets");
        var backgrounds = Path.Combine(directory, "background");
        Directory.CreateDirectory(assets);
        Directory.CreateDirectory(backgrounds);
        File.WriteAllText(Path.Combine(assets, "index.html"), "<!doctype html><title>spike</title>");
        File.WriteAllBytes(Path.Combine(backgrounds, Served + ".webp"), Image);
        ApplicationConfiguration.Initialize();
        var passed = false;
        using var form = new Form { Text = "Spike fondo", Size = new Size(640, 400), StartPosition = FormStartPosition.CenterScreen };
        using var view = new WebView2 { Dock = DockStyle.Fill };
        form.Controls.Add(view);
        form.Shown += async (_, _) =>
        {
            var stage = "inicio";
            try
            {
                var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: Path.Combine(directory, "profile"));
                await view.EnsureCoreWebView2Async(environment);
                var core = view.CoreWebView2;
                var seen = new List<string>();
                core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
                core.WebResourceRequested += (_, e) =>
                {
                    var uri = new Uri(e.Request.Uri);
                    seen.Add(uri.Host);
                    if (uri.Host == HandlerHost)
                        e.Response = environment.CreateWebResourceResponse(new MemoryStream(Image), 200, "OK", "Content-Type: image/webp");
                };
                core.SetVirtualHostNameToFolderMapping(ShellHost, assets, CoreWebView2HostResourceAccessKind.DenyCors);
                core.SetVirtualHostNameToFolderMapping(BackgroundHost, backgrounds, CoreWebView2HostResourceAccessKind.DenyCors);
                // D) Mapear una carpeta que no existe lanza: el host solo puede mapear la de fondos si ya existe.
                var missingFolderThrows = false;
                try { core.SetVirtualHostNameToFolderMapping(LateHost, Path.Combine(directory, "late"), CoreWebView2HostResourceAccessKind.DenyCors); }
                catch (DirectoryNotFoundException) { missingFolderThrows = true; }
                stage = "navegacion";
                var loaded = new TaskCompletionSource();
                core.NavigationCompleted += (_, _) => loaded.TrySetResult();
                core.Navigate($"https://{ShellHost}/index.html");
                await loaded.Task.WaitAsync(TimeSpan.FromSeconds(20));

                stage = "peticiones";
                // ExecuteScriptAsync no espera promesas: el resultado se publica en la página y se consulta.
                await core.ExecuteScriptAsync($$$"""
                    window.proof=null;
                    (async()=>{
                      // Ancho natural de la imagen; -1 si falla, -2 si no responde en 3 s.
                      const width=url=>new Promise(done=>{const i=new Image();i.onload=()=>done(i.naturalWidth);i.onerror=()=>done(-1);
                        setTimeout(()=>done(-2),3000);i.src=url});
                      window.proof={
                        handlerHost:await width('https://{{{HandlerHost}}}/x.webp'),
                        backgroundHost:await width('https://{{{BackgroundHost}}}/{{{Served}}}.webp'),
                        backgroundMissing:await width('https://{{{BackgroundHost}}}/{{{Missing}}}.webp')};
                    })()
                    """);
                using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
                string json;
                while ((json = await core.ExecuteScriptAsync("JSON.stringify(window.proof)")) == "\"null\"") await Task.Delay(100, deadline.Token);
                using var result = JsonDocument.Parse(JsonSerializer.Deserialize<string>(json)!);
                var root = result.RootElement;
                passed = root.GetProperty("backgroundHost").GetInt32() == 1 && root.GetProperty("backgroundMissing").GetInt32() == -1
                    && root.GetProperty("handlerHost").GetInt32() == 1 && missingFolderThrows;
                File.WriteAllText(Path.Combine(directory, "report.json"), JsonSerializer.Serialize(new
                {
                    Passed = passed,
                    Result = root.Clone(),
                    // A): hosts de los que el manejador llegó a ver peticiones.
                    HandlerSawHosts = seen.Distinct().Order().ToArray(),
                    MappingMissingFolderThrows = missingFolderThrows,
                    Runtime = core.Environment.BrowserVersionString,
                    Windows = Environment.OSVersion.Version.ToString()
                }));
            }
            catch (Exception error)
            {
                File.WriteAllText(Path.Combine(directory, "report.json"), JsonSerializer.Serialize(new { Passed = false, Stage = stage, ErrorKind = error.GetType().Name }));
            }
            finally { form.Close(); }
        };
        Application.Run(form);
        return passed ? 0 : 1;
    }
}
