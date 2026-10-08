namespace Pope.DesktopProbe;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args is ["--check-build"]) { Console.WriteLine("Prototipo aislado T09 · REQ-003-33"); return 0; }
        if (args is ["--window", "use" or "lock" or "app", var directory] && Path.IsPathFullyQualified(directory))
        {
            Directory.CreateDirectory(directory);
            ApplicationConfiguration.Initialize();
            Application.Run(new ProbeWindow(args[1], directory));
            return 0;
        }
        Console.Error.WriteLine("Prototipo T09: coordinación pendiente; no es un Shell de producción.");
        return 1;
    }
}
