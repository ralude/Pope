using System.Buffers.Binary;
using System.Text.Json;
using Pope.Bridge;
using Xunit;

namespace Pope.Native.Tests;

public sealed class PipeFrameTests
{
    [Fact(DisplayName = "REQ-003-63: framing soporta fragmentación y rechaza cabecera/cuerpo truncados")]
    public async Task FragmentedAndTruncated()
    {
        var request = "{\"type\":\"logout\",\"requestId\":\"peticion\"}"u8.ToArray();
        using var stream = new FragmentedStream();
        await PipeFrames.WriteAsync(stream, request, "shell-request", CancellationToken.None);
        var complete = stream.ToArray(); stream.Position = 0;
        var restored = await PipeFrames.ReadAsync(stream, "shell-request", CancellationToken.None);
        Assert.True(JsonElement.DeepEquals(JsonDocument.Parse(request).RootElement, JsonDocument.Parse(restored).RootElement));
        foreach (var length in new[] { 0, 1, 3, complete.Length - 1 })
        {
            using var truncated = new MemoryStream(complete[..length]);
            await Assert.ThrowsAsync<EndOfStreamException>(() => PipeFrames.ReadAsync(truncated, "shell-request", CancellationToken.None));
        }
    }

    [Fact(DisplayName = "REQ-003-63: longitud inválida y cola llena descartan buffers sin crecer")]
    public async Task LimitsAndQueue()
    {
        foreach (var size in new[] { -1, 0, 16_385, int.MaxValue })
        {
            var header = new byte[4]; BinaryPrimitives.WriteInt32LittleEndian(header, size);
            using var stream = new MemoryStream(header);
            await Assert.ThrowsAsync<InvalidDataException>(() => PipeFrames.ReadAsync(stream, "shell-request", CancellationToken.None));
        }
        var queue = new FrameQueue(); var buffers = new List<byte[]>();
        for (var index = 0; index < FrameQueue.MaximumCount; index++)
        {
            var bytes = new byte[] { 1, 2, 3 }; buffers.Add(bytes); Assert.True(queue.TryAdd(bytes));
        }
        var excess = new byte[] { 3, 2, 1 }; Assert.False(queue.TryAdd(excess)); Assert.All(excess, b => Assert.Equal(0, b));
        queue.Dispose(); Assert.All(buffers, bytes => Assert.All(bytes, b => Assert.Equal(0, b)));
        Assert.False(queue.TryAdd([1]));
    }

    [Fact(DisplayName = "REQ-003-63: recorte ECMAScript anidado conserva password y rechaza duplicados")]
    public void UsernameOnly()
    {
        var message = JsonSerializer.SerializeToUtf8Bytes(new { version = 1, kind = "request", request = new { type = "login", username = " \ufeffana\u3000", password = "  prueba  " } });
        var value = ProtocolValidation.Parse(message, "bridge-request");
        Assert.Equal("ana", value.GetProperty("request").GetProperty("username").GetString());
        Assert.Equal("  prueba  ", value.GetProperty("request").GetProperty("password").GetString());
        Assert.Throws<InvalidDataException>(() => ProtocolValidation.Parse("{\"type\":\"login\",\"username\":\"a\",\"username\":\"b\",\"password\":\"p\"}"u8.ToArray(), "shell-request"));
    }

    private sealed class FragmentedStream : MemoryStream
    {
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default) => base.ReadAsync(buffer[..Math.Min(1, buffer.Length)], token);
    }
}
