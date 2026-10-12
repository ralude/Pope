using System.ComponentModel;
using System.Text.Json;
using Pope.ShellHost;

namespace Pope.DesktopProbe;

// T21: aislar la viabilidad de STA/SetThreadDesktop antes de integrar el producto.
internal static class DesktopAttachProof
{
    internal static int Run(string directory)
    {
        HostBoundary.RequireInteractiveUser();
        if (Directory.Exists(directory)) return 1;
        Directory.CreateDirectory(directory);
        using var desktop = NativeDesktop.Create("PopeLock" + Guid.NewGuid().ToString("N"));
        var results = new List<object>();
        var passed = true;
        foreach (var apartment in new[] { ApartmentState.STA, ApartmentState.MTA })
        {
            Exception? error = null;
            var stage = "attach";
            int? initializationHResult = null;
            var thread = new Thread(() =>
            {
                try
                {
                    desktop.AttachFreshThread(); using var attached = NativeDesktop.Current();
                    if (attached.Name != desktop.Name) throw new InvalidOperationException();
                    if (apartment == ApartmentState.STA)
                    {
                        stage = "window";
                        ApplicationConfiguration.Initialize();
                        using var hook = new KeyboardGuard(() => (true, false), install: true);
                        using var window = new ShellWindow(Path.Combine(AppContext.BaseDirectory, "shell"), Path.Combine(directory, "profile"));
                        window.Shown += async (_, _) =>
                        {
                            try
                            {
                                stage = "webview";
                                var core = await window.Initialized.Task.WaitAsync(TimeSpan.FromSeconds(20));
                                stage = "react";
                                await Task.Delay(1000);
                                if (await core.ExecuteScriptAsync("document.body.innerText.includes('Sin conexión con el servidor')") != "true") throw new InvalidOperationException();
                            }
                            catch (Exception exception) { error = exception; initializationHResult = window.InitializationHResult; }
                            finally { window.Close(); }
                        };
                        Application.Run(window); window.WaitForBridge();
                    }
                }
                catch (Exception exception) { error = exception; }
            });
            thread.SetApartmentState(apartment); thread.Start();
            if (!thread.Join(30_000)) return 1;
            // Diagnóstico: STA puede adjuntarse, pero WebView2 depende del escritorio de nacimiento.
            results.Add(new { Apartment = apartment.ToString(), Passed = error is null, Stage = stage, ErrorKind = error?.GetType().Name, WindowsError = (error as Win32Exception)?.NativeErrorCode, InitializationHResult = initializationHResult });
        }
        using var child = desktop.Start(Environment.ProcessPath!, "--shell-host-proof", Path.Combine(directory, "child"));
        try
        {
            if (!child.WaitForExit(30_000)) throw new TimeoutException();
            using var report = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "child", "report.json")));
            passed = child.ExitCode == 0 && report.RootElement.GetProperty("Passed").GetBoolean();
        }
        finally { if (!child.HasExited) { child.Kill(true); child.WaitForExit(); } }
        File.WriteAllText(Path.Combine(directory, "report.json"), JsonSerializer.Serialize(new { Passed = passed, Windows = Environment.OSVersion.Version.ToString(), Results = results, ChildWebViewPassed = passed, InputDesktopChanged = false }));
        return passed ? 0 : 1;
    }
}
