using System.Security.Cryptography;

namespace Pope.Bridge;

// REQ-003-63: lectura, procesamiento y escritura separados, cada cola como máximo 32 frames.
internal sealed class PipeSession(Stream stream, string incomingContract, string outgoingContract,
    Func<bool> peerIsValid, Func<byte[], CancellationToken, Task> handle) : IDisposable
{
    private readonly FrameQueue incoming = new();
    private readonly FrameQueue outgoing = new();
    private readonly CancellationTokenSource stopping = new();
    private int started;

    // Transfiere propiedad del buffer; no conservarlo ni reutilizarlo después de llamar.
    internal bool TrySend(byte[] bytes)
    {
        try
        {
            ProtocolValidation.Parse(bytes, outgoingContract);
            if (outgoing.TryAdd(bytes)) return true;
        }
        catch { CryptographicOperations.ZeroMemory(bytes); }
        Close(); return false;
    }
    internal void Close() { try { stopping.Cancel(); } catch (ObjectDisposedException) { } }

    internal async Task RunAsync(CancellationToken token)
    {
        if (Interlocked.Exchange(ref started, 1) != 0) throw new InvalidOperationException("Puente ya iniciado.");
        using var connection = CancellationTokenSource.CreateLinkedTokenSource(token, stopping.Token);
        if (!peerIsValid()) throw new UnauthorizedAccessException("Proceso del puente no válido.");
        var reader = Read(connection.Token);
        var processor = Process(connection.Token);
        var writer = Write(connection.Token);
        try { await await Task.WhenAny(reader, processor, writer); }
        finally
        {
            connection.Cancel();
            try { await Task.WhenAll(reader, processor, writer); } catch { }
            incoming.Dispose(); outgoing.Dispose();
        }
    }

    private async Task Read(CancellationToken token)
    {
        while (true)
        {
            var bytes = await PipeFrames.ReadAsync(stream, incomingContract, token);
            if (!peerIsValid()) { CryptographicOperations.ZeroMemory(bytes); throw new UnauthorizedAccessException("Proceso del puente no válido."); }
            if (!incoming.TryAdd(bytes)) throw new InvalidDataException("Cola del puente llena.");
        }
    }
    private async Task Process(CancellationToken token)
    {
        await foreach (var bytes in incoming.Reader.ReadAllAsync(token))
        {
            try
            {
                if (!peerIsValid()) throw new UnauthorizedAccessException("Proceso del puente no válido.");
                await handle(bytes, token);
            }
            finally { CryptographicOperations.ZeroMemory(bytes); }
        }
    }
    private async Task Write(CancellationToken token)
    {
        await foreach (var bytes in outgoing.Reader.ReadAllAsync(token))
        {
            try
            {
                if (!peerIsValid()) throw new UnauthorizedAccessException("Proceso del puente no válido.");
                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
                deadline.CancelAfter(TimeSpan.FromSeconds(5));
                await PipeFrames.WriteAsync(stream, bytes, outgoingContract, deadline.Token);
            }
            finally { CryptographicOperations.ZeroMemory(bytes); }
        }
    }
    public void Dispose() { Close(); incoming.Dispose(); outgoing.Dispose(); stopping.Dispose(); }
}
