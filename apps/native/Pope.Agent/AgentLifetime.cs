namespace Pope.Agent;

// REQ-003-02: el servicio no contiene UI; un único trabajo cancelable posee sus buffers.
internal sealed class AgentLifetime(AgentLog log, Func<AgentConfiguration> load,
    Func<AgentConfiguration, CancellationToken, Task> work, TimeSpan? stopTimeout = null) : IDisposable
{
    private readonly object gate = new();
    private CancellationTokenSource? cancellation;
    private Task? task;
    private bool started;
    internal bool Failed { get; private set; }
    internal event Action? Failure;

    internal void Start()
    {
        lock (gate)
        {
            if (started) throw new InvalidOperationException("El agente ya se inició.");
            AgentConfiguration configuration;
            try { configuration = load(); }
            catch { log.Write(AgentLogCode.ConfigurationRejected); throw new InvalidDataException("No se pudo cargar el agente."); }
            cancellation = new CancellationTokenSource();
            var token = cancellation.Token;
            try { log.Write(AgentLogCode.Started); }
            catch { configuration.Dispose(); cancellation.Dispose(); cancellation = null; throw; }
            started = true;
            task = Task.Run(async () =>
            {
                try
                {
                    await work(configuration, token).ConfigureAwait(false);
                    if (!token.IsCancellationRequested) ReportFailure();
                }
                catch (OperationCanceledException) when (token.IsCancellationRequested) { }
                catch { ReportFailure(); }
                finally { configuration.Dispose(); }
            });
        }
    }

    private void ReportFailure()
    {
        Failed = true;
        log.Write(AgentLogCode.RuntimeFailed);
        Failure?.Invoke();
    }

    internal void Stop()
    {
        Task? running;
        lock (gate)
        {
            if (cancellation == null) return;
            cancellation.Cancel();
            running = task;
        }
        if (running != null && !running.Wait(stopTimeout ?? TimeSpan.FromSeconds(5)))
        {
            Failed = true;
            throw new TimeoutException("El agente no terminó dentro del límite.");
        }
        lock (gate)
        {
            cancellation?.Dispose();
            cancellation = null;
            log.Write(AgentLogCode.Stopped);
        }
    }

    public void Dispose() => Stop();
}
