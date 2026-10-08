namespace Pope.DesktopProbe;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args is ["--check-build"]) { Console.WriteLine("Prototipo aislado T09 · REQ-003-33"); return 0; }
        if (args is ["--credential-check"]) return ProbeCredential.Check();
        if (args is ["--token-check"]) return ProbeToken.Check();
        if (args is ["--configure-maintenance", var id]) return ProbeCredential.Configure(id);
        if (args is ["--maintenance-service", var serviceId])
        {
            System.ServiceProcess.ServiceBase.Run(new ProbeBroker(serviceId) { ServiceName = ProbeBroker.Name(serviceId) });
            return 0;
        }
        if (args is ["--maintenance-helper", var helperId]) return ProbeBroker.Helper(helperId);
        if (args is ["--maintenance-denial", var denialId]) return ProbeDenial.Run(denialId);
        if (args is ["--install-maintenance", var installId]) return ProbeInstall.Run(installId);
        if (args is ["--maintenance-window", var windowId, "admin" or "child"])
        {
            ApplicationConfiguration.Initialize();
            Application.Run(new MaintenanceWindow(windowId, args[2]));
            return 0;
        }
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
