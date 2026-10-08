namespace Pope.DesktopProbe;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args is ["--check-build"]) { Console.WriteLine("Prototipo aislado T09 · REQ-003-33"); return 0; }
        if (args is ["--run-on-vm", var output] && Path.IsPathFullyQualified(output)) return ProbeRun.Run(output);
        if (args is ["--game-on-vm", var gameOutput, var game] && Path.IsPathFullyQualified(gameOutput) && Path.IsPathFullyQualified(game))
            return ProbeRun.Run(gameOutput, game);
        if (args is ["--restore", var name, var recoveryDirectory]) return ProbeRun.Restore(name, recoveryDirectory);
        if (args is ["--window", "use" or "lock" or "app", var directory] && Path.IsPathFullyQualified(directory))
        {
            Directory.CreateDirectory(directory);
            ApplicationConfiguration.Initialize();
            Application.ThreadException += (_, error) =>
            {
                File.WriteAllText(Path.Combine(directory, args[1] + "-error.txt"), error.Exception.ToString());
                // No abrir un diálogo que cambie el foco y falsee la prueba de entrada.
                Application.ExitThread();
            };
            Application.Run(new ProbeWindow(args[1], directory));
            return 0;
        }
        Console.Error.WriteLine("Prototipo T09: usa --run-on-vm <carpeta nueva>; no es un Shell de producción.");
        return 1;
    }
}
