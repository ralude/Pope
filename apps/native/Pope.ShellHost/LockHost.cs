using System.Diagnostics;
using Pope.Bridge;

namespace Pope.ShellHost;

internal static class LockHost
{
    internal static int Run(string name, int parentId, string? proofProfile = null)
    {
        HostBoundary.RequireInteractiveUser(); PipeEndpoints.ValidateName(name);
        using var parent = Process.GetProcessById(parentId);
        // El hijo solo habla con la instancia del mismo binario que lo lanzó en su logon.
        if (!string.Equals(parent.MainModule?.FileName, Environment.ProcessPath, StringComparison.OrdinalIgnoreCase)) return 1;
        using var expected = new RetainedProcess(parent);
        using var self = new RetainedProcess(Process.GetCurrentProcess());
        if (expected.Session != self.Session || expected.LogonSid != self.LogonSid) return 1;
        using var bridge = new HostBridge(name, expected, desktopPeer: true);
        var authorization = new DesktopAuthorization();
        using var hook = new KeyboardGuard(() => (true, authorization.HasSession), install: true);
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        var profile = proofProfile ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Pope", "LockProfile");
        using var window = new ShellWindow(Path.Combine(AppContext.BaseDirectory, "shell"), profile, bridge);
        var ready = false;
        window.ReadyReceived = () =>
        {
            ready = true; bridge.SendReady();
            if (proofProfile != null) File.WriteAllText(Path.Combine(proofProfile, "ready.json"), System.Text.Json.JsonSerializer.Serialize(new { Pid = Environment.ProcessId, Window = window.Handle.ToInt64() }));
        };
        window.NativeDelivery = async (envelope, token) =>
        {
            // T32: en el escritorio de bloqueo el mensaje lo muestra y lo confirma este hijo.
            if (envelope.GetProperty("kind").GetString() == "staffMessage")
            {
                if (await window.ShowStaffMessage(envelope.GetProperty("text").GetString()!, token))
                    bridge.Send(System.Text.Json.JsonSerializer.SerializeToElement(new { type = "staffMessageShown", commandId = envelope.GetProperty("commandId").GetString() }));
                return;
            }
            authorization.Apply(envelope); if (ready) bridge.SendReady();
        };
        Application.Run(window); window.WaitForBridge();
        return window.Failed ? 1 : 0;
    }
}
