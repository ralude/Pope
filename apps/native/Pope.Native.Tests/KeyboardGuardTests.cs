using Pope.ShellHost;
using Xunit;

namespace Pope.Native.Tests;

public sealed class KeyboardGuardTests
{
    [Fact(DisplayName = "REQ-003-30: restricciones por foco; ADR-0023 permite Alt+Tab con sesión incluso en pausa")]
    public void FiltersBySessionAndFocus()
    {
        foreach (var blocked in new[] { false, true })
            foreach (var focused in new[] { false, true })
            {
                Assert.True(KeyboardGuard.Suppress(9, true, false, blocked, false, focused));
                Assert.False(KeyboardGuard.Suppress(9, true, false, blocked, true, focused));
                foreach (var (key, alt, control) in new[] { (0x5b, false, false), (0x5c, false, false), (0x1b, false, true), (0x73, true, false) })
                    Assert.Equal(blocked || focused, KeyboardGuard.Suppress(key, alt, control, blocked, true, focused));
                Assert.False(KeyboardGuard.Suppress(0x41, false, false, blocked, true, focused));
                Assert.False(KeyboardGuard.Suppress(0x1b, false, false, blocked, true, focused));
            }
    }

    [Fact(DisplayName = "REQ-003-33: escritorio real acotado por logon y handles liberados sin cambiar la entrada")]
    public void CreatesAndReleasesWithoutActivating()
    {
        using var original = NativeDesktop.Current();
        var name = "PopeLock" + Guid.NewGuid().ToString("N");
        using var desktop = NativeDesktop.Create(name);
        Assert.Equal(name, desktop.Name);
        using var unchanged = NativeDesktop.Current(); Assert.Equal(original.Name, unchanged.Name);
        Assert.Throws<ArgumentException>(() => NativeDesktop.Create("Default"));
        desktop.Dispose(); Assert.Throws<ObjectDisposedException>(desktop.AttachFreshThread);
    }

    [Fact(DisplayName = "REQ-003-33: host nacido en escritorio separado carga React sin activar entrada")]
    public async Task FreshStaOutsideTestHost()
    {
        var directory = Path.Combine(Path.GetTempPath(), "pope-desktop-attach-" + Guid.NewGuid().ToString("N"));
        var executable = Path.GetFullPath("../../../../../Pope.DesktopProbe/bin/Release/net10.0-windows/win-x64/Pope.DesktopProbe.exe", AppContext.BaseDirectory);
        var info = new System.Diagnostics.ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true };
        info.ArgumentList.Add("--desktop-attach-proof"); info.ArgumentList.Add(directory);
        using var process = System.Diagnostics.Process.Start(info)!;
        try
        {
            await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(60));
            var report = File.ReadAllText(Path.Combine(directory, "report.json"));
            using var parsed = System.Text.Json.JsonDocument.Parse(report);
            Assert.True(parsed.RootElement.GetProperty("Passed").GetBoolean(), report);
            Assert.Equal(0, process.ExitCode);
        }
        finally
        {
            if (!process.HasExited) { process.Kill(true); await process.WaitForExitAsync(); }
            for (var attempt = 0; attempt < 30 && Directory.Exists(directory); attempt++)
            { try { Directory.Delete(directory, true); } catch (IOException) { await Task.Delay(100); } }
        }
    }
}
