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
        // REQ-003-34: el ámbito del cliente necesita el host asociado (lanzamiento/supervisión en T22).
        var cleanup = new ClientSessionCleanup(() => Bridge.Host, ClientProcesses.Snapshot, ClientProcesses.Close, scope =>
        {
            try { AgentCustody.StoreScope(root, scope); }
            catch { log.Write(AgentLogCode.ClientScopeRejected); }
        }, log);
        try { cleanup.Restore(AgentCustody.ReadScope(root)); }
        catch { log.Write(AgentLogCode.ClientScopeRejected); }
        state.SessionStarted += cleanup.Started;
        state.SessionFinished += id => _ = cleanup.Finished(id);
        // T29: después de state.Apply, que ya guardó el controlState con el que se compara la orden.
        // T31: un diario corrupto se descarta; como mucho se repetiría una orden ya ejecutada.
        IReadOnlyList<PowerEntry> journal = [];
        try { journal = AgentCustody.ReadPowerJournal(root); }
        catch { log.Write(AgentLogCode.PowerJournalRejected); }
        var power = new AgentPower(kind => WindowsPower.Initiate(kind), journal, entries => AgentCustody.StorePowerJournal(root, entries));
        var commands = new AgentCommands(state, cleanup, channel.SendMessageAsync, log, power);
        channel.Message += commands.OnMessage;
    }
    internal async Task RunAsync(CancellationToken token)
    {
        // T22 entregará a Bridge el proceso real del host que lance/supervise en la sesión cliente.
        using (Bridge) { Bridge.Subscribe(); await channel.RunAsync(token); }
    }
}
