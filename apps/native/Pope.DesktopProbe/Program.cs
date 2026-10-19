namespace Pope.DesktopProbe;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args is ["--check-build"]) { Console.WriteLine("Prototipo aislado T09 · REQ-003-33"); return 0; }
        if (args is ["--credential-check"]) return ProbeCredential.Check();
        if (args is ["--token-check"]) return ProbeToken.Check();
        if (args is ["--process-token-check"]) return ProbeToken.CheckProcess();
        if (args is ["--desktop-attach-proof", var attachDirectory] && Path.IsPathFullyQualified(attachDirectory)) return DesktopAttachProof.Run(attachDirectory);
        if (args is ["--lock-pipe", var lockPipe, "--host-pid", var parentValue, "--proof-profile", var lockProfile]
            && int.TryParse(parentValue, out var parentId) && Path.IsPathFullyQualified(lockProfile)) return Pope.ShellHost.LockHost.Run(lockPipe, parentId, lockProfile);
        if (args is ["--desktop-session-host", var sessionDirectory, var sessionPipe, var sessionParent] && Path.IsPathFullyQualified(sessionDirectory)
            && int.TryParse(sessionParent, out var sessionParentId)) return DesktopSessionProof.Host(sessionDirectory, sessionPipe, sessionParentId);
        if (args is ["--desktop-session-proof", var desktopProof] && Path.IsPathFullyQualified(desktopProof)) return DesktopSessionProof.Run(desktopProof);
        if (args is ["--pause-host", var pauseDirectory, var pausePipe, var pauseParent, var pauseJournal] && Path.IsPathFullyQualified(pauseDirectory)
            && Path.IsPathFullyQualified(pauseJournal) && int.TryParse(pauseParent, out var pauseParentId))
            return PauseProof.Host(pauseDirectory, pausePipe, pauseParentId, pauseJournal);
        if (args is ["--pause-proof", var pauseProof] && Path.IsPathFullyQualified(pauseProof)) return PauseProof.Run(pauseProof);
        if (args is ["--agent-service-probe", var agentId]) return AgentScmProbe.Run(agentId);
        if (args is ["--agent-service-denial", var denialAgentId]) return AgentScmProbe.Denial(denialAgentId);
        if (args is ["--pipe-peer", var pipeName, var serverPid, var pipeMode]) return PipePeer.Run(pipeName, serverPid, pipeMode);
        if (args is ["--shell-host-proof", var hostProofDirectory] && Path.IsPathFullyQualified(hostProofDirectory)) return ShellHostProof.Run(hostProofDirectory);
        if (args is ["--shell-channel-proof", var channelProofDirectory, var channelPipe, var channelParent]
            && Path.IsPathFullyQualified(channelProofDirectory)) return ShellChannelProof.Run(channelProofDirectory, channelPipe, channelParent);
        if (args is ["--session-window", var sessionId, "client" or "admin" or "elevated"])
            return SessionWindow.Run(Guid.ParseExact(sessionId, "N").ToString("N"), args[2]);
        if (args is ["--configure-maintenance", var id]) return ProbeCredential.Configure(id);
        if (args is ["--maintenance-service", var serviceId])
        {
            System.ServiceProcess.ServiceBase.Run(new ProbeBroker(serviceId) { ServiceName = ProbeBroker.Name(serviceId) });
            return 0;
        }
        if (args is ["--maintenance-helper", var helperId]) return ProbeBroker.Helper(helperId);
        if (args is ["--maintenance-cleanup", var cleanupId]) return ProbeBroker.CleanupHelper(cleanupId);
        if (args is ["--maintenance-denial", var denialId]) return ProbeDenial.Run(denialId);
        if (args is ["--install-maintenance", var installId]) return ProbeInstall.Run(installId);
        if (args is ["--maintenance-on-vm", var runId]) return MaintenanceRunner.Run(Guid.ParseExact(runId, "N").ToString("N"));
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
