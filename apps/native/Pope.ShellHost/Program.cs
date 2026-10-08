using Microsoft.Web.WebView2.WinForms;

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

        // T09 prueba el escritorio; T19 inicializa la interfaz local y sus permisos.
        Console.Error.WriteLine("Host aún no implementado (T09/T19).");
        return 1;
    }
}

internal sealed class ShellWindow : Form
{
    public ShellWindow()
    {
        Text = "Pope";
        Controls.Add(new WebView2 { Dock = DockStyle.Fill });
    }
}
