using System.Diagnostics;
using System.Text.Json;
using Pope.Bridge;
using Xunit;

namespace Pope.Native.Tests;

public sealed class PipeSessionTests
{
    [Fact(DisplayName = "REQ-003-63: frame truncado en pipe real se rechaza antes de despachar")]
    public async Task TruncatedRealPipe()
    {
        using var retained = new RetainedProcess(Process.GetCurrentProcess());
        var name = PipeEndpoints.NewName(); using var server = PipeEndpoints.Create(name, retained);
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var waiting = server.WaitForConnectionAsync(stop.Token);
        using var client = await PipeEndpoints.Connect(name, retained, stop.Token); await waiting;
        var dispatched = 0;
        using var session = new PipeSession(server, "shell-request", "bridge-event", () => PipeEndpoints.IsHost(server, retained), (_, _) => { dispatched++; return Task.CompletedTask; });
        var running = session.RunAsync(stop.Token);
        await client.WriteAsync(new byte[] { 32, 0, 0, 0, 123 }, stop.Token);
        client.Dispose();
        await Assert.ThrowsAsync<EndOfStreamException>(() => running.WaitAsync(stop.Token));
        Assert.Equal(0, dispatched);
    }
    [Fact(DisplayName = "REQ-003-63: petición y notificación reales del pipe preservan correlación")]
    public async Task RoundTrip()
    {
        using var retained = new RetainedProcess(Process.GetCurrentProcess());
        var name = PipeEndpoints.NewName(); using var server = PipeEndpoints.Create(name, retained);
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var waiting = server.WaitForConnectionAsync(stop.Token);
        using var client = await PipeEndpoints.Connect(name, retained, stop.Token); await waiting;
        var received = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        PipeSession? session = null;
        session = new PipeSession(server, "shell-request", "bridge-event", () => PipeEndpoints.IsHost(server, retained), (bytes, _) =>
        {
            var request = ProtocolValidation.Parse(bytes, "shell-request");
            Assert.Equal("peticion", request.GetProperty("requestId").GetString());
            Assert.True(session!.TrySend(JsonSerializer.SerializeToUtf8Bytes(new
            {
                version = 1,
                kind = "message",
                elapsedSeconds = 0,
                message = new { type = "error", requestId = "peticion", code = "pause_unavailable", message = "No disponible" }
            })));
            received.TrySetResult(); return Task.CompletedTask;
        });
        using (session)
        {
            var running = session.RunAsync(stop.Token);
            try
            {
                await PipeFrames.WriteAsync(client, "{\"type\":\"pause\",\"requestId\":\"peticion\"}"u8.ToArray(), "shell-request", stop.Token);
                var response = await PipeFrames.ReadAsync(client, "bridge-event", stop.Token);
                Assert.Equal("peticion", ProtocolValidation.Parse(response, "bridge-event").GetProperty("message").GetProperty("requestId").GetString());
                await received.Task.WaitAsync(stop.Token);
            }
            finally { stop.Cancel(); try { await running; } catch (OperationCanceledException) { } }
        }
    }

    [Fact(DisplayName = "REQ-003-63: cliente que llena cola real se desconecta y cancela procesamiento")]
    public async Task QueueOverflow()
    {
        using var retained = new RetainedProcess(Process.GetCurrentProcess());
        var name = PipeEndpoints.NewName(); using var server = PipeEndpoints.Create(name, retained);
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var waiting = server.WaitForConnectionAsync(stop.Token);
        using var client = await PipeEndpoints.Connect(name, retained, stop.Token); await waiting;
        var processing = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var session = new PipeSession(server, "shell-request", "bridge-event", () => PipeEndpoints.IsHost(server, retained), async (_, token) =>
        { processing.TrySetResult(); await Task.Delay(Timeout.InfiniteTimeSpan, token); });
        var running = session.RunAsync(stop.Token);
        for (var index = 0; index < 34; index++)
        {
            await PipeFrames.WriteAsync(client, "{\"type\":\"logout\"}"u8.ToArray(), "shell-request", stop.Token);
            if (index == 0) await processing.Task.WaitAsync(stop.Token);
        }
        await Assert.ThrowsAsync<InvalidDataException>(() => running.WaitAsync(stop.Token));
    }
}
