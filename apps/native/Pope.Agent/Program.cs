using System.ServiceProcess;
using System.Diagnostics;
using System.Security.Principal;

namespace Pope.Agent;

internal static class Program
{
    private static int Main(string[] args)
    {
        if (args is ["--check-build"])
        {
            Console.WriteLine("Pope.Agent: base nativa win-x64 · REQ-003-02/62");
            return 0;
        }

        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            if (!identity.IsSystem || Process.GetCurrentProcess().SessionId != 0)
                throw new InvalidOperationException();
            var (root, name) = args switch
            {
                [] or ["--service"] => (AgentService.Root, AgentService.Name),
                ["--service-test", var id] => (AgentService.TestRoot(id), AgentService.TestName(id)),
                _ => throw new InvalidOperationException()
            };
            using var service = new AgentService(root, name);
            ServiceBase.Run(service);
            return service.ExitCode;
        }
        catch
        {
            Console.Error.WriteLine("Pope.Agent requiere SCM, LocalSystem y configuración protegida válida.");
            return 1;
        }
    }
}
