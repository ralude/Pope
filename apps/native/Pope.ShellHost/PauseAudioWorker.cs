namespace Pope.ShellHost;

// REQ-002-07: aplica PauseAudio fuera del hilo de la interfaz, en un MTA propio para COM.
// No actúa hasta conocer el estado del nodo: un host reiniciado en pausa no restaura el
// sonido unos instantes antes de recibir la copia del agente.
internal sealed class PauseAudioWorker : IDisposable
{
    private readonly PauseAudio audio;
    private readonly AutoResetEvent wake = new(false);
    private readonly Thread thread;
    private int desired = -1; // -1 desconocido, 0 sin pausa, 1 en pausa.
    private volatile bool stopping;

    internal PauseAudioWorker(PauseAudio audio)
    {
        this.audio = audio;
        thread = new Thread(Run) { IsBackground = true, Name = "Pope.PauseAudio" };
        thread.SetApartmentState(ApartmentState.MTA);
        thread.Start();
    }

    internal void Update(bool paused)
    {
        if (Interlocked.Exchange(ref desired, paused ? 1 : 0) != (paused ? 1 : 0)) wake.Set();
    }

    private void Run()
    {
        try { audio.Load(); } catch { /* Diario ilegible: se trata como ausente. */ }
        var pending = false;
        while (!stopping)
        {
            var state = Volatile.Read(ref desired);
            if (state >= 0)
            {
                // Errores de COM o de disco se reintentan; nunca cierran el host.
                try { pending = audio.Cycle(state == 1); } catch { pending = true; }
            }
            wake.WaitOne(pending ? 1000 : Timeout.Infinite);
        }
    }

    public void Dispose()
    {
        // Cerrar el host en pausa no restaura: el diario permite que el siguiente continúe.
        stopping = true; wake.Set();
        // Un ciclo COM colgado no debe usar un evento ya liberado.
        if (thread.Join(TimeSpan.FromSeconds(2))) wake.Dispose();
    }
}
