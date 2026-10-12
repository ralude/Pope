using Pope.Bridge;

namespace Pope.ShellHost;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args is ["--check-build"])
        {
            Console.WriteLine("Pope.ShellHost: WinForms + WebView2 · REQ-003-62");
            return 0;
        }

        try
        {
            HostBoundary.RequireInteractiveUser();
            RetainedProcess? server = null;
            try
            {
                HostBridge? bridge = null;
                if (args is ["--pipe", var name, "--agent-pid", var value] && int.TryParse(value, out var pid) && pid > 0)
                {
                    PipeEndpoints.ValidateName(name);
                    server = RetainedProcess.ForService(pid);
                    bridge = new HostBridge(name, server);
                }
                else if (args.Length != 0) return 1;
                using (bridge)
                {
                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
                    var profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Pope", "ShellProfile");
                    using var window = new ShellWindow(Path.Combine(AppContext.BaseDirectory, "shell"), profile, bridge);
                    Application.Run(window);
                    window.WaitForBridge();
                    return window.Failed ? 1 : 0;
                }
            }
            finally { server?.Dispose(); }
        }
        catch { Console.Error.WriteLine("No se pudo iniciar el Shell de Pope."); return 1; }
    }
}
