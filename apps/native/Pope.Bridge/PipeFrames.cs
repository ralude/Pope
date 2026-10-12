using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading.Channels;

namespace Pope.Bridge;

// REQ-003-63: longitud little-endian antes del JSON; no reservar según longitud sin validar.
internal static class PipeFrames
{
    internal static async Task<byte[]> ReadAsync(Stream stream, string contract, CancellationToken token)
    {
        var header = new byte[4];
        await stream.ReadExactlyAsync(header, token);
        var size = BinaryPrimitives.ReadInt32LittleEndian(header);
        if (size is < 1 or > ProtocolValidation.MaximumBytes) throw new InvalidDataException("Frame fuera de límites.");
        var bytes = new byte[size];
        try
        {
            await stream.ReadExactlyAsync(bytes, token);
            var value = ProtocolValidation.Parse(bytes, contract);
            var normalized = JsonSerializer.SerializeToUtf8Bytes(value);
            if (normalized.Length <= ProtocolValidation.MaximumBytes) return normalized;
            CryptographicOperations.ZeroMemory(normalized);
            throw new InvalidDataException("Frame fuera de límites.");
        }
        finally { CryptographicOperations.ZeroMemory(bytes); }
    }

    internal static async Task WriteAsync(Stream stream, ReadOnlyMemory<byte> bytes, string contract, CancellationToken token)
    {
        ProtocolValidation.Parse(bytes, contract);
        var header = new byte[4]; BinaryPrimitives.WriteInt32LittleEndian(header, bytes.Length);
        await stream.WriteAsync(header, token);
        await stream.WriteAsync(bytes, token);
        await stream.FlushAsync(token);
    }
}

internal sealed class FrameQueue : IDisposable
{
    internal const int MaximumCount = 32;
    private readonly Channel<byte[]> channel = Channel.CreateBounded<byte[]>(new BoundedChannelOptions(MaximumCount)
    {
        SingleReader = true,
        SingleWriter = false,
        FullMode = BoundedChannelFullMode.Wait
    });
    internal ChannelReader<byte[]> Reader => channel.Reader;
    internal bool TryAdd(byte[] bytes)
    {
        if (bytes.Length is > 0 and <= ProtocolValidation.MaximumBytes && channel.Writer.TryWrite(bytes)) return true;
        CryptographicOperations.ZeroMemory(bytes); return false;
    }
    public void Dispose()
    {
        channel.Writer.TryComplete();
        while (channel.Reader.TryRead(out var bytes)) CryptographicOperations.ZeroMemory(bytes);
    }
}
