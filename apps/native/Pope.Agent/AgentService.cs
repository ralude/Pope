using System.ServiceProcess;
using System.Security.Cryptography;

namespace Pope.Agent;

internal sealed class AgentService : ServiceBase
{
    private readonly AgentLifetime lifetime;
    internal const string Name = "Pope.Agent";
    internal static string Root => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Pope", "Agent");
    internal static string TestName(string id) => "Pope.Agent.Test." + Guid.ParseExact(id, "N").ToString("N");
    internal static string TestRoot(string id) => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "PopeAgentTest-" + Guid.ParseExact(id, "N").ToString("N"));

    internal AgentService(string root, string name)
    {
        ServiceName = name;
        AutoLog = false; // Los logs propios solo aceptan códigos cerrados y están acotados.
        CanStop = true;
        CanShutdown = true;
        var log = new AgentLog(root);
        lifetime = new AgentLifetime(log, () => AgentCustody.Read(root),
            (configuration, token) => RunChannel(root, configuration, log, token));
        lifetime.Failure += () => ThreadPool.QueueUserWorkItem(_ => Stop());
    }

    private static Task RunChannel(string root, AgentConfiguration configuration, AgentLog log, CancellationToken token)
    {
        var state = new AgentState(configuration.PcId);
        byte[]? recovery = null;
        try { recovery = AgentCustody.ReadRecovery(root); if (recovery != null) state.Restore(recovery); }
        catch { log.Write(AgentLogCode.RecoveryRejected); } // Copia inválida: unknown, nunca cierre inventado.
        finally { if (recovery != null) CryptographicOperations.ZeroMemory(recovery); }
        state.RecoveryChanged += bytes =>
        {
            try { AgentCustody.StoreRecovery(root, bytes); }
            finally { CryptographicOperations.ZeroMemory(bytes); }
        };
        var channel = new AgentChannel(configuration, log) { Hello = state.Hello, Heartbeat = state.Heartbeat };
        channel.Message += state.Apply;
        return channel.RunAsync(token);
    }

    protected override void OnStart(string[] args)
    {
        try { lifetime.Start(); }
        catch { ExitCode = 13; throw new InvalidOperationException("No se pudo iniciar el agente."); }
    }
    protected override void OnStop()
    {
        try { lifetime.Stop(); if (lifetime.Failed) ExitCode = 1; }
        catch { ExitCode = 1; }
    }
    protected override void OnShutdown() => OnStop();
    protected override void Dispose(bool disposing)
    {
        if (disposing) lifetime.Dispose();
        base.Dispose(disposing);
    }
}
