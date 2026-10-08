using System.ServiceProcess;

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

        // T08 solo prepara el ejecutable. T15 implementará el ciclo de vida;
        // impedir su uso como servicio vacío evita aparentar que ya protege la PC.
        Console.Error.WriteLine("Servicio aún no implementado (T15).");
        return 1;
    }
}

// ServiceBase es la API oficial del SCM; no instala ni arranca un servicio en T08.
internal sealed class AgentService : ServiceBase
{
    public AgentService() => ServiceName = "Pope.Agent";
}
