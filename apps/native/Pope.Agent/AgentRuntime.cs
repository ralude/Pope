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
        // T32: el host muestra los mensajes; 10 s para confirmar que la ventana es visible.
        // T40: salidas del mantenimiento pendientes de reconocer; un diario corrupto se descarta y el
        // nodo ya no las pediría: como mucho se pierde una salida que él no llegó a ver.
        IReadOnlyList<ExitEntry> exits = [];
        try { exits = AgentCustody.ReadExitJournal(root); }
        catch { log.Write(AgentLogCode.ExitJournalRejected); }
        var maintenance = new AgentMaintenance(exits, entries => AgentCustody.StoreExitJournal(root, entries), channel.SendMessageAsync,
            // T37 cerrará aquí la sesión de Windows de mantenimiento; hasta entonces no hay nada que cerrar.
            _ => Task.FromResult(true),
            async _ => { state.EndLocalSession(); return await cleanup.Settled() == 0; },
            () => state.Control().NodeNow, log: log);
        state.PendingExit = maintenance.FirstPending;
        Bridge.EndMaintenance = maintenance.EndForShellAsync;
        channel.Message += maintenance.OnMessage;
        // Al reconectar se reenvían las salidas pendientes hasta que el nodo las reconozca.
        channel.ConnectionChanged += online => { if (online) _ = maintenance.ResendPendingAsync(CancellationToken.None); };
        var commands = new AgentCommands(state, cleanup, channel.SendMessageAsync, log, power,
            (id, text, token) => Bridge.ShowStaffMessageAsync(id, text, TimeSpan.FromSeconds(10), token), maintenance);
        channel.Message += commands.OnMessage;
    }
    internal async Task RunAsync(CancellationToken token)
    {
        // T22 entregará a Bridge el proceso real del host que lance/supervise en la sesión cliente.
        using (Bridge) { Bridge.Subscribe(); await channel.RunAsync(token); }
    }
}
