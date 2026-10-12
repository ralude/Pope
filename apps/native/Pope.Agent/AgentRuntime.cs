using System.Security.Cryptography;

namespace Pope.Agent;

internal sealed class AgentRuntime
{
    private readonly AgentChannel channel;
    internal AgentHostBridge Bridge { get; }
    internal AgentRuntime(string root, AgentConfiguration configuration, AgentLog log)
    {
        var state = new AgentState(configuration.PcId);
        byte[]? recovery = null;
        try { recovery = AgentCustody.ReadRecovery(root); if (recovery != null) state.Restore(recovery); }
        catch { log.Write(AgentLogCode.RecoveryRejected); }
        finally { if (recovery != null) CryptographicOperations.ZeroMemory(recovery); }
        state.RecoveryChanged += bytes =>
        {
            try { AgentCustody.StoreRecovery(root, bytes); }
            finally { CryptographicOperations.ZeroMemory(bytes); }
        };
        channel = new AgentChannel(configuration, log) { Hello = state.Hello, Heartbeat = state.Heartbeat };
        channel.Message += state.Apply;
        Bridge = new AgentHostBridge(channel, state, configuration.PcName);
    }
    internal async Task RunAsync(CancellationToken token)
    {
        // T22 entregará a Bridge el proceso real del host que lance/supervise en la sesión cliente.
        using (Bridge) { Bridge.Subscribe(); await channel.RunAsync(token); }
    }
}
