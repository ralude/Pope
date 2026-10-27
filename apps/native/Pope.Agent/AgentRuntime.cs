using System.Security.Cryptography;

namespace Pope.Agent;

internal sealed class AgentRuntime
{
    private readonly AgentChannel channel;
    private readonly AgentState state;
    private readonly AgentLog log;
    private readonly string root;
    private AgentConfiguration current;
    private readonly AgentConfiguration initial;
    private DateTime loadedStamp;
    internal AgentHostBridge Bridge { get; }
    internal AgentRuntime(string root, AgentConfiguration configuration, AgentLog log)
    {
        this.root = root; this.log = log; current = configuration; initial = configuration;
        loadedStamp = ConfigurationStamp();
        state = new AgentState(configuration.PcId);
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
        // REQ-003-73: la carpeta de fondos debe existir, con sus permisos, antes de que se lance el host.
        // Si no es la esperada no hay fondo personalizado: el Shell usa el de Pope.
        var background = BackgroundSetup.Create(BackgroundSetup.DirectoryFor(root),
            directory => BackgroundFolder.Prepare(directory, requireSystemOwner: true), () => current, Bridge.PublishBackground, log);
        if (background != null) channel.Message += background.OnMessage;
        var commands = new AgentCommands(state, cleanup, channel.SendMessageAsync, log, power,
            (id, text, token) => Bridge.ShowStaffMessageAsync(id, text, TimeSpan.FromSeconds(10), token), maintenance);
        channel.Message += commands.OnMessage;
    }
    private DateTime ConfigurationStamp() => File.GetLastWriteTimeUtc(Path.Combine(root, "configuration.bin"));

    // T34 · REQ-003-11: con la credencial revocada el canal espera. Cuando la custodia cambia (el asistente
    // guardó la credencial nueva), se carga y el canal reintenta; el rechazo anterior deja de valer.
    private async Task WatchConfigurationAsync(TimeSpan interval, CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            await Task.Delay(interval, token);
            if (!channel.AwaitingConfiguration) continue;
            var stamp = ConfigurationStamp();
            if (stamp == loadedStamp) continue;
            loadedStamp = stamp;
            AgentConfiguration fresh;
            try { fresh = AgentCustody.Read(root); }
            catch { log.Write(AgentLogCode.ConfigurationRejected); continue; }
            var previous = current;
            current = fresh;
            state.ClearRejection();
            channel.UseConfiguration(fresh);
            // La configuración inicial la dispone el ciclo de vida; solo las cargadas aquí.
            if (!ReferenceEquals(previous, initial)) previous.Dispose();
        }
    }

    internal async Task RunAsync(CancellationToken token)
    {
        // T22 entregará a Bridge el proceso real del host que lance/supervise en la sesión cliente.
        using (Bridge)
        {
            Bridge.Subscribe();
            using var watching = CancellationTokenSource.CreateLinkedTokenSource(token);
            var watcher = WatchConfigurationAsync(ConfigurationPoll, watching.Token);
            try { await channel.RunAsync(token); }
            finally
            {
                watching.Cancel();
                try { await watcher; } catch (OperationCanceledException) { }
                if (!ReferenceEquals(current, initial)) current.Dispose();
            }
        }
    }

    internal TimeSpan ConfigurationPoll { get; init; } = TimeSpan.FromSeconds(5);
}
