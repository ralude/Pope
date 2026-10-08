using System.ComponentModel;
using System.Diagnostics;
using System.Drawing.Imaging;
using System.Security.Principal;
using System.Text.Json;

namespace Pope.DesktopProbe;

internal static class ProbeRun
{
    internal static int Run(string directory, string? game = null)
    {
        Directory.CreateDirectory(directory);
        if (Directory.EnumerateFileSystemEntries(directory).Any()) throw new ArgumentException("Usa una carpeta de resultados nueva");
        if (!Environment.UserInteractive || Process.GetCurrentProcess().SessionId == 0 || DesktopNative.Elevated())
            throw new InvalidOperationException("La prueba exige sesión interactiva sin elevación");
        var original = DesktopNative.OpenInputDesktop(0, false, 0x20100);
        if (original == 0) throw new Win32Exception();
        nint use = 0, locked = 0;
        var children = new List<Process>();
        var report = new Dictionary<string, object?> { ["Utc"] = DateTime.UtcNow, ["Original"] = DesktopNative.Name(original) };
        Process? recovery = null;
        try
        {
            recovery = DesktopNative.Start(DesktopNative.Name(original), "--restore", DesktopNative.Name(original), directory);
            var suffix = Guid.NewGuid().ToString("N");
            var useName = "PopeUse" + suffix;
            var lockName = "PopeLock" + suffix;
            use = DesktopNative.Create(useName);
            locked = DesktopNative.Create(lockName);
            report["UseAcl"] = VerifyAcl(use);
            report["LockAcl"] = VerifyAcl(locked);
            foreach (var role in new[] { "use", "lock", "app" })
                children.Add(DesktopNative.Start(role == "lock" ? lockName : useName, "--window", role, directory));
            WaitReady(directory, children);
            Require(!DesktopNative.HasExplorer(use) && !DesktopNative.HasExplorer(locked), "Explorer tiene ventanas en un escritorio de prueba");
            report["NoExplorerOnTestDesktops"] = true;
            Switch(use);
            Thread.Sleep(1000);
            var before = Read(directory, "app");
            ProbeInput.On(use, () => { ProbeInput.Focus((nint)before.GetProperty("Window").GetInt64()); report["PressUse"] = ProbeInput.Press(); });
            Thread.Sleep(700);
            var received = Read(directory, "app");
            Capture(use, directory, "use");
            Require(received.GetProperty("Keys").GetInt32() > before.GetProperty("Keys").GetInt32(), "La app debe recibir teclas en uso");
            Require(received.GetProperty("Clicks").GetInt32() > before.GetProperty("Clicks").GetInt32(), "La app debe recibir clics en uso");
            report["InputInUse"] = true;
            ProbeInput.On(use, () =>
            {
                ProbeInput.AltTab();
                report["AltTabToPopePid"] = ProbeInput.ForegroundPid();
                ProbeInput.AltTab();
                report["AltTabToAppPid"] = ProbeInput.ForegroundPid();
            });
            report["AltTabWithoutExplorer"] = (uint)report["AltTabToPopePid"]! == children[0].Id && (uint)report["AltTabToAppPid"]! == children[2].Id;
            Switch(locked);
            Thread.Sleep(700);
            var paused = Read(directory, "app");
            ProbeInput.On(locked, () =>
            {
                ProbeInput.Focus((nint)Read(directory, "lock").GetProperty("Window").GetInt64());
                report["PressLock"] = ProbeInput.Press();
                ProbeInput.AltTab();
                report["LockedForegroundPid"] = ProbeInput.ForegroundPid();
            });
            Thread.Sleep(1000);
            var after = Read(directory, "app");
            var lockReceiver = Read(directory, "lock");
            Require(lockReceiver.GetProperty("Keys").GetInt32() > 0 && lockReceiver.GetProperty("Clicks").GetInt32() > 0,
                "La ventana de bloqueo no recibió la entrada de prueba");
            report["InputReceivedOnLock"] = true;
            Require(after.GetProperty("Keys").GetInt32() == paused.GetProperty("Keys").GetInt32(), "Una tecla llegó a la app durante bloqueo");
            Require(after.GetProperty("Clicks").GetInt32() == paused.GetProperty("Clicks").GetInt32(), "Un clic llegó a la app durante bloqueo");
            Require(after.GetProperty("HeartbeatMs").GetInt64() > paused.GetProperty("HeartbeatMs").GetInt64(), "La app dejó de ejecutarse");
            Require((uint)report["LockedForegroundPid"]! != children[2].Id, "Alt+Tab alcanzó la app del otro escritorio");
            report["InputIsolated"] = true;
            Capture(locked, directory, "lock");
            Switch(use);
            ProbeInput.On(use, () => { ProbeInput.Focus((nint)received.GetProperty("Window").GetInt64()); ProbeInput.Press(); });
            Thread.Sleep(700);
            var resumed = Read(directory, "app");
            Require(resumed.GetProperty("Keys").GetInt32() > after.GetProperty("Keys").GetInt32(), "La app no recuperó la entrada");
            Require(children.All(child => !child.HasExited), "Un proceso de prueba terminó durante la transición");
            foreach (var role in new[] { "use", "lock", "app" })
            {
                var state = Read(directory, role);
                Require(state.GetProperty("Desktop").GetString() == state.GetProperty("CurrentDesktop").GetString(), "Se trasladó una ventana entre escritorios");
                Require(!state.GetProperty("Elevated").GetBoolean(), "Una ventana está elevada");
                report[role] = state;
            }
            report["AppsPreserved"] = true;
            Require((bool)report["AltTabWithoutExplorer"]!, "Alt+Tab no alterna entre Pope y app sin Explorer");
            if (game != null) GameProbe.Run(use, locked, directory, game, children, report);
            report["Passed"] = true;
        }
        catch (Exception error) { report["Passed"] = false; report["Error"] = error.ToString(); }
        finally
        {
            report["Restored"] = DesktopNative.SwitchDesktop(original);
            File.WriteAllText(Path.Combine(directory, "stop"), "T09 terminada");
            foreach (var child in children)
            {
                if (!child.WaitForExit(5000)) child.Kill(entireProcessTree: true);
                child.WaitForExit(); child.Dispose();
            }
            if (recovery != null) { recovery.WaitForExit(5000); recovery.Dispose(); }
            if (locked != 0) DesktopNative.CloseDesktop(locked);
            if (use != 0) DesktopNative.CloseDesktop(use);
            DesktopNative.CloseDesktop(original);
            File.WriteAllText(Path.Combine(directory, "report.json"), JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
        }
        return report.TryGetValue("Passed", out var passed) && passed is true && report["Restored"] is true ? 0 : 1;
    }

    internal static int Restore(string name, string directory)
    {
        var desktop = DesktopNative.OpenDesktop(name, 0, false, 0x100);
        if (desktop == 0) return 1;
        try
        {
            var time = Stopwatch.StartNew();
            while (time.Elapsed < TimeSpan.FromSeconds(120) && !File.Exists(Path.Combine(directory, "stop"))) Thread.Sleep(250);
            return DesktopNative.SwitchDesktop(desktop) ? 0 : 1;
        }
        finally { DesktopNative.CloseDesktop(desktop); }
    }

    private static string VerifyAcl(nint desktop)
    {
        var sddl = DesktopNative.Acl(desktop);
        using var identity = WindowsIdentity.GetCurrent();
        Require(sddl.Contains(identity.User!.Value) && sddl.Contains(";;;SY)"), "Faltan usuario/SYSTEM en la DACL");
        Require(!sddl.Contains(";;;WD)") && !sddl.Contains(";;;AU)") && !sddl.Contains(";;;BU)"), "DACL demasiado amplia");
        return sddl;
    }

    private static void WaitReady(string directory, List<Process> children)
    {
        var time = Stopwatch.StartNew();
        while (time.Elapsed < TimeSpan.FromSeconds(40))
        {
            Require(children.All(child => !child.HasExited), "Un proceso terminó antes de estar listo");
            var ready = true;
            foreach (var role in new[] { "use", "lock", "app" })
            {
                if (!File.Exists(Path.Combine(directory, role + ".jsonl"))) { ready = false; continue; }
                var state = Read(directory, role);
                Require(state.GetProperty("Error").ValueKind == JsonValueKind.Null, state.GetProperty("Error").ToString());
                ready &= state.GetProperty("Ready").GetBoolean();
            }
            if (ready) return;
            Thread.Sleep(200);
        }
        throw new TimeoutException("WebView2 no estuvo listo en 40 s");
    }

    internal static JsonElement Read(string directory, string role)
    {
        // Solo lee registros terminados: el escritor puede estar añadiendo el siguiente.
        for (var attempt = 0; attempt < 10; attempt++)
        {
            using var file = new FileStream(Path.Combine(directory, role + ".jsonl"), FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var reader = new StreamReader(file);
            var text = reader.ReadToEnd();
            var end = text.LastIndexOf('\n');
            if (end >= 0)
            {
                var start = text.LastIndexOf('\n', Math.Max(0, end - 1));
                return JsonSerializer.Deserialize<JsonElement>(text[(start + 1)..end]);
            }
            Thread.Sleep(25);
        }
        throw new IOException("No hay un registro completo de la ventana de prueba");
    }
    internal static void Switch(nint desktop) { if (!DesktopNative.SwitchDesktop(desktop)) throw new Win32Exception(); }
    internal static void Require(bool condition, string error) { if (!condition) throw new InvalidOperationException(error); }
    internal static void Capture(nint desktop, string directory, string role) => ProbeInput.On(desktop, () =>
    {
        var size = DesktopNative.Resolution();
        using var bitmap = new Bitmap(size.Width, size.Height);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.CopyFromScreen(Point.Empty, Point.Empty, size);
        bitmap.Save(Path.Combine(directory, role + "-desktop.png"), ImageFormat.Png);
    });
}
