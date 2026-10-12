using System.Diagnostics;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Pope.Bridge;
using Pope.ShellHost;

namespace Pope.DesktopProbe;

// Solo fixture: el broker de pruebas es el padre ordinario. El EXE de producto exige SYSTEM/sesión 0.
internal static class ShellChannelProof
{
    internal static int Run(string directory, string pipe, string parent)
    {
        HostBoundary.RequireInteractiveUser(); PipeEndpoints.ValidateName(pipe);
        if (Directory.Exists(directory) || !int.TryParse(parent, out var pid)) return 1;
        Directory.CreateDirectory(directory);
        using var parentProcess = Process.GetProcessById(pid);
        using var retained = new RetainedProcess(parentProcess);
        using var bridge = new HostBridge(pipe, retained);
        ApplicationConfiguration.Initialize();
        using var window = new ShellWindow(Path.Combine(AppContext.BaseDirectory, "shell"), Path.Combine(directory, "profile"), bridge, fullscreen: false);
        var passed = false;
        window.Shown += async (_, _) =>
        {
            var stage = "inicio";
            try
            {
                var core = await window.Initialized.Task.WaitAsync(TimeSpan.FromSeconds(20));
                stage = "login";
                await Until(core, "document.getElementById('usuario') && !document.getElementById('usuario').disabled");
                await core.ExecuteScriptAsync("window.proofStatuses=[];chrome.webview.addEventListener('message',e=>{if(e.data.kind==='status')proofStatuses.push(e.data.status)});");
                await Credentials(core);
                await core.ExecuteScriptAsync("document.querySelector('form').requestSubmit()");
                await Until(core, "document.querySelector('[role=alert]')?.innerText.includes('Prueba correlacionada')");
                if (await core.ExecuteScriptAsync("document.body.innerText.includes('Respuesta ajena')") != "false") throw new InvalidOperationException();
                await Credentials(core);
                await core.ExecuteScriptAsync("document.querySelector('form').requestSubmit()");
                stage = "sesion";
                await Until(core, "document.body.innerText.includes('Cliente del ensayo') && document.body.innerText.includes('PC de prueba · En uso')");
                File.WriteAllText(Path.Combine(directory, "active"), "ready");
                stage = "offline";
                await Until(core, "proofStatuses.includes('offline') && document.body.innerText.includes('Sin conexión')");
                File.WriteAllText(Path.Combine(directory, "offline"), "ready");
                stage = "reconexion";
                await Until(core, "proofStatuses.at(-1)==='online' && document.body.innerText.includes('Cliente del ensayo')");
                using (var picture = File.Create(Path.Combine(directory, "session.png")))
                    await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, picture);
                passed = true;
                File.WriteAllText(Path.Combine(directory, "report.json"), JsonSerializer.Serialize(new { Passed = true, RealReactLogin = true, WrongCorrelationIgnored = true, PipeReconnected = true, Elevated = DesktopNative.Elevated(), AgentCredentialProvided = false }));
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

    private static Task<string> Credentials(CoreWebView2 core) => core.ExecuteScriptAsync("for(const [id,value] of [['usuario','ana'],['clave','ficticia-de-ensayo']]){const input=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}");
    private static async Task Until(CoreWebView2 core, string condition)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        while (await core.ExecuteScriptAsync($"Boolean({condition})") != "true") await Task.Delay(100, deadline.Token);
    }
}
